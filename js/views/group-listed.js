import { loadSheet } from '../data-adapter.js';
import { ensureEcharts, renderMini, buildSeriesData, disposeAllCharts } from './common-charts.js';

const STYLE_ID = 'group-listed-inline-styles';
const STORAGE_KEY = 'group-listed:last-company';

const COMPANIES = ['国电电力', '中国神华', '龙源电力', '长源电力', '龙源技术', '英力特'];

const METRICS = [
  {
    key: 'close',
    title: '收盘价',
    col: (n) => `${n}收盘价`,
    type: 'line',
    percent: false,
    unit: '',
    palette: 'linePrimary',
  },
  {
    key: 'chg',
    title: '涨跌幅',
    col: (n) => `${n}涨跌幅`,
    type: 'bar',
    percent: true,
    unit: '(%)',
    palette: 'barPositive',
  },
  {
    key: 'amount',
    title: '成交金额',
    col: (n) => `${n}成交金额`,
    type: 'bar',
    percent: false,
    unit: '(亿)',
    palette: 'barAmount',
  },
  {
    key: 'amountChg',
    title: '成交金额变化',
    col: (n) => `${n}成交金额变化`,
    type: 'line',
    percent: true,
    unit: '(%)',
    palette: 'linePrimary',
  },
  {
    key: 'flow',
    title: '主力资金流向',
    col: (n) => `${n}主力资金流向`,
    type: 'bar',
    percent: false,
    unit: '(亿)',
    palette: 'barFlow',
  },
  {
    key: 'pe',
    title: '市盈率',
    col: (n) => `${n}市盈率`,
    type: 'line',
    percent: false,
    unit: '',
    palette: 'linePrimary',
  },
  {
    key: 'pb',
    title: '市净率',
    col: (n) => `${n}市净率`,
    type: 'line',
    percent: false,
    unit: '',
    palette: 'linePrimary',
  },
  {
    key: 'dev',
    title: '每日偏离值',
    col: (n) => `${n}每日偏离值`,
    type: 'line',
    percent: true,
    unit: '(%)',
    palette: 'linePrimary',
  },
  {
    key: 'turn',
    title: '换手率比值',
    col: (n) => `${n}换手率比值`,
    type: 'line',
    percent: true,
    unit: '(%)',
    palette: 'linePrimary',
  },
];

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

function persistCompany(key) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, key);
  } catch (err) {
    console.warn('[group-listed] persist company failed', err);
  }
}

function loadPersistedCompany(keys) {
  if (typeof window === 'undefined' || !Array.isArray(keys) || !keys.length) return '';
  try {
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (saved && keys.includes(saved)) return saved;
  } catch (err) {
    console.warn('[group-listed] read persisted company failed', err);
  }
  return '';
}

async function renderCards(container, table, company) {
  const grid = document.createElement('div');
  grid.className = 'ec-grid';
  container.appendChild(grid);

  for (const metric of METRICS) {
    const column = metric.col(company);
    const series = buildSeriesData(table, '日期', column);

    const card = document.createElement('div');
    card.className = 'ec-card';
    const unitHtml = metric.unit
      ? `<span style="opacity:.6;font-weight:400">${metric.unit}</span>`
      : '';
    card.innerHTML = `
      <div class="title">${company} · ${metric.title} ${unitHtml}</div>
      <div class="chart"></div>
    `;

    const chartEl = card.querySelector('.chart');
    grid.appendChild(card);

    if (series.length) {
      try {
        const chart = await renderMini(chartEl, metric.type, series, {
          percent: metric.percent,
          paletteKey: metric.palette,
        });
        if (!chart) {
          chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
        }
      } catch (err) {
        console.error('[group-listed] renderMini failed', err);
        chartEl.innerHTML = '<div style="opacity:.6">加载失败</div>';
      }
    } else {
      chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
    }
  }
}

export async function renderGroupListed(mount) {
  if (!mount) return;
  injectStyles();
  ensureEcharts();

  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }

  const data = await loadSheet('group_listed');
  const table = Array.isArray(data.table) ? data.table : [];

  mount.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = '集团上市公司';
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

  const keys = COMPANIES.slice();
  const persisted = loadPersistedCompany(keys);
  let current = persisted && keys.includes(persisted) ? persisted : keys[0] || '';
  if (!persisted && current) {
    persistCompany(current);
  }

  const tabButtons = new Map();

  COMPANIES.forEach((company) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ec-tab';
    btn.textContent = company;
    btn.addEventListener('click', () => {
      if (current === company) return;
      current = company;
      persistCompany(current);
      updateActiveTabs();
      rerender().catch((err) => {
        console.error('[group-listed] rerender failed', err);
      });
    });
    tabs.appendChild(btn);
    tabButtons.set(company, btn);
  });

  function updateActiveTabs() {
    tabButtons.forEach((btn, company) => {
      btn.classList.toggle('is-active', company === current);
    });
  }

  async function rerender() {
    disposeAllCharts();
    body.innerHTML = '';

    if (!current) {
      body.innerHTML = '<div class="empty-state">暂无可用数据</div>';
      return;
    }

    await renderCards(body, table, current);
  }

  updateActiveTabs();
  await rerender();

  mount.__viewCleanup = () => {
    disposeAllCharts();
    body.innerHTML = '';
  };
}
