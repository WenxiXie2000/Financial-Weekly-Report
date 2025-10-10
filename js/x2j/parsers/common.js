import {
  normalizeHeaderLabel,
  findColIndex,
  toDateSafe,
  isWeekday,
  prevCompletedWeekRange,
} from '../utils.js';

export const pad2 = (value) => String(value).padStart(2, '0');

export const formatDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const fmtISO = (date) => formatDate(date);

export const toDate = (value) => {
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    if (globalThis?.XLSX?.SSF?.parse_date_code) {
      const parsed = globalThis.XLSX.SSF.parse_date_code(value);
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
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.includes('/') ? trimmed : trimmed.replace(/-/g, '/');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }
  return null;
};

export const toISODateSafe = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = pad2(value.getMonth() + 1);
    const day = pad2(value.getDate());
    const hour = pad2(value.getHours());
    const minute = pad2(value.getMinutes());
    return value.getHours() || value.getMinutes()
      ? `${year}-${month}-${day} ${hour}:${minute}`
      : `${year}-${month}-${day}`;
  }

  const text = String(value ?? '').trim();
  if (!text) return '';
  const normalized = text.replace(/\//g, '-');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = pad2(parsed.getMonth() + 1);
    const day = pad2(parsed.getDate());
    const hour = pad2(parsed.getHours());
    const minute = pad2(parsed.getMinutes());
    return /:/.test(text) ? `${year}-${month}-${day} ${hour}:${minute}` : `${year}-${month}-${day}`;
  }
  return text;
};

export const normalizeDateValue = (value) => {
  const date = toDate(value);
  if (date) {
    return { date, display: formatDate(date) };
  }
  const display = value == null ? '' : String(value).trim();
  return { date: null, display };
};

export const describeMatcher = (matcher) => {
  if (matcher instanceof RegExp) return matcher.toString();
  if (Array.isArray(matcher)) {
    return matcher.map((item) => describeMatcher(item)).join(' / ');
  }
  return String(matcher ?? '');
};

export const closestHeaders = (header, pattern, topK = 3) => {
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
};

export const parsePercentNumber = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.endsWith('%') ? text.slice(0, -1) : text;
  const num = Number(normalized.replace(/,/g, ''));
  return Number.isNaN(num) ? null : num;
};

export const parseNumberLike = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const num = Number(String(value).trim().replace(/,/g, ''));
  return Number.isNaN(num) ? null : num;
};

export const formatNumber4 = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    return value.toFixed(4);
  }
  const text = String(value).trim();
  if (!text) return null;
  const num = Number(text.replace(/,/g, ''));
  return Number.isNaN(num) ? null : num.toFixed(4);
};

export const formatPercent4 = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    return `${value.toFixed(4)}%`;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (text.endsWith('%')) {
    const num = Number(text.slice(0, -1).replace(/,/g, ''));
    return Number.isNaN(num) ? `${text}` : `${num.toFixed(4)}%`;
  }
  const num = Number(text.replace(/,/g, ''));
  return Number.isNaN(num) ? `${text}` : `${num.toFixed(4)}%`;
};

/**
 * 计算序列的日期范围，常用于 diagnostics.extra.dateRange。
 * @param {Array<{data: Array<[string, unknown]>}>} [series=[]]
 * @returns {[string, string]|null}
 */
export const deriveRange = (series = []) => {
  let minDate = null;
  let maxDate = null;
  series.forEach((item) => {
    if (!item || !Array.isArray(item.data)) return;
    item.data.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length === 0) return;
      const raw = entry[0];
      const parsed = toDate(raw) || new Date(raw);
      if (!parsed || Number.isNaN(parsed.getTime())) return;
      if (!minDate || parsed < minDate) {
        minDate = new Date(parsed.getTime());
      }
      if (!maxDate || parsed > maxDate) {
        maxDate = new Date(parsed.getTime());
      }
    });
  });
  if (!minDate || !maxDate) {
    return null;
  }
  return [formatDate(minDate), formatDate(maxDate)];
};

/**
 * 根据日期列提取“上一完整工作周”内的行。
 * - 解析器使用 profile.rangeDefault（prevCompletedWeek/prevWeekWorkdays）时调用。
 * - 自动跳过无效日期，确保 diagnostics 中 points/dateRange 可信。
 * @param {Array} rows
 * @param {number} dateIdx
 * @param {Date} [now=new Date()]
 * @returns {Array<{row: Array, date: Date}>}
 */
export const computePrevWeekWorkdays = (rows, dateIdx, now = new Date()) => {
  if (!Array.isArray(rows) || typeof dateIdx !== 'number' || dateIdx < 0) return [];

  const enriched = rows
    .map((row) => ({ row, date: toDateSafe(row?.[dateIdx]) }))
    .filter((item) => item.row && item.date instanceof Date && !Number.isNaN(item.date.getTime()));

  if (!enriched.length) return [];

  const baseNow =
    now instanceof Date && !Number.isNaN(now.getTime())
      ? new Date(now.getTime())
      : new Date(now || Date.now());
  baseNow.setHours(0, 0, 0, 0);

  const { mon, fri } = prevCompletedWeekRange(baseNow);
  if (
    !(mon instanceof Date) ||
    Number.isNaN(mon.getTime()) ||
    !(fri instanceof Date) ||
    Number.isNaN(fri.getTime())
  ) {
    return [];
  }

  return enriched.filter(({ date }) => date >= mon && date <= fri && isWeekday(date));
};

export const pickLatestWeekRow = (rows, dateIdx, now = new Date()) => {
  if (!Array.isArray(rows) || typeof dateIdx !== 'number' || dateIdx < 0) return null;

  const weekRows = computePrevWeekWorkdays(rows, dateIdx, now);
  if (!weekRows.length) return null;

  const latest = weekRows.reduce((prev, cur) => (cur.date > prev.date ? cur : prev));
  if (!latest || !latest.row) return null;

  return {
    row: latest.row,
    date: latest.date,
  };
};

export const ensureArray = (value) => (Array.isArray(value) ? value : []);

export const requireColumn = (header, matcher, { allowMissing = false } = {}) => {
  const idx = findColIndex(header, matcher);
  if (idx < 0 && !allowMissing) {
    const label = describeMatcher(matcher);
    throw new Error(`列未找到：${label}`);
  }
  return idx;
};

export const createSheetDiagnostics = (sheet) => ({
  sheet: String(sheet ?? ''),
  items: [],
  dateCol: null,
  range: null,
});

export const trackColumn = (
  diagnostics,
  header,
  matcher,
  { category = 'column', label, note, allowMissing = true, extra } = {}
) => {
  if (!diagnostics || !Array.isArray(diagnostics.items)) {
    throw new Error('diagnostics 对象无效');
  }
  const idx = findColIndex(header, matcher);
  const matched = idx >= 0;
  const column = matched ? String(header[idx] ?? '') : null;
  const entry = {
    category,
    label: label || describeMatcher(matcher),
    matcher: describeMatcher(matcher),
    matched,
    column,
    index: matched ? idx : null,
    closest: matched ? [] : closestHeaders(header, matcher),
  };
  if (note) entry.note = note;
  if (extra) entry.extra = extra;
  diagnostics.items.push(entry);
  if (!allowMissing && !matched) {
    const error = new Error(`列未找到：${entry.label}`);
    error.code = 'COL_NOT_FOUND';
    throw error;
  }
  return idx;
};
