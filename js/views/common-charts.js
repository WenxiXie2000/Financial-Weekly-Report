import { styleFor, COLORS } from '../theme/palette.js';

export function ensureEcharts() {
  if (!window || !window.echarts) throw new Error('ECharts 未加载');
}

// 解析 CSS 变量 -> 真实颜色；带简单缓存
const __cssVarCache = new Map();

export function cssVar(name, fallback = '') {
  if (!name) return fallback;
  if (typeof document === 'undefined') return fallback;
  const docEl = document.documentElement;
  if (!docEl) return fallback;
  const themeAttr = docEl.getAttribute('data-theme') || '';
  const className = docEl.className || '';
  const key = `${name}::${themeAttr}::${className}`;
  if (__cssVarCache.has(key)) {
    return __cssVarCache.get(key);
  }

  const styles = getComputedStyle(docEl);
  const value = styles.getPropertyValue(name);
  const color = (value || '').trim() || fallback;
  __cssVarCache.set(key, color);
  return color;
}

export function clearCssVarCache() {
  __cssVarCache.clear();
}

export function makeLinearGradient(topColor, bottomColor, fallbackHex = '#409EFF') {
  const top = topColor || fallbackHex;
  const bottom = bottomColor || fallbackHex;
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ]);
}

export function fmtDateLabel(value) {
  const dt = new Date(String(value).replace(/-/g, '/'));
  if (Number.isNaN(dt.getTime())) return String(value ?? '');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return '--';
  return num.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export function formatYi(value, digits = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return '--';
  return `${(num / 1e8).toFixed(digits)} 亿`;
}

const __charts = new Set();
let __resizeAttached = false;

function __onResize() {
  __charts.forEach((chart) => {
    try {
      chart.resize();
    } catch (err) {
      console.warn('[common-charts] resize chart failed', err);
    }
  });
}

function __attachResize() {
  if (__resizeAttached) return;
  window.addEventListener('resize', __onResize);
  __resizeAttached = true;
}

function __detachResizeIfIdle() {
  if (__resizeAttached && __charts.size === 0) {
    window.removeEventListener('resize', __onResize);
    __resizeAttached = false;
  }
}

export function registerChart(chart) {
  if (!chart) return;
  __charts.add(chart);
  __attachResize();
}

export function disposeAllCharts() {
  __charts.forEach((chart) => {
    try {
      chart.dispose();
    } catch (err) {
      console.warn('[common-charts] dispose chart failed', err);
    }
  });
  __charts.clear();
  __detachResizeIfIdle();
}

export function resizeAllCharts() {
  __onResize();
}

export function waitElementSized(el, { timeout = 1000 } = {}) {
  return new Promise((resolve) => {
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      resolve(true);
      return;
    }

    let done = false;
    const ro = new ResizeObserver(() => {
      if (!done && el.offsetWidth > 0 && el.offsetHeight > 0) {
        done = true;
        ro.disconnect();
        resolve(true);
      }
    });

    if (el) {
      ro.observe(el);
    }

    setTimeout(() => {
      if (!done) {
        done = true;
        ro.disconnect();
        resolve(false);
      }
    }, timeout);
  });
}

