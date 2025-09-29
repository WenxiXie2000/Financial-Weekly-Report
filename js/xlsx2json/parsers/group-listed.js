import { findColIndex, toDateSafe } from "../utils.js";
import {
  computePrevWeekWorkdays,
  fmtISO,
  describeMatcher,
  closestHeaders,
  parseNumberLike,
  parsePercentNumber,
  deriveRange,
} from "./common.js";

/**
 * @typedef {import("../types.js").GroupListedJson} GroupListedJson
 */

const DEFAULT_SHEET_NAME = "国能上市公司";

/**
 * 解析集团上市公司工作表，输出包含系列、诊断和 KPI 的数据集。
 *
 * @param {Array<Array<unknown>>} rows SheetJS 转换后的二维数组。
 * @param {object} profile 解析配置。
 * @param {{ anchor?: Date, sheetName?: string }} [context] 解析上下文。
 * @returns {GroupListedJson}
 */
export function parseGroupListed(
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
    range: "prevWeekWorkdays",
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
      key: "close",
      suffix: " 收盘",
      label: "收盘",
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
      key: "amount",
      suffix: " 成交金额(亿)",
      label: "成交金额(亿)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "amount_chg",
      suffix: " 成交金额变化(%)",
      label: "成交金额变化(%)",
      parser: parsePercentNumber,
      isPct: true,
    },
    {
      key: "mainflow",
      suffix: " 主力资金流向(亿)",
      label: "主力资金流向(亿)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "pe",
      suffix: " 市盈率(倍)",
      label: "市盈率(倍)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "pb",
      suffix: " 市净率(倍)",
      label: "市净率(倍)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "dev",
      suffix: " 每日偏离值",
      label: "每日偏离值",
      parser: (value) => parsePercentNumber(value) ?? parseNumberLike(value),
      isPct: false,
    },
    {
      key: "turn_ratio",
      suffix: " 换手率比值",
      label: "换手率比值",
      parser: (value) => parsePercentNumber(value) ?? parseNumberLike(value),
      isPct: false,
    },
  ];

  const series = [];

  (profile?.stocks || []).forEach((stock) => {
    const name = String(stock || "").trim();
    if (!name) return;

    metricDefs.forEach((metric) => {
      const matcherFactory = profile?.cols?.[metric.key];
      const matcher =
        typeof matcherFactory === "function" ? matcherFactory(name) : null;

      const idx = matcher != null ? findColIndex(header, matcher) : -1;
      const diagEntry = {
        category: "series",
        label: `${name} ${metric.label}`,
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
        const value = idx >= 0 ? item.row?.[idx] : null;
        if (value === "" || value == null) {
          return [item.iso, null];
        }

        let parsed = metric.parser(value);
        if (
          metric.isPct &&
          typeof value === "string" &&
          value.endsWith("%") &&
          (parsed == null || Number.isNaN(parsed))
        ) {
          parsed = parseFloat(value.slice(0, -1));
        }
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

      series.push({ name: `${name}${metric.suffix}`, data });
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
    range: "prevWeekWorkdays",
    rows: weekRows.length,
    range_window: rangeWindow,
    last_updated: new Date().toISOString().slice(0, 19).replace("T", " "),
    diagnostics,
  };

  const meta = {
    timezone: "Asia/Shanghai",
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    rangeStrategy: "prevWeekWorkdays",
    sourceSheets: [sheetName],
  };

  return {
    meta,
    summary: {},
    series,
    table,
    export_info: exportInfo,
    diagnostics: diagnosticEntries,
  };
}

export default parseGroupListed;
