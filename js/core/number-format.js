/**
 * 数值格式化工具：提供千分位、百分比与“亿”单位转换。
 * 所有函数均返回字符串表示，不改变原始数据。
 */

/**
 * 将数值格式化为千分位文本，空值返回 '--'。
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatComma(value) {
  if (value == null || value === '') return '--';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}

/**
 * 将数值格式化为百分比字符串，默认保留两位小数。
 * 已包含 % 的字符串将直接清洗后输出。
 * @param {number|string|null|undefined} value
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatPercent(value, digits = 2) {
  if (value == null || value === '') return '--';
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const trimmed = value.trim();
    const numeric = Number(trimmed.slice(0, -1));
    if (Number.isNaN(numeric)) return trimmed;
    return `${numeric.toFixed(digits)}%`;
  }
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `${num.toFixed(digits)}%`;
}

/**
 * 金额换算为“亿”单位文本，保留两位小数。
 * @param {number|string|null|undefined} value - 原始金额，单位为元。
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatYi(value, digits = 2) {
  if (value == null || value === '') return '--';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `${(num / 1e8).toFixed(digits)} 亿`;
}
