import { loadSheet } from '../data-adapter.js';
import {
  ensureEcharts,
  fmtDateLabel,
  buildSeriesData,
  disposeAllCharts,
  renderMini,
  formatNumber,
} from './common-charts.js';

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
        const chart = await renderMini(chartEl, conf.type, series, {
          percent: conf.percent,
          paletteKey: conf.palette,
        });
        if (!chart) {
          chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
        }
      } catch (err) {
        console.error('[equity-global] renderMini failed', err);
        chartEl.innerHTML = '<div style="opacity:.6">加载失败</div>';
      }
    } else {
      chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
    }
  }
}

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