export async function renderMini(el, type, seriesPairs, options = {}) {
  ensureEcharts();

  const { percentLabel, percent, unit = null, paletteKey = 'linePrimary' } = options;
  const showPercent = percentLabel ?? percent ?? false;

  const axisFormatter = (val) => {
    if (val == null || Number.isNaN(Number(val))) return '';
    if (showPercent) return `${Number(val).toFixed(2)}%`;
    if (unit === 'yi') return (Number(val) / 1e8).toFixed(2);
    return formatNumber(val, 2);
  };

  const tooltipFormatter = (val) => {
    if (val == null || Number.isNaN(Number(val))) return '--';
    if (showPercent) return `${Number(val).toFixed(2)}%`;
    if (unit === 'yi') return formatYi(val, 2);
    return formatNumber(val, 2);
  };

  const loading = document.createElement('div');
  loading.textContent = '加载中…';
  loading.style.cssText = 'opacity:.6;font-size:12px;padding:6px;';
  if (el && !el.firstChild) {
    el.appendChild(loading);
  }

  await waitElementSized(el);

  const normalizedPairs = (seriesPairs ?? []).map((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) {
      return [entry?.[0] ?? '', null];
    }
    const [date, raw] = entry;
    const num = raw == null ? null : Number(raw);
    return [date, Number.isNaN(num) ? null : num];
  });

  const hasValues = normalizedPairs.some(([, value]) => value != null);
  if (!hasValues) {
    if (loading.parentNode) loading.parentNode.removeChild(loading);
    return null;
  }

  try {
    const chart = echarts.init(el);

    const xAxisData = normalizedPairs.map(([d]) => fmtDateLabel(d));
    const seriesData = normalizedPairs.map(([, value]) => value);
    const rawValues = seriesData.filter(
      (value) => typeof value === 'number' && !Number.isNaN(value)
    );
    const safeValues = rawValues.length ? rawValues : [0];
    const vMin = Math.min(...safeValues);
    const vMax = Math.max(...safeValues);
    const spread =
      Number.isFinite(vMax - vMin) && vMax - vMin > 0 ? vMax - vMin : Math.abs(vMax || 1);
    const pad = Math.max(spread * 0.1, Math.abs(vMax || 1) * 0.02);
    const yMin = showPercent ? Math.min(0, vMin - pad) : vMin - pad;
    const yMax = vMax + pad;
    const seriesStyle = styleFor(paletteKey, type, safeValues[safeValues.length - 1] ?? 0);
    const baseColor = seriesStyle.lineColor || seriesStyle.barColor || COLORS.primary();
    const axisLabelColor = COLORS.text2();
    const gridLineColor = COLORS.grid();
    const barColorFor = (value) => styleFor(paletteKey, 'bar', value).barColor;

    chart.setOption({
      color: [baseColor],
      grid: { left: 48, right: 24, top: 28, bottom: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter: (items) => {
          const first = Array.isArray(items) ? items[0] : items;
          if (!first) return '';
          const date = first.axisValueLabel;
          const raw = first.data;
          if (raw == null || raw === '') return `${date}<br/>--`;
          const val = Number(raw);
          if (Number.isNaN(val)) return `${date}<br/>--`;
          return `${date}<br/>${tooltipFormatter(val)}`;
        },
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: axisLabelColor },
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        scale: true,
        boundaryGap: [0, 0],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: axisLabelColor,
          formatter: (v) => axisFormatter(v),
        },
        splitLine: {
          lineStyle: {
            color: gridLineColor,
          },
        },
      },
      series: [
        {
          type,
          data: seriesData,
          showSymbol: type === 'line' ? false : true,
          smooth: type === 'line',
          barWidth: type === 'bar' ? '52%' : undefined,
          barMinHeight: type === 'bar' ? 3 : undefined,
          itemStyle:
            type === 'bar'
              ? {
                  color: (p) => barColorFor(p?.value ?? 0),
                }
              : { color: seriesStyle.lineColor || baseColor },
          lineStyle: { width: 2, color: seriesStyle.lineColor || baseColor, opacity: 0.95 },
          areaStyle:
            type === 'line'
              ? {
                  color: seriesStyle.areaColor || seriesStyle.lineColor || baseColor,
                  opacity: 0.12,
                }
              : undefined,
        },
      ],
    });

    registerChart(chart);

    requestAnimationFrame(() => {
      try {
        chart.resize();
      } catch (err) {
        console.warn('[common-charts] resize after init failed', err);
      }
    });

    return chart;
  } finally {
    if (loading.parentNode) loading.parentNode.removeChild(loading);
  }
}
