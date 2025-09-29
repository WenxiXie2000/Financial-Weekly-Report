import {
  findColIndex,
  toNumberOrNull,
  prevCompletedWeekRange,
} from "../utils.js";
import { computePrevWeekWorkdays, fmtISO, parseNumberLike } from "./common.js";

/**
 * @typedef {import("../types.js").OpenMarketMonetaryFragment} OpenMarketMonetaryFragment
 * @typedef {import("../types.js").OpenMarketJson} OpenMarketJson
 */

const DEFAULT_MONETARY_SHEET = "公开市场货币";

/**
 * 解析公开市场货币工作表，抽取最新一周的摘要与利率序列。
 *
 * @param {Array<Array<unknown>>} rows SheetJS 转换后的二维数组。
 * @param {object} profile 解析配置。
 * @param {{ anchor?: Date, sheetName?: string }} [context] 解析上下文。
 * @returns {OpenMarketMonetaryFragment}
 */
export function parseOpenMarketMonetary(
  rows,
  profile = {},
  { anchor = new Date(), sheetName = DEFAULT_MONETARY_SHEET } = {}
) {
  const headerRowIndex = Number.isInteger(profile.headerRow)
    ? Math.max(0, profile.headerRow)
    : 0;
  const header = rows[headerRowIndex] || [];
  const body = rows.slice(headerRowIndex + 1);
  const dateIdx = findColIndex(header, profile.dateCol);

  const summary = {
    r7d_amt_yi: null,
    r14d_amt_yi: null,
    mlf_amt_yi: null,
    tcd_amt_yi: null,
    slf_amt_yi: null,
    slo_amt_yi: null,
    repo_amt_yi: null,
  };
  const diagnostics = [];
  const rateSeries = [];
  let table = [];
  let rangeWindow = [];

  const summaryKeyMap = {
    rr7d: "r7d_amt_yi",
    rr14d: "r14d_amt_yi",
    mlf: "mlf_amt_yi",
    tcd: "tcd_amt_yi",
    slf: "slf_amt_yi",
    slo: "slo_amt_yi",
    repo: "repo_amt_yi",
  };

  if (dateIdx < 0) {
    diagnostics.push({
      field: "date",
      label: "日期",
      column: null,
      hit: false,
      note: "未找到日期列",
    });
    return { summary, diagnostics, rateSeries, table, rangeWindow };
  }

  const weekRows = computePrevWeekWorkdays(body, dateIdx, anchor);
  const latestEntry = weekRows.length
    ? weekRows.reduce((prev, cur) => (cur.date > prev.date ? cur : prev))
    : null;

  const { mon, fri } = prevCompletedWeekRange(anchor);
  if (
    mon instanceof Date &&
    !Number.isNaN(mon.getTime()) &&
    fri instanceof Date &&
    !Number.isNaN(fri.getTime())
  ) {
    rangeWindow = [fmtISO(mon), fmtISO(fri)];
  }

  if (!latestEntry || !latestEntry.row) {
    return { summary, diagnostics, rateSeries, table, rangeWindow };
  }

  const latestRow = latestEntry.row;
  const iso = latestEntry.date instanceof Date ? fmtISO(latestEntry.date) : "";

  table = [
    header.reduce((acc, cell, idx) => {
      const key =
        cell != null && String(cell).trim()
          ? String(cell).trim()
          : `COL_${idx + 1}`;
      acc[key] = latestRow[idx] ?? null;
      return acc;
    }, {}),
  ];

  const items = Array.isArray(profile.items) ? profile.items : [];
  items.forEach((item) => {
    if (!item || !item.key) return;
    const summaryKey = summaryKeyMap[item.key];
    const baseLabel = item.label || item.key;

    if (summaryKey && item.cols?.inj) {
      const amountIdx = findColIndex(header, item.cols.inj);
      const amountVal =
        amountIdx >= 0 ? parseNumberLike(latestRow[amountIdx]) : null;
      if (amountVal != null) {
        summary[summaryKey] = amountVal;
      }
      diagnostics.push({
        field: summaryKey,
        label: `${baseLabel} 投放量(亿)`,
        column: amountIdx >= 0 ? header[amountIdx] ?? null : null,
        hit: amountIdx >= 0,
        value: amountVal,
      });
    }

    if (item.cols?.rate) {
      const rateIdx = findColIndex(header, item.cols.rate);
      const rawRate = rateIdx >= 0 ? toNumberOrNull(latestRow[rateIdx]) : null;
      const rateVal = rawRate != null ? Number(rawRate.toFixed(4)) : null;
      const seriesName = `${baseLabel}利率(%)`;
      if (iso && rateVal != null) {
        rateSeries.push({ name: seriesName, data: [[iso, rateVal]] });
      }
      diagnostics.push({
        field: `rate:${seriesName}`,
        label: seriesName,
        column: rateIdx >= 0 ? header[rateIdx] ?? null : null,
        hit: rateIdx >= 0,
        value: rateVal,
      });
    }
  });

  return { summary, diagnostics, rateSeries, table, rangeWindow };
}

