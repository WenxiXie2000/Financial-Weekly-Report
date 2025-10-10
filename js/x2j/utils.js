const MISSING_STRINGS = new Set([
  '-',
  '--',
  '---',
  '—',
  '——',
  '— —',
  '–',
  'N/A',
  'NA',
  'NaN',
  'NULL',
  'null',
  '无',
]);

export function normalizeHeaderLabel(input) {
  const s = String(input ?? '').trim();
  let t = s.replace(/\s+/g, '');
  t = t.replace(/[（(][^）)]*[）)]\s*$/, '');
  return t;
}

export function readHeaderRowSmart(ws, XLSXLib = globalThis?.XLSX) {
  if (!ws || !XLSXLib?.utils || typeof XLSXLib.utils.decode_range !== 'function') {
    return { headerRow: 0, headers: [] };
  }

  const ref = ws['!ref'];
  if (!ref) return { headerRow: 0, headers: [] };

  const XLSXUtils = XLSXLib.utils;
  const rg = XLSXUtils.decode_range(ref);
  const merges = Array.isArray(ws['!merges']) ? ws['!merges'] : [];

  const getCell = (r, c) => ws[XLSXUtils.encode_cell({ r, c })];
  const setCell = (r, c, v) => {
    ws[XLSXUtils.encode_cell({ r, c })] = { t: 's', v };
  };

  merges.forEach((merge) => {
    const anchor = getCell(merge.s.r, merge.s.c);
    if (!anchor || anchor.v == null) return;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        const cell = getCell(r, c);
        if (!cell || cell.v == null || cell.v === '') {
          setCell(r, c, anchor.v);
        }
      }
    }
  });

  const normalize = (value) =>
    String(value ?? '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[（）]/g, (m) => ({ '（': '(', '）': ')' }[m]))
      .trim();

  let best = { row: rg.s.r, headers: [], nonEmpty: -1 };
  const scanMax = Math.min(rg.s.r + 4, rg.e.r);
  for (let r = rg.s.r; r <= scanMax; r += 1) {
    const headers = [];
    let nonEmpty = 0;
    for (let c = rg.s.c; c <= rg.e.c; c += 1) {
      const value = getCell(r, c)?.v;
      const normalized = normalize(value);
      headers.push(normalized);
      if (normalized) nonEmpty += 1;
    }
    if (nonEmpty > best.nonEmpty) {
      best = { row: r, headers, nonEmpty };
    }
  }

  return { headerRow: best.row, headers: best.headers };
}

