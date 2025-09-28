import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fmtISO, SHEET_PROFILES } from "../../js/sheet-profiles.js";
import { prevCompletedWeekRange, mondayOf, fridayOf } from "../../js/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pad2 = (value) => String(value).padStart(2, "0");

function excelSerialToDate(serial) {
  if (typeof serial !== "number" || Number.isNaN(serial)) return null;
  const base = new Date(Date.UTC(1899, 11, 30));
  const millis = serial * 86400000;
  const date = new Date(base.getTime() + millis);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDate(value) {
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }
  if (typeof value === "number") {
    return excelSerialToDate(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.includes("/")
      ? trimmed
      : trimmed.replace(/-/g, "/");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }
  return null;
}

function toISODateSafe(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = pad2(value.getMonth() + 1);
    const day = pad2(value.getDate());
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalized = text.replace(/\//g, "-");
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = pad2(parsed.getMonth() + 1);
    const day = pad2(parsed.getDate());
    return `${year}-${month}-${day}`;
  }
  return text;
}

function deriveRange(series = []) {
  let minDate = null;
  let maxDate = null;
  series.forEach((item) => {
    if (!item || !Array.isArray(item.data)) return;
    item.data.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length === 0) return;
      const raw = entry[0];
      const parsed = toDate(raw) || new Date(raw);
      if (!parsed || Number.isNaN(parsed.getTime())) return;
      if (!minDate || parsed < minDate) {
        minDate = new Date(parsed.getTime());
      }
      if (!maxDate || parsed > maxDate) {
        maxDate = new Date(parsed.getTime());
      }
    });
  });
  if (!minDate || !maxDate) {
    return null;
  }
  return [toISODateSafe(minDate), toISODateSafe(maxDate)];
}

function normalizeHeaderLabel(input) {
  const s = String(input ?? "").trim();
  let t = s.replace(/\s+/g, "");
  t = t.replace(/[（(][^）)]*[）)]\s*$/, "");
  return t;
}

function describeMatcher(matcher) {
  if (Array.isArray(matcher)) {
    return matcher.map((item) => describeMatcher(item)).join(" / ");
  }
  if (matcher instanceof RegExp) return matcher.toString();
  return String(matcher ?? "");
}

function findColIndex(header, matcher) {
  if (!Array.isArray(header)) return -1;
  let idx = header.findIndex((h) =>
    matcher instanceof RegExp ? matcher.test(String(h)) : String(h) === matcher
  );
  if (idx >= 0) return idx;
  const norm = header.map((h) => normalizeHeaderLabel(h));
  if (matcher instanceof RegExp) {
    return norm.findIndex((h) => matcher.test(h));
  }
  const want = normalizeHeaderLabel(matcher);
  return norm.findIndex((h) => h === want);
}

