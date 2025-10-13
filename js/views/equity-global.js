/**
 * 全球股市视图：展示主要海外指数的收盘价与涨跌幅。
 * - 数据来源：equity_global.json，表格以“日期”为索引列。
 * - 视图结构：顶部 tabs 切换指数，卡片展示迷你图；收盘价卡使用 renderLineChart 以支持更细腻的轴控制。
 * - 单位说明：涨跌幅以 % 显示，收盘价保持原币种；空值/"--" 过滤后显示“暂无数据”。
 */
import { loadSheet } from '../data-adapter.js';
import {
  ensureEcharts,
  fmtDateLabel,
  buildSeriesData,
  disposeAllCharts,
  renderMini,
  renderLineChart,
  waitElementSized,
  formatNumber,
  buildTimeXAxis,
} from './common-charts.js';
import { COLORS } from '../theme/palette.js';

const EQUITY_GLOBAL_STYLE_ID = 'equity-global-inline-styles';
let stylesInjected = false;
const STORAGE_KEY = 'equity:global:last-index';

function loadPersistedIndex(indexes) {
  if (typeof window === 'undefined' || !Array.isArray(indexes) || indexes.length === 0) {
    return '';
  }
  try {
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (saved && indexes.includes(saved)) return saved;
  } catch (err) {
    console.warn('[equity-global] read persisted index failed', err);
  }
  return '';
}

function savePersistedIndex(name) {
  if (typeof window === 'undefined' || !name) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, name);
  } catch (err) {
    console.warn('[equity-global] persist index failed', err);
  }
}

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (stylesInjected) return;

  const style = document.getElementById(EQUITY_GLOBAL_STYLE_ID) || document.createElement('style');
  style.id = EQUITY_GLOBAL_STYLE_ID;
  style.textContent = `

.eg-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  align-items: stretch;
}

.eg-card {
  background: var(--card, #fff);
  border: 1px solid var(--border, #e6e6e6);
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
  padding: 18px 18px 16px;
}

.eg-card .title {
  font-weight: 600;
  margin: 0 0 12px 2px;
}

.eg-card .chart {
  height: 260px;
}

@media (max-width: 1400px) {
  .eg-grid {
    grid-template-columns: 1fr;
  }
}
`;

  if (!style.parentNode) {
    document.head.appendChild(style);
  }

  stylesInjected = true;
}

function extractIndexNames(table) {
  const names = new Map();
  for (const row of Array.isArray(table) ? table : []) {
    const keys = Object.keys(row || {});
    keys.forEach((key) => {
      if (!key.endsWith('收盘价')) return;
      const name = key.slice(0, -3);
      if (!name) return;
      const changeKey = `${name}涨跌幅`;
      if (changeKey in row) {
        if (!names.has(name)) names.set(name, true);
      }
    });
  }
  return Array.from(names.keys());
}

