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
