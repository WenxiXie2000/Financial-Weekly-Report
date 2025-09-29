const MISSING_STRINGS = new Set([
  "-",
  "--",
  "---",
  "—",
  "——",
  "— —",
  "–",
  "N/A",
  "NA",
  "NaN",
  "NULL",
  "null",
  "无",
]);

export function normalizeHeaderLabel(input) {
  const s = String(input ?? "").trim();
  let t = s.replace(/\s+/g, "");
  t = t.replace(/[（(][^）)]*[）)]\s*$/, "");
  return t;
}

export function buildHeaderIndex(header) {
  if (
    header &&
    typeof header === "object" &&
    Array.isArray(header.raw) &&
    Array.isArray(header.norm) &&
    header.map instanceof Map
  ) {
    return header;
  }

  const raw = Array.isArray(header) ? header : [];
  const norm = raw.map(normalizeHeaderLabel);
  const map = new Map();

  raw.forEach((value, idx) => {
    const rawKey = String(value);
    if (!map.has(rawKey)) map.set(rawKey, idx);
    const normKey = norm[idx];
    if (!map.has(normKey)) map.set(normKey, idx);
  });

  return { raw, norm, map };
}

export function findColIndex(header, matcher) {
  if (!header) return -1;
  const { raw, norm, map } = buildHeaderIndex(header);

  if (matcher instanceof RegExp) {
    const regex = matcher;
    for (let i = 0; i < raw.length; i += 1) {
      regex.lastIndex = 0;
      if (regex.test(String(raw[i]))) return i;
    }
    return norm.findIndex((cell) => {
      regex.lastIndex = 0;
      return regex.test(cell);
    });
  }

  const key = matcher != null ? String(matcher) : "";
  if (map.has(key)) return map.get(key);
  const normalizedKey = normalizeHeaderLabel(key);
  if (map.has(normalizedKey)) return map.get(normalizedKey);
  return norm.findIndex((cell) => cell === normalizedKey);
}

export function toDateSafe(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    if (Number.isNaN(cloned.getTime())) return null;
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    const XLSXLib = globalThis?.XLSX;
    if (XLSXLib?.SSF?.parse_date_code) {
      const parsed = XLSXLib.SSF.parse_date_code(value);
      if (parsed) {
        const date = new Date(
          parsed.y,
          (parsed.m || 1) - 1,
          parsed.d || 1,
          parsed.H || 0,
          parsed.M || 0,
          parsed.S || 0,
          parsed.u || 0
        );
        if (!Number.isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
    }
    const timestamp = (value - 25569) * 86400000;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.includes("/") ? text : text.replace(/-/g, "/");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isWeekday(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const w = date.getDay();
  return w >= 1 && w <= 5;
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
  if (Number.isNaN(t.getTime())) return t;
  const w = t.getDay() || 7;
  t.setDate(t.getDate() - (w - 1));
  t.setHours(0, 0, 0, 0);
  return t;
}

export function fridayOf(date) {
  const m = mondayOf(date);
  if (!(m instanceof Date) || Number.isNaN(m.getTime())) return m;
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

export function isMissingRaw(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  const s = String(value).trim();
  if (!s) return true;
  const plain = s.replace(/\u200B/g, "");
  if (MISSING_STRINGS.has(plain)) return true;
  const stripped = plain.endsWith("%") ? plain.slice(0, -1).trim() : plain;
  if (!stripped) return true;
  return MISSING_STRINGS.has(stripped);
}

export function missingToNull(value) {
  return isMissingRaw(value) ? null : value;
}

export function toNumberOrNull(value) {
  const normalized = missingToNull(value);
  if (normalized === null) return null;
  let text = String(normalized).trim();
  if (text.endsWith("%")) text = text.slice(0, -1).trim();
  const num = Number(text.replace(/,/g, ""));
  return Number.isNaN(num) ? null : num;
}

export function toPctString4OrNull(value) {
  const normalized = missingToNull(value);
  if (normalized === null) return null;
  let text = String(normalized).trim();
  if (text.endsWith("%")) text = text.slice(0, -1).trim();
  const num = Number(text);
  return Number.isNaN(num) ? null : `${num.toFixed(4)}%`;
}

const utils = {
  normalizeHeaderLabel,
  buildHeaderIndex,
  findColIndex,
  toDateSafe,
  isWeekday,
  lastFridayFromToday,
  mondayOf,
  fridayOf,
  prevCompletedWeekRange,
  isMissingRaw,
  missingToNull,
  toNumberOrNull,
  toPctString4OrNull,
};

if (typeof window !== "undefined") {
  window.xlsx2jsonUtils = {
    ...(window.xlsx2jsonUtils || {}),
    ...utils,
  };
}

export default utils;
