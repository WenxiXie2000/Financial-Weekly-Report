export function formatYi(val, digits = 2) {
  if (val == null || val === '') return '--';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} 亿`;
}

export function asPercent(val) {
  if (val == null || val === '') return '--';
  return String(val);
}

export function formatRatio(val, digits = 2) {
  if (val == null || val === '') return '--';
  const n = Number(val);
  return Number.isNaN(n) ? String(val) : `${n.toFixed(digits)}x`;
}

export function percentAxisLabel(v) {
  const n = Number(v);
  return Number.isNaN(n) ? v : `${n.toFixed(2)}%`;
}

export { lastFridayFromToday, mondayOf, fridayOf, prevCompletedWeekRange } from './x2j/utils.js';
