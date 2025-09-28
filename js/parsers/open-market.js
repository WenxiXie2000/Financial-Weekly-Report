import { prevCompletedWeekRange, mondayOf, fridayOf } from "../utils.js";
import { toDateSafe, isWeekday } from "../sheet-profiles.js";

export function normalizeHeaderLabel(input) {
  const s = String(input ?? "").trim();
  let t = s.replace(/\s+/g, "");
  t = t.replace(/[（(][^）)]*[）)]\s*$/, "");
  return t;
}

export function findColIndex(header, matcher) {
  let idx = header.findIndex((h) =>
    matcher instanceof RegExp ? matcher.test(String(h)) : String(h) === matcher
  );
  if (idx >= 0) return idx;
  const norm = header.map(normalizeHeaderLabel);
  if (matcher instanceof RegExp) return norm.findIndex((h) => matcher.test(h));
  const want = normalizeHeaderLabel(matcher);
  return norm.findIndex((h) => h === want);
}

export function missingToNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  const set = new Set([
    "-",
    "--",
    "---",
    "—",
    "——",
    "— —",
    "–",
    "N/A",
    "NA",
    "NaN",
    "NULL",
    "null",
    "无",
  ]);
  if (set.has(s)) return null;
  const t = s.endsWith("%") ? s.slice(0, -1).trim() : s;
  if (!t) return null;
  if (set.has(t)) return null;
  return value;
}

export function toNumberOrNull(value) {
  const normalized = missingToNull(value);
  if (normalized === null) return null;
  let text = String(normalized).trim();
  if (text.endsWith("%")) text = text.slice(0, -1).trim();
  const num = Number(text);
  return Number.isNaN(num) ? null : num;
}

const RATE_DEFS = [
  { label: "逆回购7D利率(%)", matcher: /逆回购7D利率$/ },
  { label: "逆回购14D利率(%)", matcher: /逆回购14D利率$/ },
  { label: "MLF利率(%)", matcher: /MLF利率$/ },
  { label: "国库定存利率(%)", matcher: /国库定存利率$/ },
  { label: "SLF利率(%)", matcher: /SLF利率$/ },
  { label: "SLO利率(%)", matcher: /SLO利率$/ },
  { label: "正回购利率(%)", matcher: /正回购利率$/ },
];

const SUMMARY_DEFS = [
  { key: "r7d_amt_yi", matcher: /逆回购7D投放量$/ },
  { key: "r14d_amt_yi", matcher: /逆回购14D投放量$/ },
  { key: "mlf_amt_yi", matcher: /MLF投放量$/ },
  { key: "tcd_amt_yi", matcher: /国库定存投放量$/ },
  { key: "slf_amt_yi", matcher: /SLF投放量$/ },
  { key: "slo_amt_yi", matcher: /SLO投放量$/ },
  { key: "repo_amt_yi", matcher: /正回购投放量$/ },
];

const SHIBOR_BLOCKS = [
  {
    dateCol: /^SHIBOR隔夜日期（?90）?$/,
    days: 90,
    items: [
      { label: "SHIBOR 隔夜(%)", matcher: /^SHIBOR隔夜利率$/ },
      { label: "SHIBOR 1周(%)", matcher: /^SHIBOR1周利率$/ },
      { label: "SHIBOR 2周(%)", matcher: /^SHIBOR2周利率$/ },
    ],
  },
  {
    dateCol: /^SHIBOR3月日期（?180）?$/,
    days: 180,
    items: [
      { label: "SHIBOR 3月(%)", matcher: /^SHIBOR3月利率$/ },
      { label: "SHIBOR 6月(%)", matcher: /^SHIBOR6月利率$/ },
      { label: "SHIBOR 9月(%)", matcher: /^SHIBOR9月利率$/ },
    ],
  },
  {
    dateCol: /^SHIBOR1年日期（?365）?$/,
    days: 365,
    items: [{ label: "SHIBOR 1年(%)", matcher: /^SHIBOR一年利率$/ }],
  },
];

