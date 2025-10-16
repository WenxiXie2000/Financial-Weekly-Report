import {
  buildHeaderIndex,
  normalizeHeaderCell,
  findColIndex,
  closestHeaderCandidates,
  toDateSafe,
  prevCompletedWeekRange,
  toNumberOrNull,
  ymd,
} from '../utils.js';

const DEFAULT_SHEET_NAME = '全球股市';

const isNonEmptyRow = (row) =>
  Array.isArray(row) &&
  row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');

const valueFromMeta = (raw, meta) => {
  if (!meta) return null;
  const num = toNumberOrNull(raw);
  if (!Number.isFinite(num)) return null;
  const digits =
    typeof meta.digits === 'number' ? meta.digits : meta.type === 'percent' ? 4 : undefined;
  if (typeof digits === 'number') {
    return Number(num.toFixed(digits));
  }
  return num;
};

/**
 * 解析“全球股市”工作表为标准化序列与表格。
 * @param {Array[]} rows - SheetJS sheet_to_json(header:1) 的二维数组。
 * @param {object} [profile={}] - profiles.js 配置，定义指标与列匹配。
 * @param {{sheetName?: string, anchor?: Date}} [options]
 * @returns {{series: Array, table: Array, export_info: object}}
 */
export default function parseEquityGlobal(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow) ? Math.max(0, profile.headerRow) : 1;
  const headerRow = Array.isArray(rows?.[headerRowIndex])
    ? rows[headerRowIndex].map(normalizeHeaderCell)
    : [];
  const headerIndex = buildHeaderIndex(headerRow);
  const bodyRows = Array.isArray(rows)
    ? rows.slice(headerRowIndex + 1).filter((row) => isNonEmptyRow(row))
    : [];

  const { mon, fri } = prevCompletedWeekRange(anchor);
  const window = { mon: ymd(mon), fri: ymd(fri) };

  const diagnostics = {
    sheet: sheetName,
    window,
    rows: { scanned: bodyRows.length, kept: 0 },
    hits: [],
  };

  const recordHit = (label, matcher, colIdx) => {
    diagnostics.hits.push({
      label,
      matcher: matcher instanceof RegExp ? matcher.toString() : String(matcher ?? ''),
      colName: colIdx >= 0 ? headerRow[colIdx] ?? null : null,
      colIndex: colIdx >= 0 ? colIdx : -1,
      matched: colIdx >= 0,
      closest: colIdx >= 0 ? [] : closestHeaderCandidates(headerRow, matcher),
    });
  };

  const dateMatcher = profile?.dateCol || /^日期$/;
  const dateIdx = findColIndex(headerIndex, dateMatcher);
  recordHit('日期列', dateMatcher, dateIdx);

  if (dateIdx < 0) {
    return {
      series: [],
      table: [],
      export_info: {
        source_sheet: sheetName,
        range: 'prevCompletedWeek',
        range_window: [window.mon, window.fri],
        rows: 0,
        diagnostics,
      },
    };
  }

  const filtered = bodyRows
    .map((row) => {
      const dateValue = toDateSafe(row[dateIdx]);
      if (!dateValue) return null;
      if (mon && dateValue < mon) return null;
      if (fri && dateValue > fri) return null;
      return { row, dateObj: dateValue, date: ymd(dateValue) };
    })
    .filter(Boolean)
    .sort((a, b) => a.dateObj - b.dateObj);

  diagnostics.rows.kept = filtered.length;

  if (!filtered.length) {
    return {
      series: [],
      table: [],
      export_info: {
        source_sheet: sheetName,
        range: 'prevCompletedWeek',
        range_window: [window.mon, window.fri],
        rows: 0,
        diagnostics,
      },
    };
  }

  const seriesDefs = Array.isArray(profile?.series) ? profile.series : [];
  const metricMeta = profile?.metricMeta || {};

  const series = [];
  const trackedColumns = new Map();

  seriesDefs.forEach((entry) => {
    if (!entry || !entry.label) return;
    const cols = entry.cols || {};
    Object.entries(cols).forEach(([metricKey, matcher]) => {
      if (!matcher) return;
      const colIdx = findColIndex(headerIndex, matcher);
      recordHit(`${entry.label}.${metricKey}`, matcher, colIdx);
      if (colIdx < 0) return;

      const meta = metricMeta[metricKey] || { label: metricKey };
      trackedColumns.set(colIdx, meta);
      const name = `${entry.label} ${meta.label || metricKey}`;
      const data = filtered.map(({ row, date }) => [date, valueFromMeta(row[colIdx], meta)]);
      series.push({ name, data });
    });
  });

  const table = filtered.map(({ row, date }) => {
    const record = {};
    record[headerRow[dateIdx] || '日期'] = date;
    trackedColumns.forEach((meta, colIdx) => {
      record[headerRow[colIdx] || `COL_${colIdx}`] = valueFromMeta(row[colIdx], meta);
    });
    return record;
  });

  return {
    series,
    table,
    export_info: {
      source_sheet: sheetName,
      range: 'prevCompletedWeek',
      range_window: [window.mon, window.fri],
      rows: filtered.length,
      diagnostics,
    },
  };
}
