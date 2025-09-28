export function formatYi(val, digits = 2) {
  if (val == null || val === "") return "--";
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} 亿`;
}

export function asPercent(val) {
  if (val == null || val === "") return "--";
  return String(val);
}

export function formatRatio(val, digits = 2) {
  if (val == null || val === "") return "--";
  const n = Number(val);
  return Number.isNaN(n) ? String(val) : `${n.toFixed(digits)}x`;
}

export function percentAxisLabel(v) {
  const n = Number(v);
  return Number.isNaN(n) ? v : `${n.toFixed(2)}%`;
}

export function lastFridayFromToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const w = d.getDay();
  const offset = w >= 5 ? w - 5 : w + 2;
  d.setDate(d.getDate() - offset);
  return d;
}

export function mondayOf(date) {
  const t = new Date(date);
  const w = t.getDay() || 7;
  t.setDate(t.getDate() - (w - 1));
  t.setHours(0, 0, 0, 0);
  return t;
}

export function fridayOf(date) {
  const m = mondayOf(date);
  const f = new Date(m);
  f.setDate(m.getDate() + 4);
  f.setHours(23, 59, 59, 999);
  return f;
}

export function prevCompletedWeekRange(now = new Date()) {
  const fri = lastFridayFromToday(now);
  const mon = mondayOf(fri);
  const end = fridayOf(fri);
  return { mon, fri: end };
}
