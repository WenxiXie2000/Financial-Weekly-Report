import { formatYi as formatYiCore } from './core/number-format.js';

/**
 * 前端展示层常用格式化工具：处理“亿”单位、百分比/倍率文本等。
 * 这些函数仅负责展示字符串，不引入数值运算副作用。
 */

export const formatYi = formatYiCore;

/**
 * 约定：传入值已带 % 符号或为字符串，空值统一为 --。
 * @param {string|number|null|undefined} val
 * @returns {string}
 */
export function asPercent(val) {
  if (val == null || val === '') return '--';
  return String(val);
}

/**
 * 将倍率值格式化为 `X.xx x` 形式。
 * @param {number|string|null|undefined} val
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatRatio(val, digits = 2) {
  if (val == null || val === '') return '--';
  const n = Number(val);
  return Number.isNaN(n) ? String(val) : `${n.toFixed(digits)}x`;
}

/**
 * ECharts 轴标签格式化工具：数值转换为百分号文本。
 * @param {number|string} v
 * @returns {string|number}
 */
export function percentAxisLabel(v) {
  const n = Number(v);
  return Number.isNaN(n) ? v : `${n.toFixed(2)}%`;
}

export { lastFridayFromToday, mondayOf, fridayOf, prevCompletedWeekRange } from './x2j/utils.js';
