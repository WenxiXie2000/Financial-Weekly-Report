/**
 * 图表工具模块：封装 ECharts 公共逻辑和配色策略。
 * - 提供 cssVar/styleFor 等接口，为所有视图共享颜色/渐变。
 * - 管理图表实例的 resize/dispose 生命周期，便于路由切换时统一清理。
 * - 提供 renderMini/renderLineChart 等基础渲染函数，视图文件按需组合。
 */
import { styleFor, COLORS } from '../theme/palette.js';

/**
 * 保障 ECharts 已加载，便于在工具页/主站缺失依赖时快速定位。
 * @throws {Error} - window.echarts 不存在时抛出。
 */
export function ensureEcharts() {
  if (!window || !window.echarts) throw new Error('ECharts 未加载');
}

// 解析 CSS 变量 -> 真实颜色；带简单缓存
const __cssVarCache = new Map();

/**
 * 读取 CSS 变量值并做简易缓存，支持主题切换。
 * @param {string} name
 * @param {string} [fallback='']
 * @returns {string}
 */
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

const DEFAULT_PALETTE_SLOTS = [
  ['--blue-600', '#2B7BEB'],
  ['--amber-600', '#F5A623'],
  ['--violet-600', '#7B61FF'],
  ['--teal-600', '#14B8A6'],
  ['--rose-600', '#E11D48'],
  ['--gray-600', '#475569'],
];

/**
 * 构建颜色调色板，允许扩展/兜底。
 * @param {{extend?: string[], fallback?: string[]}} overrides
 * @returns {string[]}
 */
export function resolvePalette(overrides = {}) {
  const { extend = [], fallback = [] } = overrides || {};
  const palette = [];

  for (const [varName, fallback] of DEFAULT_PALETTE_SLOTS) {
    const color = cssVar(varName, fallback);
    if (color) palette.push(color.trim());
  }

  if (Array.isArray(extend)) {
    for (const color of extend) {
      if (typeof color === 'string' && color.trim()) {
        palette.push(color.trim());
      }
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const color of palette) {
    const key = color.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(color);
  }

  if (deduped.length) return deduped;

  const usableFallback = Array.isArray(fallback)
    ? fallback.filter((color) => typeof color === 'string' && color.trim())
    : [];
  if (usableFallback.length) {
    return usableFallback.map((color) => color.trim());
  }

  return extend.filter((color) => typeof color === 'string' && color);
}

/**
 * 构造竖向线性渐变，兼容缺省色值。
 * @param {string} topColor
 * @param {string} bottomColor
 * @param {string} [fallbackHex='#409EFF']
 * @returns {import('echarts').LinearGradient}
 */
export function makeLinearGradient(topColor, bottomColor, fallbackHex = '#409EFF') {
  const top = topColor || fallbackHex;
  const bottom = bottomColor || fallbackHex;
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ]);
}

/**
 * 把日期字符串格式化成 MM-DD 标签。
 * @param {string|Date} value
 * @returns {string}
 */
