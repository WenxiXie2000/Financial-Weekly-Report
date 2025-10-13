/**
 * 债券利率视图专用工具：格式化日期区间、序列裁剪、Tooltip 等。
 */
import { fmtDateLabel } from './dates.js';

export function pickTop5Latest(dataset) {
  if (!dataset) return {};
  return dataset.top5_latest || dataset.board?.top5_latest || {};
}

export function formatRangeWindow(rangeWindow) {
  if (!Array.isArray(rangeWindow) || rangeWindow.length < 2) return '';
  const [start, end] = rangeWindow;
  const startLabel = fmtDateLabel(start);
  const endLabel = fmtDateLabel(end);
  if (!startLabel && !endLabel) return '';
  return `${startLabel || '--'} ~ ${endLabel || '--'}`;
}

export function prepareLineSeries(seriesInput, rangeWindow, seriesOrder = []) {
  const prepared = [];
  const pool = Array.isArray(seriesInput) ? seriesInput : [];
  seriesOrder.forEach((name) => {
    const found = pool.find((serie) => serie?.name === name);
    if (!found) return;
    const normalized = normalizeSeriesData(found.data);
    if (!normalized.length) return;
    const sliced = sliceSeriesByRange(normalized, rangeWindow);
    if (!sliced.length) return;
    const sorted = sliced.sort((a, b) => {
      const ta = new Date(String(a[0]).replace(/-/g, '/')).getTime();
      const tb = new Date(String(b[0]).replace(/-/g, '/')).getTime();
      return ta - tb;
    });
    prepared.push({
      name,
      type: 'line',
      smooth: sorted.length > 3,
      showSymbol: sorted.length <= 2,
      connectNulls: false,
      data: sorted,
    });
  });
  return prepared;
}

export function formatSizeYi(value) {
  if (value == null || value === '') return '--';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCoupon(value) {
  if (value == null || value === '') return '--';
  if (typeof value === 'string') return value.trim();
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `${num.toFixed(2)}%`;
}

export function safeText(value) {
  return value == null || value === '' ? '--' : String(value);
}

export function firstAvailableGroup(topGroups, order = []) {
  for (const key of order) {
    const rows = topGroups?.[key]?.rows;
    if (Array.isArray(rows) && rows.length) return key;
  }
  return order[0] || '';
}

export function formatTooltipDate(value) {
  if (value == null || value === '') return '--';
  if (typeof value === 'string' && value.length === 5 && value.includes('-')) {
    return value;
  }
  if (typeof value === 'number') {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '--';
    return fmtDateLabel(dt.toISOString().slice(0, 10));
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '--';
    return fmtDateLabel(value.toISOString().slice(0, 10));
  }
  return fmtDateLabel(value);
}

export function tooltipFormatter(params) {
  const items = Array.isArray(params) ? params : [params];
  if (!items.length) return '';
  const first = items[0];
  const rawDate = Array.isArray(first.data)
    ? first.data[0]
    : Array.isArray(first.value)
    ? first.value[0]
    : first.axisValue;
  const dateLabel = formatTooltipDate(rawDate);
  const lines = items.map((item) => {
    const val = Array.isArray(item.value) ? item.value[1] : item.data?.[1] ?? item.value;
    if (val == null || Number.isNaN(Number(val))) {
      return `${item.marker}${item.seriesName}: --`;
    }
    return `${item.marker}${item.seriesName}: ${Number(val).toFixed(2)}%`;
  });
  const title = dateLabel || (rawDate != null ? String(rawDate) : '--');
  return [title, ...lines].join('<br/>');
}

function normalizeSeriesData(data) {
  return (Array.isArray(data) ? data : [])
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return null;
      const [date, raw] = entry;
      if (date == null) return null;
      const num = Number(raw);
      if (Number.isNaN(num)) return null;
      return [String(date), num];
    })
    .filter(Boolean);
}

function sliceSeriesByRange(points, rangeWindow) {
  if (!Array.isArray(points)) return [];
  if (!Array.isArray(rangeWindow) || rangeWindow.length < 2) return [...points];
  const [start, end] = rangeWindow;
  const startTime = start ? new Date(String(start).replace(/-/g, '/')).getTime() : null;
  const endTime = end ? new Date(String(end).replace(/-/g, '/')).getTime() : null;
  return points.filter(([iso]) => {
    const ts = new Date(String(iso).replace(/-/g, '/')).getTime();
    if (Number.isNaN(ts)) return false;
    if (startTime != null && ts < startTime) return false;
    if (endTime != null && ts > endTime) return false;
    return true;
  });
}