/**
 * 合并公开市场货币与 Shibor 解析结果，生成最终的数据集。
 *
 * @param {OpenMarketMonetaryFragment|null|undefined} omPart 公开市场货币解析片段。
 * @param {import("../types.js").ShiborJson|null|undefined} shiborPart Shibor 解析片段。
 * @returns {(OpenMarketJson|null)}
 */
export function buildOpenMarketDataset(omPart, shiborPart) {
  const hasOm = omPart && Object.keys(omPart).length;
  const hasShibor = shiborPart && Object.keys(shiborPart).length;
  if (!hasOm && !hasShibor) return null;

  const summary = {
    r7d_amt_yi: omPart?.summary?.r7d_amt_yi ?? null,
    r14d_amt_yi: omPart?.summary?.r14d_amt_yi ?? null,
    mlf_amt_yi: omPart?.summary?.mlf_amt_yi ?? null,
    tcd_amt_yi: omPart?.summary?.tcd_amt_yi ?? null,
    slf_amt_yi: omPart?.summary?.slf_amt_yi ?? null,
    slo_amt_yi: omPart?.summary?.slo_amt_yi ?? null,
    repo_amt_yi: omPart?.summary?.repo_amt_yi ?? null,
  };

  const order = [
    "逆回购7D利率(%)",
    "逆回购14D利率(%)",
    "MLF利率(%)",
    "国库定存利率(%)",
    "SLF利率(%)",
    "SLO利率(%)",
    "正回购利率(%)",
    "SHIBOR 隔夜(%)",
    "SHIBOR 1周(%)",
    "SHIBOR 2周(%)",
    "SHIBOR 3月(%)",
    "SHIBOR 6月(%)",
    "SHIBOR 9月(%)",
    "SHIBOR 1年(%)",
  ];

  const seriesMap = new Map();
  const collect = (list) => {
    (Array.isArray(list) ? list : []).forEach((serie) => {
      if (!serie || !serie.name) return;
      seriesMap.set(serie.name, Array.isArray(serie.data) ? serie.data : []);
    });
  };
  collect(omPart?.rateSeries);
  collect(shiborPart?.series);

  const series = order.map((name) => ({
    name,
    data: seriesMap.get(name) || [],
  }));

  const exportInfo = {
    source_sheet: "公开市场货币 + Shibor利率",
    range: "prevCompletedWeek",
    diagnostics: {
      om: Array.isArray(omPart?.diagnostics) ? omPart.diagnostics : [],
      shibor: Array.isArray(shiborPart?.diagnostics)
        ? shiborPart.diagnostics
        : [],
    },
    last_updated: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  if (
    Array.isArray(omPart?.rangeWindow) &&
    omPart.rangeWindow.length === 2 &&
    omPart.rangeWindow.every((item) => typeof item === "string")
  ) {
    exportInfo.range_window = omPart.rangeWindow;
  }

  return {
    summary,
    series,
    table: Array.isArray(omPart?.table) ? omPart.table : [],
    export_info: exportInfo,
  };
}

export default {
  parseOpenMarketMonetary,
  buildOpenMarketDataset,
};