export function fmtDateLabel(value) {
  const dt = new Date(String(value).replace(/-/g, '/'));
  if (Number.isNaN(dt.getTime())) return String(value ?? '');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/**
 * 从表格数据里提取日期-数值对，返回最近 5 条。
 * @param {object[]} table
 * @param {string} dateKey
 * @param {string} valueKey
 * @returns {Array<[string, number|null]>}
 */
export function buildSeriesData(table, dateKey, valueKey) {
  const pairs = [];
  for (const row of Array.isArray(table) ? table : []) {
    const date = row?.[dateKey];
    const value = row?.[valueKey];
    if (date == null || value == null || value === '' || value === '--') continue;
    const num = Number(value);
    pairs.push([String(date), Number.isNaN(num) ? null : num]);
  }
  return pairs.slice(-5);
}

/**
 * 统一的数字格式化，默认保留 2 位小数。
 * @param {number|string} value
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return '--';
  return num.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

/**
 * 将金额换算成“亿”单位文本。
 * @param {number|string} value
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatYi(value, digits = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return '--';
  return `${(num / 1e8).toFixed(digits)} 亿`;
}

const __charts = new Set();
let __resizeAttached = false;

function __detachResizeIfIdle() {
  if (typeof window === 'undefined') return;
  if (__resizeAttached && __charts.size === 0) {
    window.removeEventListener('resize', __onResize);
    __resizeAttached = false;
  }
}

function __ensureAttached() {
  if (typeof window === 'undefined') return;
  if (!__resizeAttached) {
    window.addEventListener('resize', __onResize);
    __resizeAttached = true;
  }
}

function __onResize() {
  for (const chart of Array.from(__charts)) {
    try {
      const dom = typeof chart.getDom === 'function' ? chart.getDom() : null;
      if (!dom || (typeof dom === 'object' && 'isConnected' in dom && !dom.isConnected)) {
        __charts.delete(chart);
        continue;
      }
      chart.resize?.();
    } catch (err) {
      console.warn('[common-charts] resize chart failed', err);
      __charts.delete(chart);
    }
  }
  __detachResizeIfIdle();
}

export function addChartForResize(chart) {
  if (!chart) return;
  __charts.add(chart);
  __ensureAttached();
}

export function removeChartFromResize(chart) {
  if (!chart) return;
  __charts.delete(chart);
  __detachResizeIfIdle();
}

export function ensureResizeAttached() {
  __ensureAttached();
}

export function registerChart(chart) {
  if (!chart) return;
  addChartForResize(chart);
}

/**
 * 释放所有已登记的图表实例（切换视图时调用）。
 */
export function disposeAllCharts() {
  const charts = Array.from(__charts);
  charts.forEach((chart) => {
    try {
      removeChartFromResize(chart);
      chart.dispose?.();
    } catch (err) {
      console.warn('[common-charts] dispose chart failed', err);
    }
  });
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

/**
 * 渲染迷你图组件：支持 line/bar，适配百分比/金额单位。
 * - 常用于视图顶部指标卡片，与主图保持一致配色。
 * - 自动根据 seriesPairs 计算 dataMin/dataMax 与 padding，避免坐标轴贴边。
 * @param {HTMLElement} el - 挂载节点，需具备尺寸。
 * @param {'line'|'bar'} type - 图表类型。
 * @param {Array<[string, number|null]>} seriesPairs - 日期+数值序列。
 * @param {{percentLabel?: boolean, percent?: boolean, unit?: 'yi'|null, paletteKey?: string}} [options]
 * @returns {Promise<import('echarts').ECharts|null>} - 若无有效值则返回 null，避免渲染空图。
 */
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
    const nonNullCount = seriesData.filter((value) => value != null && !Number.isNaN(value)).length;
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
          showSymbol: type === 'line' ? nonNullCount <= 1 : true,
          smooth: type === 'line' ? nonNullCount > 1 : false,
          symbolSize: type === 'line' && nonNullCount <= 1 ? 9 : 6,
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

function normalizeLinePoint(entry) {
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const [rawDate, rawValue] = entry;
    if (rawDate == null) return null;
    const parsed = parseNumericValue(rawValue);
    if (parsed == null) return null;
    return [String(rawDate), parsed];
  }

  if (typeof entry === 'object') {
    const rawDate = entry.date ?? entry.x ?? entry[0];
    const rawValue = entry.value ?? entry.y ?? entry[1];
    if (rawDate == null) return null;
    const parsed = parseNumericValue(rawValue);
    if (parsed == null) return null;
    return [String(rawDate), parsed];
  }

  return null;
}

function parseNumericValue(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (Number.isNaN(raw)) return null;
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '--') return null;
    const num = Number(trimmed.replace(/[%]/g, ''));
    return Number.isNaN(num) ? null : num;
  }
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

function sanitizeLineSeries(series = []) {
  return series
    .map((raw) => {
      if (!raw) return null;
      const normalized = { ...raw };
      normalized.type = normalized.type || 'line';
      normalized.connectNulls =
        typeof normalized.connectNulls === 'boolean' ? normalized.connectNulls : true;
      normalized.showSymbol =
        typeof normalized.showSymbol === 'boolean' ? normalized.showSymbol : true;
      normalized.symbolSize = Number.isFinite(normalized.symbolSize) ? normalized.symbolSize : 5;
      normalized.smooth = typeof normalized.smooth === 'boolean' ? normalized.smooth : false;

      const dataPoints = Array.isArray(normalized.data) ? normalized.data : [];
      normalized.data = dataPoints.map((entry) => normalizeLinePoint(entry)).filter(Boolean);

      if (normalized.lineStyle) {
        normalized.lineStyle = { ...normalized.lineStyle };
        delete normalized.lineStyle.color;
        if (typeof normalized.lineStyle.width !== 'number') {
          normalized.lineStyle.width = 2;
        }
        if (typeof normalized.lineStyle.opacity !== 'number') {
          normalized.lineStyle.opacity = 1;
        }
      } else {
        normalized.lineStyle = { width: 2, opacity: 1 };
      }

      if (normalized.itemStyle) {
        normalized.itemStyle = { ...normalized.itemStyle };
        delete normalized.itemStyle.color;
        if (!Object.keys(normalized.itemStyle).length) {
          delete normalized.itemStyle;
        }
      }

      if (normalized.areaStyle) {
        normalized.areaStyle = { ...normalized.areaStyle };
        delete normalized.areaStyle.color;
      }

      return normalized;
    })
    .filter(Boolean);
}

