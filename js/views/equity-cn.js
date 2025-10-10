import { loadSheet } from '../data-adapter.js';
import {
  ensureEcharts,
  fmtDateLabel,
  buildSeriesData,
  disposeAllCharts,
  renderMini,
  formatNumber,
} from './common-charts.js';

const INDEX_OPTIONS = ['上证综指', '深圳成指', '中小板指', '创业板指', '沪深300', '300电力'];

const EQUITY_CN_STYLE_ID = 'equity-cn-inline-styles';
let equityCnStylesInjected = false;

function injectEquityCnStyles() {
  if (typeof document === 'undefined') return;
  if (equityCnStylesInjected) return;

  const style = document.getElementById(EQUITY_CN_STYLE_ID) || document.createElement('style');
  style.id = EQUITY_CN_STYLE_ID;
  style.textContent = `

.ec-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(640px, 1fr));
  align-items: stretch;
}


.ec-card {
  background: var(--card, #fff);
  border: 1px solid var(--border, #e6e6e6);
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
  padding: 18px 18px 16px;
}

.ec-card .title {
  font-weight: 600;
  margin: 0 0 12px 2px;
}


.ec-card .chart {
  height: 260px;
}

@media (max-width: 1400px) {
  .ec-grid {
    grid-template-columns: 1fr;
  }
}
`;

  if (!style.parentNode) {
    document.head.appendChild(style);
  }

  equityCnStylesInjected = true;
}

async function renderFiveCards(mount, table, indexName, dateKey = '交易日') {
  const columns = {
    close: `${indexName}收盘价`,
    chg: `${indexName}涨跌幅`,
    amt: `${indexName}成交金额`,
    amtChg: `${indexName}成交金额变化`,
    flow: `${indexName}主力资金流向`,
  };

  const configs = [
    {
      key: 'close',
      title: '收盘价',
      type: 'line',
      percent: false,
      unit: '',
      unitOpt: null,
      palette: 'linePrimary',
    },
    {
      key: 'chg',
      title: '涨跌幅',
      type: 'bar',
      percent: true,
      unit: '(%)',
      unitOpt: null,
      palette: 'barPositive',
    },
    {
      key: 'amt',
      title: '成交金额',
      type: 'bar',
      percent: false,
      unit: '(亿)',
      unitOpt: 'yi',
      palette: 'barAmount',
    },
    {
      key: 'amtChg',
      title: '成交金额变化',
      type: 'line',
      percent: true,
      unit: '(%)',
      unitOpt: null,
      palette: 'linePrimary',
    },
    {
      key: 'flow',
      title: '主力资金流向',
      type: 'bar',
      percent: false,
      unit: '(亿)',
      unitOpt: null,
      palette: 'barFlow',
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'ec-grid';
  mount.appendChild(grid);

  for (const conf of configs) {
    const series = buildSeriesData(table, dateKey, columns[conf.key]);
    const card = document.createElement('div');
    card.className = 'ec-card';
    card.innerHTML = `
      <div class="title">${indexName} · ${conf.title} <span style="opacity:.6;font-weight:400">${conf.unit}</span></div>
      <div class="chart"></div>
    `;

    const chartEl = card.querySelector('.chart');

    grid.appendChild(card);

    if (series.length) {
      try {
        const chart = await renderMini(chartEl, conf.type, series, {
          percent: conf.percent,
          unit: conf.unitOpt,
          paletteKey: conf.palette,
        });
        if (!chart) {
          chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
        }
      } catch (err) {
        console.error('[equity-cn] renderMini failed', err);
        chartEl.innerHTML = '<div style="opacity:.6">加载失败</div>';
      }
    } else {
      chartEl.innerHTML = '<div style="opacity:.6">暂无数据</div>';
    }
  }
}

export async function renderEquityCn(mount) {
  if (!mount) return;
  injectEquityCnStyles();
  ensureEcharts();
  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }

  const data = await loadSheet('equity_cn');
  const table = Array.isArray(data.table) ? data.table : [];

  mount.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = '国内股市';
  mount.appendChild(title);

  const toolbar = document.createElement('div');
  toolbar.style.display = 'flex';
  toolbar.style.flexWrap = 'wrap';
  toolbar.style.gap = '8px';
  toolbar.style.margin = '8px 0 12px';

  const availableIndexes = INDEX_OPTIONS.filter((name) =>
    table.some((row) => {
      const key = `${name}收盘价`;
      const value = row?.[key];
      return value != null && value !== '' && value !== '--';
    })
  );

  if (!availableIndexes.length) {
    toolbar.textContent = '暂无可用指数';
  }

  const tabs = document.createElement('div');
  tabs.className = 'ec-tabs';
  toolbar.appendChild(tabs);
  mount.appendChild(toolbar);

  const tabButtons = new Map();

  let currentIndex = availableIndexes.includes('创业板指') ? '创业板指' : availableIndexes[0] || '';

  availableIndexes.forEach((name) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'ec-tab';
    tab.textContent = name;
    tab.addEventListener('click', () => {
      if (currentIndex === name) return;
      currentIndex = name;
      updateActiveTabs();
      rerender().catch((err) => {
        console.error('[equity-cn] rerender failed', err);
      });
    });
    tabs.appendChild(tab);
    tabButtons.set(name, tab);
  });

  const body = document.createElement('div');
  mount.appendChild(body);

  function updateActiveTabs() {
    tabButtons.forEach((btn, name) => {
      btn.classList.toggle('is-active', name === currentIndex);
    });
  }

  async function rerender() {
    disposeAllCharts();
    body.innerHTML = '';
    const chosen = currentIndex;
    if (!chosen) {
      body.innerHTML = '<div class="empty-state">暂无可用数据</div>';
      return;
    }
    await renderFiveCards(body, table, chosen, '交易日');
  }

  updateActiveTabs();
  await rerender();

  mount.__viewCleanup = () => {
    disposeAllCharts();
    body.innerHTML = '';
  };
}
