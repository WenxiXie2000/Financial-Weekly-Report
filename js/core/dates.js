/**
 * 日期时间工具：提供日期标签、序列归一化与时间区间裁剪。
 */

function parseDateLike(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const candidates = [text, text.replace(/\./g, '-'), text.replace(/-/g, '/')];
  for (const candidate of candidates) {
    const dt = new Date(candidate);
    if (!Number.isNaN(dt.getTime())) {
      return dt;
    }
  }
  const timestamp = Number(text);
  if (Number.isFinite(timestamp)) {
    const dt = new Date(timestamp);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

/**
 * 将日期值格式化为 `MM-DD` 标签；无法解析时返回原始字符串。
 * @param {string|number|Date} value
 * @returns {string}
 */
export function fmtDateLabel(value) {
  const date = parseDateLike(value);
  if (!date) return value == null ? '' : String(value);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/**
 * 将原始点位数组转换为时间戳+数值对，并按时间排序。
 * 无法解析的条目按原序保留。
 * @param {Array<[unknown, unknown]>} arr
 * @returns {Array<[number, number]>}
 */
export function normalizePoints(arr = []) {
  const pairs = Array.isArray(arr) ? arr : [];
  const normalized = [];
  pairs.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const [rawDate, rawValue] = entry;
    const parsed = parseDateLike(rawDate);
    if (!parsed) return;
    const iso = parsed.toISOString().slice(0, 10);
    const num = Number(rawValue);
    normalized.push([iso, Number.isFinite(num) ? num : null]);
  });
  return normalized.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * 按时间区间裁剪点位数据，闭区间 [start, end]。
 * @param {Array<[number, number]>} points - normalizePoints 输出
 * @param {Array<string|number|Date>} range
 * @returns {Array<[number, number]>}
 */
export function sliceByRange(points = [], range = []) {
  if (!Array.isArray(points) || !points.length) return [];
  if (!Array.isArray(range) || range.length < 2) return [...points];
  const [startRaw, endRaw] = range;
  const start = parseDateLike(startRaw);
  const end = parseDateLike(endRaw);
  const startTs = start ? start.getTime() : Number(startRaw);
  const endTs = end ? end.getTime() : Number(endRaw);
  const hasStart = Number.isFinite(startTs);
  const hasEnd = Number.isFinite(endTs);
  return points.filter(([time]) => {
    const parsed = parseDateLike(time);
    const ts = parsed ? parsed.getTime() : Number(time);
    if (!Number.isFinite(ts)) return true;
    if (hasStart && ts < startTs) return false;
    if (hasEnd && ts > endTs) return false;
    return true;
  });
}

/**
 * 构造 ECharts time 轴配置；短周期内强制展示全部刻度。
 * @param {Array<string|number|Date>} dates
 * @param {{shortMaxPoints?:number}} [opts]
 * @returns {object}
 */
export function buildTimeXAxis(dates = [], opts = {}) {
  const count = Array.isArray(dates) ? dates.length : 0;
  const shortSpan = count > 0 && count <= (opts.shortMaxPoints ?? 7);

  return {
    type: 'time',
    boundaryGap: false,
    axisLabel: {
      formatter: (value) => fmtDateLabel(value),
      hideOverlap: shortSpan ? false : undefined,
      showMinLabel: shortSpan ? true : undefined,
      showMaxLabel: shortSpan ? true : undefined,
    },
    axisPointer: { show: true, snap: true },
    splitNumber: shortSpan ? count : undefined,
  };
}
