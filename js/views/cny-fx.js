/**
 * 人民币汇率视图：按币种展示汇率/涨跌幅/中间价走势。
 * - 数据来源：cny_fx.json，主要字段 table(series) 与 kpis。
 * - 日期列以“日期”为 key，buildSeriesData 会过滤空值/"--"。
 * - 卡片使用 renderMini 共享轴格式化；颜色来自 palette.barPositive/linePrimary。
 * - 离岸人民币(USDCNH)仅展示 rate/chg，其余币种额外包含 mid/mid_chg。
 */
import { loadSheet } from '../data-adapter.js';
import { ensureEcharts, renderMini, buildSeriesData, disposeAllCharts } from './common-charts.js';
import { ensure } from '../core/guard.js';
import { renderEmptyState } from '../core/empty.js';

const STYLE_ID = 'cny-fx-inline-styles';
const STORAGE_KEY = 'cny-fx:last-currency';

const CURRENCIES = [
  { key: 'usdcny', label: '人民币兑美元', offshore: false },
  { key: 'usdcnh', label: '离岸人民币兑美元', offshore: true },
  { key: 'eurcny', label: '人民币兑欧元', offshore: false },
  { key: 'jpy100cny', label: '人民币兑100日元', offshore: false },
  { key: 'audcny', label: '人民币兑澳元', offshore: false },
];