export function normalizeHeaderCell(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function buildHeaderIndex(header) {
  if (
    header &&
    typeof header === 'object' &&
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
  const key = matcher != null ? String(matcher) : '';
  if (map.has(key)) return map.get(key);
  const normalizedKey = normalizeHeaderLabel(key);
  if (map.has(normalizedKey)) return map.get(normalizedKey);
  return norm.findIndex((cell) => cell === normalizedKey);
}

export function closestHeaderCandidates(header, pattern, topK = 3) {
  const target = normalizeHeaderLabel(
    pattern instanceof RegExp ? String(pattern).replace(/^\/|\/[a-z]*$/gi, '') : pattern
  );
  if (!target) return [];

  const score = (source) => {
    const normalized = normalizeHeaderLabel(source);
    const m = normalized.length;
    const n = target.length;
    if (!m || !n) return 0;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        if (normalized[i - 1] === target[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp[m][n] / Math.max(m, n);
  };

  return (header || [])
    .map((col) => [String(col ?? ''), score(col)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([col]) => col)
    .filter(Boolean);
}

export function toDateSafe(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    if (Number.isNaN(cloned.getTime())) return null;
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
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
  const raw = String(value).trim();
  if (!raw) return null;

  const normalizedText = raw.replace(/[\u3000]/g, ' ');
  const normalizedDate = new Date(normalizedText.replace(/\//g, '-'));
  if (!Number.isNaN(normalizedDate.getTime())) {
    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate;
  }

  const intervalMatch = normalizedText.match(
    /(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})\s*[\uFF5E~\-至]+\s*(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/
  );
  if (intervalMatch) {
    const wrapYear = (segment) => {
      const str = String(segment);
      if (str.length === 2) {
        const num = Number(str);
        return num >= 70 ? 1900 + num : 2000 + num;
      }
      return Number(str);
    };

    const year = wrapYear(intervalMatch[4]);
    const month = Number(intervalMatch[5]);
    const day = Number(intervalMatch[6]);
    const tailDate = new Date(year, month - 1, day);
    if (!Number.isNaN(tailDate.getTime())) {
      tailDate.setHours(0, 0, 0, 0);
      return tailDate;
    }
  }

  const shortYearMatch = normalizedText.match(/^\s*(\d{2})-(\d{1,2})-(\d{1,2})\s*$/);
  if (shortYearMatch) {
    const twoDigitYear = Number(shortYearMatch[1]);
    // Interpret 00-69 as 2000-2069, 70-99 as 1970-1999（pending）
    const year = twoDigitYear >= 70 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
    const month = Number(shortYearMatch[2]);
    const day = Number(shortYearMatch[3]);
    const shortDate = new Date(year, month - 1, day);
    if (!Number.isNaN(shortDate.getTime())) {
      shortDate.setHours(0, 0, 0, 0);
      return shortDate;
    }
  }

  return null;
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
  if (typeof value === 'number') return Number.isNaN(value);
  const s = String(value).trim();
  if (!s) return true;
  const plain = s.replace(/\u200B/g, '');
  if (MISSING_STRINGS.has(plain)) return true;
  const stripped = plain.endsWith('%') ? plain.slice(0, -1).trim() : plain;
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
  if (text.endsWith('%')) text = text.slice(0, -1).trim();
  const num = Number(text.replace(/,/g, ''));
  return Number.isNaN(num) ? null : num;
}

export function toNumberFixed(value, digits = 4) {
  const num = toNumberOrNull(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

export function toPercentFixed(value, digits = 4) {
  const num = toNumberOrNull(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

export function ymd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toPctString4OrNull(value) {
  const normalized = missingToNull(value);
  if (normalized === null) return null;
  let text = String(normalized).trim();
  if (text.endsWith('%')) text = text.slice(0, -1).trim();
  const num = Number(text);
  return Number.isNaN(num) ? null : `${num.toFixed(4)}%`;
}

export function cloneDataset(data) {
  return data == null ? null : JSON.parse(JSON.stringify(data));
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function cloneDiagnostics(diag, fallbackSheet) {
  if (!diag || !Array.isArray(diag.items)) return null;
  const sheetName = diag.sheet || (fallbackSheet != null ? String(fallbackSheet) : '');
  const cloned = {
    sheet: sheetName,
    items: diag.items.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const clonedEntry = { ...item };
      if (Array.isArray(item.closest)) {
        clonedEntry.closest = [...item.closest];
      }
      if (item.extra && typeof item.extra === 'object') {
        clonedEntry.extra = { ...item.extra };
      }
      return clonedEntry;
    }),
  };
  if (Object.prototype.hasOwnProperty.call(diag, 'dateCol')) {
    cloned.dateCol = diag.dateCol ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(diag, 'range')) {
    cloned.range = diag.range ?? null;
  }
  return cloned;
}

export function dedupeSortedPairs(pairs) {
  const result = [];
  for (const point of pairs) {
    if (!Array.isArray(point) || point.length === 0) continue;
    const key = point[0];
    if (result.length && result[result.length - 1][0] === key) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }
  return result;
}

export function mergeSeries(targetList = [], incomingList = []) {
  const map = new Map();
  targetList.forEach((serie) => {
    if (!serie || !serie.name) return;
    const clone = {
      ...serie,
      data: ensureArray(serie.data).map((item) => (Array.isArray(item) ? [...item] : item)),
    };
    map.set(serie.name, clone);
  });

  incomingList.forEach((serie) => {
    if (!serie || !serie.name) return;
    const existing = map.get(serie.name);
    const incomingData = ensureArray(serie.data).map((item) =>
      Array.isArray(item) ? [...item] : item
    );
    if (existing) {
      const merged = ensureArray(existing.data)
        .concat(incomingData)
        .filter((item) => Array.isArray(item) && item.length >= 2)
        .sort((a, b) => new Date(a[0]) - new Date(b[0]));
      existing.data = dedupeSortedPairs(merged);
    } else {
      map.set(serie.name, {
        ...serie,
        data: incomingData,
      });
    }
  });

  return Array.from(map.values());
}

const exported = {
  normalizeHeaderLabel,
  normalizeHeaderCell,
  readHeaderRowSmart,
  buildHeaderIndex,
  findColIndex,
  closestHeaderCandidates,
  toDateSafe,
  isWeekday,
  lastFridayFromToday,
  mondayOf,
  fridayOf,
  prevCompletedWeekRange,
  isMissingRaw,
  missingToNull,
  toNumberOrNull,
  toNumberFixed,
  toPercentFixed,
  toPctString4OrNull,
  ymd,
  cloneDataset,
  ensureArray,
  cloneDiagnostics,
  dedupeSortedPairs,
  mergeSeries,
};

if (typeof window !== 'undefined') {
  window.x2jUtils = {
    ...(window.x2jUtils || {}),
    ...exported,
  };
  window.xlsx2jsonUtils = {
    ...(window.xlsx2jsonUtils || {}),
    ...exported,
  };
}

export default exported;