function normalizeLinePoints(pairs = []) {
  const normalized = [];
  for (const entry of Array.isArray(pairs) ? pairs : []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [rawDate, rawValue] = entry;
    const dateString = rawDate == null ? '' : String(rawDate).trim();
    if (!dateString) continue;
    let dateObj = new Date(dateString);
    if (Number.isNaN(dateObj.getTime())) {
      dateObj = new Date(dateString.replace(/\./g, '-'));
    }
    if (Number.isNaN(dateObj.getTime())) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const iso = dateObj.toISOString().slice(0, 10);
    normalized.push([iso, value]);
  }
  return normalized.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * 渲染指定指数的两张卡片（收盘价/涨跌幅）。
 * @param {HTMLElement} container
 * @param {Array<object>} table
 * @param {string} indexName
 */
async function renderCards(container, table, indexName) {
  const configs = [
    {
      suffix: '收盘价',
      title: '收盘价',
      type: 'line',
      percent: false,
      unit: '',
      palette: 'linePrimary',
    },
    {
      suffix: '涨跌幅',
      title: '涨跌幅',
      type: 'bar',
      percent: true,
      unit: '(%)',
      palette: 'barPositive',
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'eg-grid';
  container.appendChild(grid);

  for (const conf of configs) {
    const series = buildSeriesData(table, '日期', `${indexName}${conf.suffix}`);
    const card = document.createElement('div');
    card.className = 'eg-card';
    const unitHtml = conf.unit
      ? `<span style="opacity:.6;font-weight:400">${conf.unit}</span>`
      : '';
    card.innerHTML = `
      <div class="title">${indexName} · ${conf.title} ${unitHtml}</div>
      <div class="chart"></div>
    `;

    const chartEl = card.querySelector('.chart');
    grid.appendChild(card);

    if (series.length) {
      try {
        if (conf.type === 'line') {
          await waitElementSized(chartEl);

          const normalized = normalizeLinePoints(series);

          const numericValues = normalized
            .map(([, value]) => (typeof value === 'number' ? value : null))
            .filter((value) => value != null);

          if (!numericValues.length) {
            chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
            continue;
          }

          const safeValues = numericValues.length ? numericValues : [0];
          const vMin = Math.min(...safeValues);
          const vMax = Math.max(...safeValues);
          const spread = Number.isFinite(vMax - vMin) ? vMax - vMin : 0;
          const pad = Math.max(spread * 0.1, Math.abs(vMax || 1) * 0.02);
          const yMin = vMin - pad;
          const yMax = vMax + pad;
          const nonNullCount = numericValues.length;

          const axisFormatter = (val) => {
            if (val == null || Number.isNaN(Number(val))) return '';
            return formatNumber(val, 2);
          };

          const tooltipFormatter = (val) => {
            if (val == null || Number.isNaN(Number(val))) return '--';
            return formatNumber(val, 2);
          };

          const xDates = normalized.map(([date]) => date).filter(Boolean);
          const xAxisOption = buildTimeXAxis(xDates, { shortMaxPoints: 7 });

          const fallbackPalette = conf.palette === 'linePrimary' ? [COLORS.primary()] : [];

          const chart = renderLineChart(
            chartEl,
            {
              grid: { left: 48, right: 24, top: 28, bottom: 40, containLabel: true },
              tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'line' },
                formatter: (payload) => {
                  const items = Array.isArray(payload) ? payload : [payload];
                  if (!items.length) return '';
                  const first = items[0];
                  const rawDate = Array.isArray(first.value)
                    ? first.value[0]
                    : first.data?.[0] ?? first.axisValue;
                  const dt = new Date(rawDate);
                  const title = Number.isNaN(dt.getTime())
                    ? fmtDateLabel(rawDate)
                    : `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
                        dt.getDate()
                      ).padStart(2, '0')}`;
                  const lines = items.map((item) => {
                    const raw = Array.isArray(item.value)
                      ? item.value[1]
                      : item.data?.[1] ?? item.value;
                    const text = Number.isFinite(Number(raw))
                      ? tooltipFormatter(Number(raw))
                      : raw ?? '--';
                    return `${item.marker}${item.seriesName}: ${text}`;
                  });
                  return [title, ...lines].join('<br/>');
                },
              },
              xAxis: xAxisOption,
              yAxis: {
                min: yMin,
                max: yMax,
                scale: true,
                boundaryGap: [0, 0],
                axisLabel: {
                  formatter: (value) => axisFormatter(value),
                },
              },
              series: [
                {
                  name: `${indexName} · ${conf.title}`,
                  data: normalized,
                  smooth: nonNullCount > 1,
                  showSymbol: nonNullCount <= 1,
                  symbolSize: nonNullCount <= 1 ? 9 : 6,
                  connectNulls: false,
                  lineStyle: { width: 2, opacity: 0.95 },
                  areaStyle: { opacity: 0.12 },
                },
              ],
            },
            { fallback: fallbackPalette }
          );

          if (!chart) {
            chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
          }
        } else {
          const chart = await renderMini(chartEl, conf.type, series, {
            percent: conf.percent,
            paletteKey: conf.palette,
          });
          if (!chart) {
            chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
          }
        }
      } catch (err) {
        console.error('[equity-global] render card failed', err);
        chartEl.innerHTML = '<div style="opacity:.6">加载失败</div>';
      }
    } else {
      chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
    }
  }
}

/**
 * 渲染全球股市视图。
 * @param {HTMLElement} mount
 * @returns {Promise<void>}
 */
export async function renderEquityGlobal(mount) {
  if (!mount) return;
  injectStyles();
  ensureEcharts();

  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }

  const data = await loadSheet('equity_global');
  const table = Array.isArray(data.table) ? data.table : [];

  mount.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = '全球股市';
  mount.appendChild(title);

  const toolbar = document.createElement('div');
  toolbar.style.display = 'flex';
  toolbar.style.flexWrap = 'wrap';
  toolbar.style.gap = '8px';
  toolbar.style.margin = '8px 0 12px';
  mount.appendChild(toolbar);

  const tabs = document.createElement('div');
  tabs.className = 'ec-tabs';
  toolbar.appendChild(tabs);

  const indexes = extractIndexNames(table);

  if (!indexes.length) {
    tabs.textContent = '暂无可用指数';
  }

  const body = document.createElement('div');
  mount.appendChild(body);

  const tabButtons = new Map();
  const persistedIndex = loadPersistedIndex(indexes);
  let currentIndex = persistedIndex || indexes[0] || '';

  if (!persistedIndex && currentIndex) {
    savePersistedIndex(currentIndex);
  }

  indexes.forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ec-tab';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      if (currentIndex === name) return;
      currentIndex = name;
      savePersistedIndex(name);
      updateActiveTabs();
      rerender().catch((err) => {
        console.error('[equity-global] rerender failed', err);
      });
    });
    tabs.appendChild(btn);
    tabButtons.set(name, btn);
  });

  function updateActiveTabs() {
    tabButtons.forEach((btn, name) => {
      btn.classList.toggle('is-active', name === currentIndex);
    });
  }

  async function rerender() {
    disposeAllCharts();
    body.innerHTML = '';
    const name = currentIndex;
    if (!name) {
      body.innerHTML = '<div class="empty-state">暂无可用数据</div>';
      return;
    }
    await renderCards(body, table, name);
  }

  updateActiveTabs();
  await rerender();

  mount.__viewCleanup = () => {
    disposeAllCharts();
    body.innerHTML = '';
  };
}
