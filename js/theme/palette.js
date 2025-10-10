/**
 * 主题色板：统一定义各视图使用的颜色/渐变策略。
 * - COLORS.* 通过 CSS 变量读取，允许 /css/style.css 控制主题切换。
 * - GRADIENTS 主要用于柱状图面积，命名约定：bar{Tone}。
 * - styleFor 根据 paletteKey + type 选择合适色值，视图可自定义 paletteKey 调整配色。
 *   若需要特殊颜色，可在视图中自行覆盖，但务必注明原因以便维护。
 */
import { cssVar, makeLinearGradient } from '../views/common-charts.js';

const DEFAULTS = {
  primary: '#409EFF',
  success: '#1a944e',
  danger: '#d92020',
  info: '#0066cc',
  violet: '#7C67E5',
  muted: '#8C8C8C',
  grid: 'rgba(0,0,0,.08)',
};

export const COLORS = {
  primary: () => cssVar('--c-primary', DEFAULTS.primary),
  success: () => cssVar('--c-success', DEFAULTS.success),
  danger: () => cssVar('--c-danger', DEFAULTS.danger),
  info: () => cssVar('--c-info', DEFAULTS.info),
  warning: () => cssVar('--c-warning', '#E6A23C'),
  violet: () => cssVar('--c-violet', DEFAULTS.violet),
  muted: () => cssVar('--c-muted', DEFAULTS.muted),
  text2: () => cssVar('--text2', '#666'),
  grid: () => cssVar('--grid-line', DEFAULTS.grid),
};

export const GRADIENTS = {
  barBlue: () => makeLinearGradient('#66bfff', '#0066cc', COLORS.info()),
  barGreen: () => makeLinearGradient('#a6e6b9', '#1a944e', COLORS.success()),
  barRed: () => makeLinearGradient('#f9b5b5', '#d92020', COLORS.danger()),
};

function pickBarColor(paletteKey, value) {
  if (paletteKey === 'barAmount' || paletteKey === 'barFlow') {
    return GRADIENTS.barBlue();
  }
  if (paletteKey === 'barPositive') {
    return value >= 0 ? GRADIENTS.barGreen() : GRADIENTS.barRed();
  }
  if (paletteKey === 'barNegative') {
    return value >= 0 ? GRADIENTS.barGreen() : GRADIENTS.barRed();
  }
  return GRADIENTS.barBlue();
}

function pickLineColor(paletteKey) {
  if (paletteKey === 'linePrimary' || paletteKey === 'lineAmountChg') {
    return COLORS.primary();
  }
  if (paletteKey === 'barPositive') {
    return COLORS.success();
  }
  if (paletteKey === 'barNegative') {
    return COLORS.danger();
  }
  if (paletteKey === 'barFlow') {
    return COLORS.violet();
  }
  return COLORS.primary();
}

/**
 * 返回指定 paletteKey 的样式配置。
 * @param {string} paletteKey - 颜色语义标识，例如 linePrimary/barPositive。
 * @param {'line'|'bar'} type - 图表类型，决定输出字段。
 * @param {number} [value=0] - 对于 barPositive/barNegative，使用数值判断正负色。
 * @returns {{lineColor?: string, areaColor?: string, barColor?: string}}
 */
export function styleFor(paletteKey, type, value = 0) {
  if (type === 'bar') {
    return {
      barColor: pickBarColor(paletteKey, value),
      lineColor: undefined,
      areaColor: undefined,
    };
  }

  const lineColor = pickLineColor(paletteKey);
  return {
    lineColor,
    areaColor: lineColor,
    barColor: undefined,
  };
}
