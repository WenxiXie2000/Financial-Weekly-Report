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

const DEFAULT_SHEET_NAME = '国能上市公司';

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

export default function parseGroupListed(
  rows,
  profile = {},
  { anchor = new Date(), sheetName = DEFAULT_SHEET_NAME } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow) ? Math.max(0, profile.headerRow) : 0;
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

  const stocks = Array.isArray(profile?.stocks) ? profile.stocks : [];
  const metrics = profile?.metrics || {};

  const series = [];
  const trackedColumns = new Map();

  stocks.forEach((rawName) => {
    const stockName = String(rawName || '').trim();
    if (!stockName) return;

    Object.entries(metrics).forEach(([metricKey, meta]) => {
      if (!meta) return;
      const matcher = typeof meta.matcher === 'function' ? meta.matcher(stockName) : meta.matcher;
      if (!matcher) return;

      const colIdx = findColIndex(headerIndex, matcher);
      recordHit(`${stockName}.${metricKey}`, matcher, colIdx);
      if (colIdx < 0) return;

      trackedColumns.set(colIdx, meta);
      const metricLabel = meta.label || metricKey;
      const name = `${stockName} ${metricLabel}`;
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
