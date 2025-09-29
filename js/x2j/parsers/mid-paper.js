import { findColIndex, toDateSafe, prevCompletedWeekRange, toNumberOrNull } from '../utils.js';
import { formatDate, describeMatcher, closestHeaders } from './common.js';

const DEFAULT_SHEET_NAME = '中票利率';
const DEFAULT_HEADER_ROW = 0;

const SERIES_DEFS = [
  { label: 'AAA中短票 1年(%)', matcher: /AAA中短票1年利率$/ },
  { label: 'AAA中短票 3年(%)', matcher: /AAA中短票3年利率$/ },
  { label: 'AAA中短票 5年(%)', matcher: /AAA中短票5年利率$/ },
  { label: 'AAA中短票 7年(%)', matcher: /AAA中短票7年利率$/ },
  { label: 'AAA中短票 10年(%)', matcher: /AAA中短票10年利率$/ },
];

const normalizeHeader = (value) => (value == null ? '' : String(value).trim());

const trackColumnInfo = (header, diagnostics, matcher, label) => {
  const idx = findColIndex(header, matcher);
  const column = idx >= 0 ? header[idx] ?? null : null;
  diagnostics.columns.push({
    label,
    matcher: describeMatcher(matcher),
    column,
    index: idx >= 0 ? idx : null,
    closest: idx >= 0 ? [] : closestHeaders(header, matcher),
  });
  return idx;
};

const formatPercentValue = (value) => {
  const num = toNumberOrNull(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(4));
};

export function parseMidPaper(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow)
    ? Math.max(0, profile.headerRow)
    : DEFAULT_HEADER_ROW;
  const header = Array.isArray(rows?.[headerRowIndex])
    ? rows[headerRowIndex].map(normalizeHeader)
    : [];
  const bodyRows = Array.isArray(rows)
    ? rows
        .slice(headerRowIndex + 1)
        .filter(
          (row) =>
            Array.isArray(row) &&
            row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
        )
    : [];

  const diagnostics = {
    sheet: sheetName,
    range: null,
    rows: { total: bodyRows.length, kept: 0 },
    date_column: null,
    columns: [],
  };

  const dateMatcher = profile?.dateCol || /^日期$/;
  const dateIdx = trackColumnInfo(header, diagnostics, dateMatcher, '日期');
  diagnostics.date_column = dateIdx >= 0 ? header[dateIdx] || null : null;

  const { mon, fri } = prevCompletedWeekRange(anchor);
  const rangeStart = mon ? formatDate(mon) : '';
  const rangeEnd = fri ? formatDate(fri) : '';
  diagnostics.range = { start: rangeStart, end: rangeEnd };

  const filtered = bodyRows
    .map((row) => {
      const raw = dateIdx >= 0 ? row[dateIdx] : null;
      const date = toDateSafe(raw);
      return { row, date };
    })
    .filter((item) => item.date && item.date >= mon && item.date <= fri)
    .sort((a, b) => a.date - b.date);

  diagnostics.rows.kept = filtered.length;

  if (!filtered.length || dateIdx < 0) {
    return {
      series: [],
      export_info: {
        source_sheet: '债券利率 + 中票利率',
        range: 'prevCompletedWeek',
        range_window: [rangeStart, rangeEnd],
        rows: filtered.length,
        diagnostics: {
          columns: diagnostics.columns,
          stats: [
            {
              rows_total: bodyRows.length,
              rows_kept: filtered.length,
              range_start: rangeStart,
              range_end: rangeEnd,
              date_column: diagnostics.date_column,
            },
          ],
        },
      },
    };
  }

  const seriesList = SERIES_DEFS.map((def) => {
    const columnIdx = trackColumnInfo(header, diagnostics, def.matcher, def.label);
    const pointMap = new Map();
    if (columnIdx >= 0) {
      filtered.forEach(({ row, date }) => {
        const iso = formatDate(date);
        const value = formatPercentValue(row[columnIdx]);
        if (value === null) return;
        pointMap.set(iso, value);
      });
    }
    const data = Array.from(pointMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([iso, value]) => [iso, value]);
    return { name: def.label, data };
  }).filter((serie) => Array.isArray(serie.data) && serie.data.length);

  const exportInfo = {
    source_sheet: '债券利率 + 中票利率',
    range: 'prevCompletedWeek',
    range_window: [rangeStart, rangeEnd],
    rows: filtered.length,
    diagnostics: {
      columns: diagnostics.columns,
      stats: [
        {
          rows_total: bodyRows.length,
          rows_kept: filtered.length,
          range_start: rangeStart,
          range_end: rangeEnd,
          date_column: diagnostics.date_column,
        },
      ],
    },
  };

  return {
    series: seriesList,
    export_info: exportInfo,
  };
}

export default parseMidPaper;