function closestHeaders(header, pattern, topK = 3) {
  const raw =
    pattern instanceof RegExp
      ? String(pattern).replace(/^\/?|\/[a-z]*$/gi, "")
      : String(pattern ?? "");
  const target = normalizeHeaderLabel(raw);
  const score = (a, b) => {
    const s = normalizeHeaderLabel(a);
    const t = normalizeHeaderLabel(b);
    const m = s.length;
    const n = t.length;
    if (!m || !n) return 0;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        if (s[i - 1] === t[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp[m][n] / Math.max(m, n);
  };
  const ranked = header
    .map((h) => {
      const column = String(h ?? "");
      return [column, score(column, target)];
    })
    .sort((a, b) => b[1] - a[1]);
  return ranked
    .slice(0, topK)
    .map(([col]) => col)
    .filter(Boolean);
}

function parsePercentNumber(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (!s) return null;
  const normalized = s.endsWith("%") ? s.slice(0, -1) : s;
  const num = Number(normalized.replace(/,/g, ""));
  return Number.isNaN(num) ? null : num;
}

function parseNumberLike(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") return val;
  const num = Number(String(val).trim().replace(/,/g, ""));
  return Number.isNaN(num) ? null : num;
}

function isWeekday(d) {
  return (
    d instanceof Date &&
    !Number.isNaN(d.getTime()) &&
    d.getDay() >= 1 &&
    d.getDay() <= 5
  );
}

function toDateSafe(value) {
  const date = toDate(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function computePrevWeekWorkdays(rows, dateIdx, now = new Date()) {
  if (!Array.isArray(rows) || typeof dateIdx !== "number") return [];
  const enriched = rows
    .map((row) => ({ row, date: toDateSafe(row?.[dateIdx]) }))
    .filter((item) => item.row && item.date);
  if (!enriched.length) return [];
  const { mon, fri } = prevCompletedWeekRange(now);
  const clamp = (items, start, end) =>
    items.filter(({ date }) => date >= start && date <= end && isWeekday(date));
  const withinCompleted = clamp(enriched, mon, fri);
  if (withinCompleted.length) {
    return withinCompleted;
  }
  const latestEntry = enriched.reduce((prev, cur) =>
    cur.date > prev.date ? cur : prev
  );
  if (!latestEntry || !latestEntry.date) return [];
  const fallbackMon = mondayOf(latestEntry.date);
  const fallbackFri = fridayOf(latestEntry.date);
  if (!fallbackMon || !fallbackFri) return [];
  return clamp(enriched, fallbackMon, fallbackFri);
}

const htmlPath = path.resolve(__dirname, "../xlsx-to-json.html");
const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("const convertGroupListed =");
if (start === -1) {
  throw new Error(
    "convertGroupListed definition not found in xlsx-to-json.html"
  );
}
const end = html.indexOf("const convertCnyFx", start);
if (end === -1) {
  throw new Error(
    "anchor for convertCnyFx not found when extracting convertGroupListed"
  );
}
const snippet = html.slice(start, end);

const sandbox = {
  console,
  fmtISO,
  normalizeHeaderLabel,
  findColIndex,
  closestHeaders,
  parseNumberLike,
  parsePercentNumber,
  deriveRange,
  computePrevWeekWorkdays,
  toDateSafe,
  describeMatcher,
};

vm.createContext(sandbox);
vm.runInContext(
  `${snippet}\nthis.convertGroupListed = convertGroupListed;`,
  sandbox
);
const convertGroupListed = sandbox.convertGroupListed;
if (typeof convertGroupListed !== "function") {
  throw new Error("convertGroupListed extraction failed");
}

const profile = SHEET_PROFILES["国能上市公司"];
assert.ok(profile, "sheet profile for 国能上市公司 is missing");

const companies = [
  { key: "GDDL", name: "国电电力" },
  { key: "ZGSH", name: "中国神华" },
  { key: "LYDL", name: "龙源电力" },
  { key: "CYDL", name: "长源电力" },
  { key: "LYJS", name: "龙源技术" },
  { key: "YLT", name: "英力特" },
];

const header = ["日期"];
companies.forEach((company) => {
  const name = company.name;
  header.push(`${name}收盘价`);
  header.push(`${name}涨跌幅（%）`);
  header.push(`${name}成交金额（亿元）`);
  header.push(`${name}成交金额变化（%）`);
  header.push(`${name}主力资金流向（亿元）`);
  header.push(`${name}市盈率（倍）`);
  header.push(`${name}市净率（倍）`);
  header.push(`${name}每日偏离值（%）`);
  header.push(`${name}换手率比值（%）`);
});

const startDate = new Date("2025-09-22T00:00:00Z");
const rows = [header];

for (let day = 0; day < 5; day += 1) {
  const date = new Date(startDate.getTime() + day * 86400000);
  const iso = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;
  const row = [iso];
  companies.forEach((company, index) => {
    const baseClose = 10 + index * 2 + day * 0.11;
    row.push(baseClose.toFixed(2));

    const chg = 0.1 * (day + 1) + index * 0.05;
    row.push(`${chg.toFixed(2)}%`);

    const amount = 100 + index * 12 + day;
    row.push(amount.toFixed(1));

    const amountChg = 0.6 * (day + 1) + index * 0.12;
    row.push(`${amountChg.toFixed(2)}%`);

    const mainflow = (index % 2 === 0 ? 45 : -32) + day * 1.5;
    row.push(mainflow.toFixed(1));

    const pe = 15 + index * 1.8 + day * 0.2;
    row.push(pe.toFixed(2));

    const pb = 1.2 + index * 0.15 + day * 0.05;
    row.push(pb.toFixed(2));

    const bias = 0.2 * (day + 1) + index * 0.04;
    row.push(`${bias.toFixed(2)}%`);

    const tratio = 1 + index * 0.1 + day * 0.3;
    row.push(`${tratio.toFixed(2)}%`);
  });
  rows.push(row);
}

const result = convertGroupListed(rows, profile);

assert.equal(
  result.series.length,
  companies.length * 9,
  "each company should produce nine series"
);

const gddlClose = result.series.find((s) => s.name === "国电电力 收盘");
assert.ok(gddlClose, "missing 国电电力 收盘 series");
assert.equal(gddlClose.data.length, 5, "收盘 series should follow week length");
assert.deepEqual(
  gddlClose.data[0],
  ["2025-09-22", Number((10 + 0 * 2 + 0 * 0.11).toFixed(2))],
  "first close point mismatch"
);

const zgshChg = result.series.find((s) => s.name === "中国神华 涨跌幅(%)");
assert.ok(zgshChg, "missing 中国神华 涨跌幅 series");
assert.equal(
  zgshChg.data[1][1],
  Number((0.1 * 2 + 1 * 0.05).toFixed(2)),
  "涨跌幅 parsing error"
);

const lyjsFlow = result.series.find(
  (s) => s.name === "龙源技术 主力资金流向(亿)"
);
assert.ok(lyjsFlow, "missing 龙源技术 主力资金流向 series");
assert.ok(
  lyjsFlow.data.some(([, v]) => v < 0),
  "主力资金流向 should preserve negative numbers"
);

assert.equal(result.table.length, 5, "table should retain filtered rows");
assert.ok(
  Object.prototype.hasOwnProperty.call(result.table[0], "国电电力收盘价"),
  "table should keep original column headers"
);

assert.equal(result.export_info.rows, 5, "export rows mismatch");
assert.deepEqual(
  result.export_info.range_window,
  ["2025-09-22", "2025-09-26"],
  "range window should cover the week"
);

const unmatched = (result.diagnostics || []).filter((item) => !item.matched);
assert.equal(unmatched.length, 0, "all metrics should match columns");

console.log("convertGroupListed self-check passed");
