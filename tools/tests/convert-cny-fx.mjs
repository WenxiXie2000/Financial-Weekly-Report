import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  computeRange,
  fmtISO,
  SHEET_PROFILES,
} from "../../js/sheet-profiles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pad2 = (value) => String(value).padStart(2, "0");

function toDate(value) {
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }
  if (typeof value === "number") {
    const base = new Date(Date.UTC(1899, 11, 30));
    const millis = value * 86400000;
    const date = new Date(base.getTime() + millis);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
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
      ? String(pattern).replace(/^\/|\/[a-z]*$/gi, "")
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

function formatNumber4(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    if (Number.isNaN(val)) return null;
    return val.toFixed(4);
  }
  const s = String(val).trim();
  if (!s) return null;
  const num = Number(s.replace(/,/g, ""));
  return Number.isNaN(num) ? null : num.toFixed(4);
}

function formatPercent4(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    if (Number.isNaN(val)) return null;
    return `${val.toFixed(4)}%`;
  }
  const s = String(val).trim();
  if (!s) return null;
  if (s.endsWith("%")) {
    const num = Number(s.slice(0, -1).replace(/,/g, ""));
    return Number.isNaN(num) ? `${s}` : `${num.toFixed(4)}%`;
  }
  const num = Number(s.replace(/,/g, ""));
  return Number.isNaN(num) ? `${s}` : `${num.toFixed(4)}%`;
}

const htmlPath = path.resolve(__dirname, "../xlsx-to-json.html");
const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("const convertCnyFx =");
if (start === -1) {
  throw new Error("convertCnyFx definition not found in xlsx-to-json.html");
}
const end = html.indexOf("const convertEquityCn", start);
if (end === -1) {
  throw new Error(
    "anchor for convertEquityCn not found when extracting convertCnyFx"
  );
}
const snippet = html.slice(start, end);

const sandbox = {
  console,
  fmtISO,
  computeRange,
  normalizeHeaderLabel,
  findColIndex,
  closestHeaders,
  describeMatcher,
  parseNumberLike,
  parsePercentNumber,
  formatNumber4,
  formatPercent4,
  deriveRange,
};

vm.createContext(sandbox);
vm.runInContext(`${snippet}\nthis.convertCnyFx = convertCnyFx;`, sandbox);
const convertCnyFx = sandbox.convertCnyFx;
if (typeof convertCnyFx !== "function") {
  throw new Error("convertCnyFx extraction failed");
}

const profile = SHEET_PROFILES["人民币汇率"];
assert.ok(profile, "sheet profile for 人民币汇率 is missing");

const header = [
  "日期",
  "人民币兑美元汇率（汇率）",
  "人民币兑美元涨跌幅（%）",
  "人民币兑美元央行中间价",
  "人民币兑美元央行中间价调整情况",
  "离岸人民币兑美元汇率",
  "离岸人民币兑美元涨跌幅（%）",
  "人民币兑欧元汇率",
  "人民币兑欧元涨跌幅（%）",
  "人民币兑欧元央行中间价",
  "人民币兑欧元央行中间价调整情况",
  "人民币兑100日元汇率",
  "人民币兑100日元涨跌幅（%）",
  "人民币兑100日元央行中间价",
  "人民币兑100日元央行中间价调整情况",
  "人民币兑澳元汇率",
  "人民币兑澳元涨跌幅（%）",
  "人民币兑澳元央行中间价",
  "人民币兑澳元央行中间价调整情况",
];

const makeRow = (
  date,
  [usd, usdChg, usdMid, usdMidChg],
  [cnh, cnhChg],
  [eur, eurChg, eurMid, eurMidChg],
  [jpy, jpyChg, jpyMid, jpyMidChg],
  [aud, audChg, audMid, audMidChg]
) => [
  date,
  usd,
  usdChg,
  usdMid,
  usdMidChg,
  cnh,
  cnhChg,
  eur,
  eurChg,
  eurMid,
  eurMidChg,
  jpy,
  jpyChg,
  jpyMid,
  jpyMidChg,
  aud,
  audChg,
  audMid,
  audMidChg,
];

const rows = [
  header,
  makeRow(
    "2025-09-22",
    [7.1201, "0.0800%", 7.1001, "0.0200%"],
    [7.132, "0.0700%"],
    [7.8605, "-0.0500%", 7.842, "-0.0300%"],
    [5.2101, "0.0100%", 5.19, "0.0050%"],
    [4.6123, "0.0200%", 4.59, "0.0100%"]
  ),
  makeRow(
    "2025-09-23",
    [7.1185, "-0.0500%", 7.102, "-0.0100%"],
    [7.1255, "-0.0400%"],
    [7.8503, "0.0200%", 7.8325, "0.0100%"],
    [5.2052, "-0.0150%", 5.185, "-0.0080%"],
    [4.6082, "-0.0300%", 4.585, "-0.0150%"]
  ),
  makeRow(
    "2025-09-24",
    [7.115, "-0.0300%", 7.099, "-0.0050%"],
    [7.1208, "-0.0200%"],
    [7.8481, "0.0150%", 7.83, "0.0080%"],
    [5.202, "0.0120%", 5.1825, "0.0060%"],
    [4.605, "0.0250%", 4.582, "0.0120%"]
  ),
  makeRow(
    "2025-09-25",
    [7.1102, "-0.0200%", 7.095, "-0.0040%"],
    [7.118, "-0.0150%"],
    [7.8425, "-0.0100%", 7.825, "-0.0060%"],
    [5.1988, "0.0080%", 5.179, "0.0040%"],
    [4.601, "0.0180%", 4.578, "0.0090%"]
  ),
  makeRow(
    "2025-09-26",
    [7.1055, "-0.0180%", 7.092, "-0.0030%"],
    [7.1122, "-0.0120%"],
    [7.838, "-0.0150%", 7.82, "-0.0090%"],
    [5.195, "0.0070%", 5.175, "0.0030%"],
    [4.5985, "0.0160%", 4.5755, "0.0070%"]
  ),
];

const result = convertCnyFx(rows, profile);

assert.equal(
  result.series.length >= 6,
  true,
  "series should include currency metrics"
);
const seriesNames = result.series.map((item) => item.name);
assert.ok(seriesNames.includes("人民币兑美元 汇率"), "missing USD rate series");
assert.ok(
  seriesNames.includes("人民币兑美元 涨跌幅(%)"),
  "missing USD change series"
);
assert.ok(
  seriesNames.includes("人民币兑欧元 央行中间价"),
  "missing EUR mid series"
);
assert.ok(
  seriesNames.includes("人民币兑澳元 央行中间价调整(%)"),
  "missing AUD mid change series"
);

const usdRateSeries = result.series.find(
  (item) => item.name === "人民币兑美元 汇率"
);
assert.equal(
  usdRateSeries.data.length,
  5,
  "USD rate series should have 5 points"
);
assert.deepEqual(usdRateSeries.data[0], ["2025-09-22", 7.1201]);

assert.equal(result.kpis.usdcny_mid, "7.0920", "USD mid KPI");
assert.equal(result.kpis.usdcny_mid_chg, "-0.0030%", "USD mid change KPI");
assert.equal(result.kpis.cnhusd_mid, null, "CNH mid KPI should be null");
assert.equal(result.export_info.rows, 5, "export rows count mismatch");
assert.ok(
  Array.isArray(result.table) && result.table.length === 5,
  "table should keep 5 rows"
);
assert.ok(
  result.diagnostics.some((d) => d.label === "人民币兑美元汇率" && d.matched),
  "diagnostics should mark USD rate matched"
);

console.log("convertCnyFx self-check passed");
