import { findColIndex } from "../utils.js";
import {
  computePrevWeekWorkdays,
  fmtISO,
  describeMatcher,
  closestHeaders,
  parseNumberLike,
  parsePercentNumber,
  formatNumber4,
  formatPercent4,
  deriveRange,
} from "./common.js";

/**
 * @typedef {import("../types.js").CnyFxJson} CnyFxJson
 */

const DEFAULT_SHEET_NAME = "人民币汇率";

/**
 * 解析人民币汇率工作表并生成标准化的 JSON 数据集。
 *
 * @param {Array<Array<unknown>>} rows SheetJS 转换后的二维数组。
 * @param {object} profile 解析配置。
 * @param {{ anchor?: Date, sheetName?: string }} [context] 解析上下文。
 * @returns {CnyFxJson}
 */
export function parseCnyFx(
  rows,
  profile = {},
  { anchor = new Date(), sheetName = DEFAULT_SHEET_NAME } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow)
    ? Math.max(0, profile.headerRow)
    : 0;
  const header = rows[headerRowIndex] || [];
  const body = rows
    .slice(headerRowIndex + 1)
    .filter(
      (row) =>
        Array.isArray(row) &&
        row.some(
          (cell) =>
            cell !== undefined && cell !== null && String(cell).trim() !== ""
        )
    );

  const dateIdx = findColIndex(header, profile?.dateCol);
  if (dateIdx < 0) {
    throw new Error(`${sheetName}：未找到日期列`);
  }

  let weekRows = computePrevWeekWorkdays(body, dateIdx, anchor)
    .map((item) => ({ ...item, iso: fmtISO(item.date) }))
    .sort((a, b) => a.date - b.date);

  if (typeof profile?.rowFilter === "function") {
    weekRows = weekRows.filter((item) => profile.rowFilter({ date: item.iso }));
  }

  const diagnostics = {
    sheet: sheetName,
    dateCol: header[dateIdx] || null,
    range: profile?.rangeDefault || "prevWeekWorkdays",
    items: [],
  };

  diagnostics.items.push({
    category: "date",
    label: "日期列",
    matcher: describeMatcher(profile?.dateCol),
    matched: dateIdx >= 0,
    column: header[dateIdx] || null,
    closest: dateIdx >= 0 ? [] : closestHeaders(header, profile?.dateCol),
    points: weekRows.length,
    dateRange:
      weekRows.length >= 2
        ? [weekRows[0].iso, weekRows[weekRows.length - 1].iso]
        : [],
  });

  const metricDefs = [
    {
      key: "rate",
      suffix: " 汇率",
      label: "汇率",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "chg",
      suffix: " 涨跌幅(%)",
      label: "涨跌幅(%)",
      parser: parsePercentNumber,
      isPct: true,
    },
    {
      key: "mid",
      suffix: " 央行中间价",
      label: "央行中间价",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "mid_chg",
      suffix: " 央行中间价调整(%)",
      label: "央行中间价调整(%)",
      parser: parsePercentNumber,
      isPct: true,
    },
  ];

  const series = [];
  const kpis = {};

  (profile?.currencies || []).forEach((currency) => {
    const keyBase = String(currency?.key || "")
      .trim()
      .toLowerCase();
    if (!keyBase) return;
    kpis[`${keyBase}_mid`] = null;
    kpis[`${keyBase}_mid_chg`] = null;
  });

  (profile?.currencies || []).forEach((currency) => {
    const keyword = String(currency?.keyword || "").trim();
    const keyBase = String(currency?.key || "")
      .trim()
      .toLowerCase();
    if (!keyword || !keyBase) return;

    metricDefs.forEach((metric) => {
      if (currency?.noMid && metric.key.startsWith("mid")) {
        return;
      }
      const matcherFactory = profile?.cols?.[metric.key];
      const matcher =
        typeof matcherFactory === "function" ? matcherFactory(keyword) : null;

      const idx = matcher != null ? findColIndex(header, matcher) : -1;
      const diagEntry = {
        category: "series",
        label: `${keyword}${metric.label}`,
        metric: metric.key,
        matcher: describeMatcher(matcher),
        matched: idx >= 0,
        column: idx >= 0 ? header[idx] || null : null,
        closest: idx >= 0 ? [] : closestHeaders(header, matcher),
        points: 0,
        dateRange: [],
      };
      diagnostics.items.push(diagEntry);

      const data = weekRows.map((item) => {
        const raw = idx >= 0 ? item.row?.[idx] : null;
        if (raw === "" || raw == null) {
          return [item.iso, null];
        }
        const parsed = metric.parser(raw);
        if (parsed == null || Number.isNaN(parsed)) {
          return [item.iso, null];
        }
        return [item.iso, parsed];
      });

      diagEntry.points = data.filter(([, v]) => v != null).length;
      const range = deriveRange([{ data }]);
      if (Array.isArray(range) && range.length === 2) {
        diagEntry.dateRange = range;
      }

      series.push({ name: `${keyword}${metric.suffix}`, data });
    });
  });

  const table = weekRows.map((item) => {
    const record = {};
    header.forEach((col, idx) => {
      if (idx === dateIdx) {
        record[col] = item.iso;
      } else {
        record[col] = item.row?.[idx] ?? null;
      }
    });
    return record;
  });

  if (weekRows.length) {
    const last = weekRows[weekRows.length - 1];
    (profile?.currencies || []).forEach((currency) => {
      const keyword = String(currency?.keyword || "").trim();
      const keyBase = String(currency?.key || "")
        .trim()
        .toLowerCase();
      if (!keyword || !keyBase || currency?.noMid) return;

      const midMatcherFactory = profile?.cols?.mid;
      const midMatcher =
        typeof midMatcherFactory === "function"
          ? midMatcherFactory(keyword)
          : null;
      const midIdx = midMatcher ? findColIndex(header, midMatcher) : -1;
      if (midIdx >= 0) {
        const formatted = formatNumber4(last.row?.[midIdx]);
        if (formatted != null) {
          kpis[`${keyBase}_mid`] = formatted;
        }
      }

      const midChgMatcherFactory = profile?.cols?.mid_chg;
      const midChgMatcher =
        typeof midChgMatcherFactory === "function"
          ? midChgMatcherFactory(keyword)
          : null;
      const midChgIdx = midChgMatcher
        ? findColIndex(header, midChgMatcher)
        : -1;
      if (midChgIdx >= 0) {
        const formatted = formatPercent4(last.row?.[midChgIdx]);
        if (formatted != null) {
          kpis[`${keyBase}_mid_chg`] = formatted;
        }
      }
    });
  }

  const rangeWindow =
    weekRows.length >= 2
      ? [weekRows[0].iso, weekRows[weekRows.length - 1].iso]
      : [];

  const diagnosticEntries = diagnostics.items.map((item) => ({
    category: item.category || "series",
    label: item.label,
    metric: item.metric || "",
    matcher: item.matcher,
    matched: Boolean(item.matched),
    column: item.column || null,
    closest: Array.isArray(item.closest) ? item.closest : [],
    points: typeof item.points === "number" ? item.points : 0,
    dateRange: Array.isArray(item.dateRange) ? item.dateRange : [],
  }));

  const exportInfo = {
    source_sheet: sheetName,
    range: profile?.rangeDefault || "prevWeekWorkdays",
    rows: weekRows.length,
    range_window: rangeWindow,
    last_updated: new Date().toISOString().slice(0, 19).replace("T", " "),
    diagnostics,
  };

  const meta = {
    timezone: "Asia/Shanghai",
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    rangeStrategy: profile?.rangeDefault || "prevWeekWorkdays",
    sourceSheets: [sheetName],
  };

  return {
    meta,
    summary: {},
    series,
    table,
    kpis,
    export_info: exportInfo,
    diagnostics: diagnosticEntries,
  };
}

export default parseCnyFx;