export function parseOpenMarketMinimal(rows, { now = new Date() } = {}) {
  const header = rows?.[0] || [];
  const body = Array.isArray(rows) ? rows.slice(1) : [];

  const dateIdx = findColIndex(header, /^日期$/);
  if (dateIdx < 0) {
    throw new Error("公开市场货币：未找到 日期 列");
  }

  const enriched = body
    .map((row) => ({ row, date: toDateSafe(row?.[dateIdx]) }))
    .filter(
      (item) => item.date && !Number.isNaN(item.date) && isWeekday(item.date)
    );

  const { mon, fri } = prevCompletedWeekRange(now);
  let windowStart = mon;
  let windowEnd = fri;

  let inWeek = enriched
    .filter((item) => item.date >= mon && item.date <= fri)
    .sort((a, b) => a.date - b.date);

  if (!inWeek.length && enriched.length) {
    const latest = enriched.reduce((prev, cur) =>
      cur.date > prev.date ? cur : prev
    );
    if (latest?.date) {
      windowStart = mondayOf(latest.date);
      windowEnd = fridayOf(latest.date);
      inWeek = enriched
        .filter((item) => item.date >= windowStart && item.date <= windowEnd)
        .sort((a, b) => a.date - b.date);
    }
  }

  if (!inWeek.length) {
    return {
      series: [],
      summary: {},
      table: [],
      diag: [{ note: "no rows in week" }],
    };
  }

  const hit = (pattern) => findColIndex(header, pattern);

  const series = [];
  const diag = [];

  for (const def of RATE_DEFS) {
    const colIdx = hit(def.matcher);
    diag.push({
      item: def.label,
      col: colIdx >= 0 ? header[colIdx] ?? null : null,
    });
    const data = inWeek.map(({ row, date }) => {
      const raw = colIdx >= 0 ? row?.[colIdx] : null;
      const value = toNumberOrNull(raw);
      return [date.toISOString().slice(0, 10), value];
    });
    series.push({ name: def.label, data });
  }

  const lastEntry = inWeek[inWeek.length - 1];
  const lastRow = lastEntry?.row ?? [];
  const summary = {};
  for (const def of SUMMARY_DEFS) {
    const colIdx = hit(def.matcher);
    summary[def.key] = colIdx >= 0 ? toNumberOrNull(lastRow?.[colIdx]) : null;
  }

  const tableRow = {};
  header.forEach((cell, idx) => {
    const key =
      cell != null && String(cell).trim()
        ? String(cell).trim()
        : `COL_${idx + 1}`;
    tableRow[key] = lastRow?.[idx] ?? null;
  });

  return {
    series,
    summary,
    table: [tableRow],
    diag,
    range_window: [
      windowStart.toISOString().slice(0, 10),
      windowEnd.toISOString().slice(0, 10),
    ],
  };
}

export function parseShiborMinimal(rows, { now = new Date() } = {}) {
  const header = rows?.[0] || [];
  const body = Array.isArray(rows) ? rows.slice(1) : [];
  const series = [];
  const diag = [];

  for (const block of SHIBOR_BLOCKS) {
    const dateIdx = findColIndex(header, block.dateCol);
    if (dateIdx < 0) {
      diag.push({ dateCol: String(block.dateCol), hit: false });
      continue;
    }

    const cutoff = (() => {
      const anchor = new Date(now);
      anchor.setHours(0, 0, 0, 0);
      anchor.setDate(anchor.getDate() - block.days + 1);
      return anchor;
    })();

    const entries = body
      .map((row) => ({ row, date: toDateSafe(row?.[dateIdx]) }))
      .filter((item) => item.date && item.date >= cutoff)
      .sort((a, b) => a.date - b.date);

    for (const item of block.items) {
      const colIdx = findColIndex(header, item.matcher);
      diag.push({
        item: item.label,
        col: colIdx >= 0 ? header[colIdx] ?? null : null,
      });
      const data = entries.map(({ row, date }) => {
        const raw = colIdx >= 0 ? row?.[colIdx] : null;
        const value = toNumberOrNull(raw);
        return [date.toISOString().slice(0, 10), value];
      });
      series.push({ name: item.label, data });
    }
  }

  return { series, diag };
}

