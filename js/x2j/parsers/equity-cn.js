import { findColIndex, toDateSafe, prevCompletedWeekRange, toNumberOrNull } from '../utils.js';
import { formatDate, describeMatcher, closestHeaders } from './common.js';

const INDEX_DEFS = [
  { key: '上证综指', label: '上证综指' },
  { key: '深圳成指', label: '深圳成指' },
  { key: '中小板指', label: '中小板指' },
  { key: '创业板指', label: '创业板指' },
  { key: '沪深300', label: '沪深300' },
  { key: '300电力', label: '300电力' },
];

const METRICS = [
  {
    key: 'close',
    suffix: ' 收盘',
    matcher: (name) => new RegExp(`^${name}收盘价$`),
    valueType: 'number',
  },
  {
    key: 'chg',
    suffix: ' 涨跌幅(%)',
    matcher: (name) => new RegExp(`^${name}涨跌幅$`),
    valueType: 'percent',
  },
  {
    key: 'amount',
    suffix: ' 成交金额(亿)',
    matcher: (name) => new RegExp(`^${name}成交金额`),
    valueType: 'number',
  },
  {
    key: 'amount_chg',
    suffix: ' 成交金额变化(%)',
    matcher: (name) => new RegExp(`^${name}成交金额变化$|^${name}成交变化$`),
    valueType: 'percent',
  },
  {
    key: 'mainflow',
    suffix: ' 主力资金流向(亿)',
    matcher: (name) => new RegExp(`^${name}主力资金流向`),
    valueType: 'number',
  },
];

const DEFAULT_HEADER_ROW = 1;

const normalizeHeader = (value) => (value == null ? '' : String(value).trim());

const formatPercentValue = (value) => {
  const num = toNumberOrNull(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(4));
};

const formatNumericValue = (value) => {
  const num = toNumberOrNull(value);
  return Number.isFinite(num) ? num : null;
};

export default function parseEquityCn(
  rows,
  profile = {},
  { sheetName = '国内股市', anchor = new Date() } = {}
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

  const trackColumnInfo = (matcher, label) => {
    const index = findColIndex(header, matcher);
    const column = index >= 0 ? header[index] ?? null : null;
    diagnostics.columns.push({
      label,
      matcher: describeMatcher(matcher),
      column,
      index: index >= 0 ? index : null,
      closest: index >= 0 ? [] : closestHeaders(header, matcher),
    });
    return index;
  };

  const dateMatcher = profile?.dateCol || /^交易日$/;
  const dateIdx = trackColumnInfo(dateMatcher, '日期');
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
      table: [],
      export_info: {
        source_sheet: sheetName,
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

  const columnTransforms = new Map();
  const seriesList = [];

  const ensureSeries = (name) => {
    let existing = seriesList.find((item) => item.name === name);
    if (!existing) {
      existing = { name, data: [] };
      seriesList.push(existing);
    }
    return existing;
  };

  INDEX_DEFS.forEach((indexDef) => {
    METRICS.forEach((metric) => {
      const matcher = metric.matcher(indexDef.label);
      const columnIdx = trackColumnInfo(matcher, `${indexDef.label} ${metric.suffix}`);
      if (columnIdx < 0) return;

      const transform = metric.valueType === 'percent' ? formatPercentValue : formatNumericValue;
      columnTransforms.set(columnIdx, transform);

      const series = ensureSeries(`${indexDef.label}${metric.suffix}`);
      const pointMap = new Map();
      filtered.forEach(({ row, date }) => {
        const iso = formatDate(date);
        const value = transform(row[columnIdx]);
        if (!pointMap.has(iso) || value !== null) {
          pointMap.set(iso, value);
        }
      });
      series.data = Array.from(pointMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    });
  });

  const uniqueColumns = Array.from(columnTransforms.keys());
  const table = filtered.map(({ row, date }) => {
    const record = {};
    record[header[dateIdx]] = formatDate(date);
    uniqueColumns.forEach((idx) => {
      if (idx === dateIdx) return;
      const transform = columnTransforms.get(idx);
      record[header[idx]] = transform ? transform(row[idx]) : row[idx];
    });
    return record;
  });

  const exportInfo = {
    source_sheet: sheetName,
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
    table,
    export_info: exportInfo,
  };
}