const COLUMN_MAP = {
  usdcny: {
    rate: '人民币兑美元汇率',
    chg: '人民币兑美元涨跌幅',
    mid: '人民币兑美元央行中间价',
    mid_chg: '人民币兑美元央行中间价调整情况',
  },
  usdcnh: {
    rate: '离岸人民币兑美元汇率',
    chg: '离岸人民币兑美元涨跌幅',
  },
  eurcny: {
    rate: '人民币兑欧元汇率',
    chg: '人民币兑欧元涨跌幅',
    mid: '人民币兑欧元央行中间价',
    mid_chg: '人民币兑欧元央行中间价调整情况',
  },
  jpy100cny: {
    rate: '人民币兑100日元汇率',
    chg: '人民币兑100日元涨跌幅',
    mid: '人民币兑100日元央行中间价',
    mid_chg: '人民币兑100日元央行中间价调整情况',
  },
  audcny: {
    rate: '人民币兑澳元汇率',
    chg: '人民币兑澳元涨跌幅',
    mid: '人民币兑澳元央行中间价',
    mid_chg: '人民币兑澳元央行中间价调整情况',
  },
};

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.ec-grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));align-items:stretch;}
.ec-card{background:var(--card,#fff);border:1px solid var(--border,#e6e6e6);border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.04);padding:18px 18px 16px;}
.ec-card .title{font-weight:600;margin:0 0 12px 2px;}
.ec-card .chart{height:240px;}
@media (max-width:1200px){.ec-grid{grid-template-columns:1fr;}}
`;
  document.head.appendChild(style);
}

function columnName(currencyKey, field) {
  return COLUMN_MAP[currencyKey]?.[field] ?? '';
}

function cardDefinitions(currency) {
  const base = [
    {
      field: 'rate',
      title: '汇率',
      unit: '',
      type: 'line',
      percent: false,
      palette: 'linePrimary',
    },
    {
      field: 'chg',
      title: '涨跌幅',
      unit: '(%)',
      type: 'bar',
      percent: true,
      palette: 'barPositive',
    },
  ];

  if (currency.offshore) return base;

  return [
    ...base,
    {
      field: 'mid',
      title: '央行中间价',
      unit: '',
      type: 'line',
      percent: false,
      palette: 'linePrimary',
    },
    {
      field: 'mid_chg',
      title: '中间价调整',
      unit: '(%)',
      type: 'bar',
      percent: true,
      palette: 'barPositive',
    },
  ];
}

function loadPersistedCurrency(keys) {
  if (typeof window === 'undefined' || !Array.isArray(keys) || !keys.length) return '';
  try {
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (saved && keys.includes(saved)) return saved;
  } catch (err) {
    console.warn('[cny-fx] read persisted currency failed', err);
  }
  return '';
}

function persistCurrency(key) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, key);
  } catch (err) {
    console.warn('[cny-fx] persist currency failed', err);
  }
}

async function renderCards(container, table, currency) {
  const defs = cardDefinitions(currency);
  const grid = document.createElement('div');
  grid.className = 'ec-grid';
  container.appendChild(grid);

  for (const def of defs) {
    const col = columnName(currency.key, def.field);
    const series = col ? buildSeriesData(table, '日期', col) : [];

    const card = document.createElement('div');
    card.className = 'ec-card';
    const unitHtml = def.unit ? `<span style="opacity:.6;font-weight:400">${def.unit}</span>` : '';
    card.innerHTML = `
      <div class="title">${currency.label} · ${def.title} ${unitHtml}</div>
      <div class="chart"></div>
    `;

    const chartEl = card.querySelector('.chart');
    grid.appendChild(card);

    if (series.length) {
      try {
        const chart = await renderMini(chartEl, def.type, series, {
          percent: def.percent,
          paletteKey: def.palette,
        });
        if (
          !ensure(chart, 'cny-fx: mini chart init failed', {
            currency: currency.key,
            field: def.field,
          })
        ) {
          renderEmptyState(chartEl, '暂无数据', { className: '', style: 'opacity:.6' });
        }
      } catch (err) {
        console.error('[cny-fx] renderMini failed', err);
        renderEmptyState(chartEl, '加载失败', { className: '', style: 'opacity:.6' });
      }
    } else {
      ensure(false, 'cny-fx: empty series', { currency: currency.key, field: def.field });
      renderEmptyState(chartEl, '暂无数据', { className: '', style: 'opacity:.6' });
    }
  }
}

function filterAvailableCurrencies(table) {
  return CURRENCIES.filter((cur) => {
    const col = columnName(cur.key, 'rate');
    if (!col) return false;
    const series = buildSeriesData(table, '日期', col);
    return series.length > 0;
  });
}

/**
 * 渲染人民币汇率视图，带币种切换与迷你图。
 * @param {HTMLElement} mount - 主内容容器，由 app.js routeTo 提供。
 * @returns {Promise<void>}
 */
export async function renderCnyFx(mount) {
  if (!mount) return;
  injectStyles();
  ensureEcharts();

  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }

  const data = await loadSheet('cny_fx');
  const table = Array.isArray(data.table) ? data.table : [];

  mount.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = '人民币汇率';
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

  const body = document.createElement('div');
  mount.appendChild(body);

  const available = filterAvailableCurrencies(table);
  const list = available.length ? available : CURRENCIES;
  const keys = list.map((c) => c.key);
  const persisted = loadPersistedCurrency(keys);
  let currentKey = persisted && keys.includes(persisted) ? persisted : keys[0] || '';
  if (!persisted && currentKey) {
    persistCurrency(currentKey);
  }

  const tabButtons = new Map();

  list.forEach((currency) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ec-tab';
    btn.textContent = currency.label;
    btn.addEventListener('click', () => {
      if (currentKey === currency.key) return;
      currentKey = currency.key;
      persistCurrency(currentKey);
      updateActiveTabs();
      rerender().catch((err) => {
        console.error('[cny-fx] rerender failed', err);
      });
    });
    tabs.appendChild(btn);
    tabButtons.set(currency.key, btn);
  });

  function updateActiveTabs() {
    tabButtons.forEach((btn, key) => {
      btn.classList.toggle('is-active', key === currentKey);
    });
  }

  async function rerender() {
    disposeAllCharts();
    body.innerHTML = '';

    if (!currentKey) {
      ensure(false, 'cny-fx: current key missing');
      renderEmptyState(body, '暂无可用数据', { className: 'empty-state' });
      return;
    }

    const currency = list.find((item) => item.key === currentKey);
    if (!currency) {
      ensure(false, 'cny-fx: currency not found', { currentKey });
      renderEmptyState(body, '暂无可用数据', { className: 'empty-state' });
      return;
    }

    await renderCards(body, table, currency);
  }

  updateActiveTabs();
  await rerender();

  mount.__viewCleanup = () => {
    disposeAllCharts();
    body.innerHTML = '';
  };
}