function mergeAxis(defaults, overrides) {
  if (!overrides) return { ...defaults };
  const merged = { ...defaults, ...overrides };
  if (defaults.axisLabel || overrides.axisLabel) {
    merged.axisLabel = { ...defaults.axisLabel, ...overrides.axisLabel };
  }
  if (defaults.splitLine || overrides.splitLine) {
    const defaultStyle = defaults.splitLine?.lineStyle || {};
    const overrideStyle = overrides.splitLine?.lineStyle || {};
    merged.splitLine = {
      ...defaults.splitLine,
      ...overrides.splitLine,
      lineStyle: { ...defaultStyle, ...overrideStyle },
    };
  }
  return merged;
}

function mergeTooltip(defaults, overrides) {
  if (!overrides) return { ...defaults };
  return {
    ...defaults,
    ...overrides,
    axisPointer: { ...defaults.axisPointer, ...overrides.axisPointer },
  };
}

/**
 * 通用折线图渲染器，封装 palette/axis/tooltip 默认值。
 * - 视图层可传入 series/xAxis/yAxis/legend，自定义数据格式。
 * - sanitizeLineSeries 会清洗 data，允许输入 [date, value] 或 {date,value}。
 * @param {HTMLElement} el - 容器元素。
 * @param {import('echarts').EChartsOption} [option]
 * @param {{extend?: string[], fallback?: string[]}} [paletteOptions]
 * @returns {import('echarts').ECharts|null}
 */
export function renderLineChart(el, option = {}, paletteOptions = {}) {
  ensureEcharts();
  if (!el) return null;

  const palette = resolvePalette(paletteOptions);
  const chart = echarts.init(el);

  const { series = [], grid, xAxis, yAxis, tooltip, legend, color, ...rest } = option || {};

  const defaultTooltip = {
    trigger: 'axis',
    axisPointer: { type: 'line' },
  };

  const defaultGrid = {
    left: 48,
    right: 32,
    top: 32,
    bottom: 40,
    containLabel: true,
  };

  const defaultXAxis = {
    type: 'time',
    boundaryGap: false,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: COLORS.text2() },
    splitLine: { show: false },
  };

  const defaultYAxis = {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: COLORS.text2() },
    splitLine: { lineStyle: { color: COLORS.grid() } },
  };

  const finalOption = {
    color: Array.isArray(color) && color.length ? color : palette,
    legend: legend ? { ...legend } : undefined,
    grid: { ...defaultGrid, ...grid },
    xAxis: mergeAxis(defaultXAxis, xAxis),
    yAxis: mergeAxis(defaultYAxis, yAxis),
    tooltip: mergeTooltip(defaultTooltip, tooltip),
    series: sanitizeLineSeries(series),
    ...rest,
  };

  chart.setOption(finalOption, true);
  registerChart(chart);

  requestAnimationFrame(() => {
    try {
      chart.resize();
    } catch (err) {
      console.warn('[common-charts] resize after init failed', err);
    }
  });

  return chart;
}

// --- helper: 构造 time 轴配置（短周期时强制显示全部刻度） ---
export function buildTimeXAxis(dates = [], opts = {}) {
  const n = Array.isArray(dates) ? dates.length : 0;
  const shortSpan = n > 0 && n <= (opts.shortMaxPoints ?? 7);

  return {
    type: 'time',
    boundaryGap: false,
    axisLabel: {
      formatter: (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}-${dd}`;
      },
      hideOverlap: shortSpan ? false : undefined,
      showMinLabel: shortSpan ? true : undefined,
      showMaxLabel: shortSpan ? true : undefined,
    },
    axisPointer: { show: true, snap: true },
    splitNumber: shortSpan ? n : undefined,
  };
}
