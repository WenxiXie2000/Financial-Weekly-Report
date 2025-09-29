import { findColIndex, toDateSafe } from "../utils.js";
import {
  fmtISO,
  describeMatcher,
  closestHeaders,
  parsePercentNumber,
  deriveRange,
} from "./common.js";

/**
 * @typedef {import("../types.js").ShiborJson} ShiborJson
 */

const DEFAULT_SHEET_NAME = "Shibor利率";

/**
 * 解析 Shibor 利率工作表，生成按期限划分的利率序列。
 *
 * @param {Array<Array<unknown>>} rows SheetJS 转换后的二维数组。
 * @param {object} profile 解析配置。
 * @param {{ sheetName?: string }} [context] 解析上下文。
 * @returns {ShiborJson}
 */
export function parseShibor(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME } = {}
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

  const groups = Array.isArray(profile?.groups) ? profile.groups : [];
  const diagGroups = [];
  const series = [];

  const normalizeRate = (value) => {
    const parsed = parsePercentNumber(value);
    if (parsed == null || Number.isNaN(parsed)) return null;
    return Number(parsed.toFixed(4));
  };

  groups.forEach((group) => {
    const dateMatcher = group?.dateCol;
    const dateIdx = findColIndex(header, dateMatcher);
    const dateDiag = {
      matcher: describeMatcher(dateMatcher),
      hit: dateIdx >= 0,
      column: dateIdx >= 0 ? header[dateIdx] || null : null,
      candidates: dateIdx >= 0 ? [] : closestHeaders(header, dateMatcher),
      points: 0,
      dateRange: [],
    };

    const itemDefs = (Array.isArray(group?.items) ? group.items : []).map(
      (item) => {
        const colIdx = findColIndex(header, item?.col);
        const diag = {
          key: item?.key || "",
          label: item?.label || item?.key || "",
          matcher: describeMatcher(item?.col),
          hit: colIdx >= 0,
          column: colIdx >= 0 ? header[colIdx] || null : null,
          candidates: colIdx >= 0 ? [] : closestHeaders(header, item?.col),
          points: 0,
          dateRange: [],
        };
        return { item, colIdx, diag };
      }
    );

    const diagGroup = {
      range: group?.range || null,
      date: dateDiag,
      items: itemDefs.map(({ diag }) => diag),
    };
    diagGroups.push(diagGroup);

    if (dateIdx < 0) {
      return;
    }

    const datedRows = body
      .map((row) => {
        const date = toDateSafe(row?.[dateIdx]);
        if (!date) return null;
        return { row, date, iso: fmtISO(date) };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    dateDiag.points = datedRows.length;
    if (datedRows.length === 1) {
      dateDiag.dateRange = [datedRows[0].iso, datedRows[0].iso];
    } else if (datedRows.length >= 2) {
      dateDiag.dateRange = [
        datedRows[0].iso,
        datedRows[datedRows.length - 1].iso,
      ];
    }

    if (!datedRows.length) {
      return;
    }

    let cutoff = null;
    if (
      typeof group?.range === "string" &&
      group.range.startsWith("lastNDays:")
    ) {
      const n = Number(group.range.split(":")[1] || "0");
      if (Number.isFinite(n) && n > 0) {
        const latest = datedRows[datedRows.length - 1].date;
        cutoff = new Date(latest.getTime());
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - (n - 1));
      }
    }

    itemDefs.forEach(({ item, colIdx, diag }) => {
      if (!item || colIdx < 0) {
        return;
      }

      const data = [];
      datedRows.forEach(({ row, iso, date }) => {
        if (cutoff && date < cutoff) {
          return;
        }
        const raw = row[colIdx];
        const value = normalizeRate(raw);
        if (value == null) {
          return;
        }
        data.push([iso, value]);
      });

      if (!data.length) {
        return;
      }

      diag.points = data.length;
      const range = deriveRange([{ data }]);
      if (Array.isArray(range) && range.length === 2) {
        diag.dateRange = range;
      }

      series.push({
        name: item.label || item.key || "",
        data,
        unit: "%",
      });
    });
  });

  const totalPoints = series.reduce(
    (acc, serie) => acc + (Array.isArray(serie.data) ? serie.data.length : 0),
    0
  );
  const overallRange = deriveRange(series);

  const meta = {
    timezone: "Asia/Shanghai",
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    sourceSheets: [sheetName],
    unit: { rate: "%" },
  };

  const exportInfo = {
    source_sheet: sheetName,
    rows: totalPoints,
    last_updated: new Date().toISOString().slice(0, 19).replace("T", " "),
    diagnostics: { shibor: diagGroups },
  };
  if (overallRange) {
    exportInfo.range = overallRange;
  }

  return {
    meta,
    summary: {},
    series,
    export_info: exportInfo,
  };
}

export default parseShibor;