export function buildOpenMarketDataset(
  openRows,
  shiborRows,
  { now = new Date() } = {}
) {
  const open = parseOpenMarketMinimal(openRows, { now });
  const shibor = parseShiborMinimal(shiborRows, { now });

  const dataset = {
    series: [...open.series, ...shibor.series],
    summary: open.summary,
    table: open.table,
    export_info: {
      source_sheet: "公开市场货币 + Shibor利率",
      range: "prevCompletedWeek",
      diag: {
        om: open.diag,
        shibor: shibor.diag,
      },
    },
  };

  dataset.diag = dataset.export_info.diag;

  if (Array.isArray(open.range_window)) {
    dataset.export_info.range_window = open.range_window;
  }

  return dataset;
}

export async function convertOpenMarketWorkbook(
  workbook,
  {
    openSheetName = "公开市场货币",
    shiborSheetName = "Shibor利率",
    now = new Date(),
  } = {}
) {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    throw new Error("无效的工作簿对象");
  }

  const XLSXLib = globalThis.XLSX;
  if (!XLSXLib || !XLSXLib.utils) {
    throw new Error("XLSX 未加载");
  }

  const sheetToRows = (name) => {
    const sheet = workbook.Sheets?.[name];
    return sheet
      ? XLSXLib.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
          defval: null,
        })
      : null;
  };

  const openRows = sheetToRows(openSheetName);
  const shiborRows = sheetToRows(shiborSheetName);

  if (!openRows && !shiborRows) {
    throw new Error("未找到公开市场货币或 Shibor利率工作表");
  }

  return buildOpenMarketDataset(openRows ?? [[]], shiborRows ?? [[]], { now });
}

export function setupOpenMarketConversion({
  buttonSelector = "#btn-convert",
  fileInputSelector = "#xlsxFile",
  onBeforeRead,
  onAfterExport,
  now = new Date(),
} = {}) {
  const button =
    typeof buttonSelector === "string"
      ? document.querySelector(buttonSelector)
      : buttonSelector;
  const input =
    typeof fileInputSelector === "string"
      ? document.querySelector(fileInputSelector)
      : fileInputSelector;

  if (!button || !input) return () => {};

  const handler = async () => {
    const XLSXLib = globalThis.XLSX;
    const JSZipCtor = globalThis.JSZip;

    if (!XLSXLib) {
      alert("XLSX 未加载");
      return;
    }
    if (!JSZipCtor) {
      alert("JSZip 未加载");
      return;
    }

    const file = input.files?.[0];
    if (!file) {
      alert("请选择 Excel 文件");
      return;
    }

    if (typeof onBeforeRead === "function") {
      onBeforeRead(file);
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSXLib.read(buffer, { type: "array" });
    const dataset = await convertOpenMarketWorkbook(workbook, { now });

    const zip = new JSZipCtor();
    const folder = zip.folder("data/values-only");
    folder.file("open_market.json", JSON.stringify(dataset, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "values-only.zip";
    link.click();
    URL.revokeObjectURL(link.href);

    if (typeof onAfterExport === "function") {
      onAfterExport(dataset);
    }

    alert("已下载 values-only.zip（内含 open_market.json）");
  };

  button.addEventListener("click", handler);
  return () => button.removeEventListener("click", handler);
}

if (typeof window !== "undefined") {
  window.__parseOpenMarketMinimal = (rows, now) =>
    parseOpenMarketMinimal(rows, { now });
  window.__parseShiborMinimal = (rows, now) =>
    parseShiborMinimal(rows, { now });
  window.__buildOpenMarketDataset = (openRows, shiborRows, now) =>
    buildOpenMarketDataset(openRows, shiborRows, { now });
}
