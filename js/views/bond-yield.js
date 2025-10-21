/**
 * 债券利率视图
 * - 数据来源：bond_yield.json，字段 { top5_latest, series, export_info.range_window }。
 * - Top5 数据通过分组标签切换，折线图使用 renderLineChart 统一配色与生命周期。
 */
import { loadSheet } from '../data-adapter.js';
import { ensureEcharts, renderLineChart, disposeAllCharts } from './common-charts.js';
import { ensure } from '../core/guard.js';
import { renderEmptyState } from '../core/empty.js';
import {
  pickTop5Latest,
  formatRangeWindow,
  prepareLineSeries,
  formatSizeYi,
  formatCoupon,
  safeText,
  firstAvailableGroup,
  formatTooltipDate,
  tooltipFormatter,
} from '../core/bond-yield.js';

const GROUP_LABELS = {
  aaa_3y: 'AAA公司债3年',
  aaa_5y: 'AAA公司债5年',
  aaa_mt_5y: 'AAA中票5年',
  aaa_priv_5y: 'AAA私募债5年',
  cp_short: '短融',
  scp_270d: '270D超短融',
  scp_180d: '180D超短融',
};

const GROUP_ORDER = [
  'aaa_3y',
  'aaa_5y',
  'aaa_mt_5y',
  'aaa_priv_5y',
  'cp_short',
  'scp_270d',
  'scp_180d',
];

const SERIES_ORDER = [
  'AAA中短票 1年(%)',
  'AAA中短票 3年(%)',
  'AAA中短票 5年(%)',
  'AAA中短票 7年(%)',
  'AAA中短票 10年(%)',
];

const STYLE_ID = 'bond-yield-inline-styles';

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.by-layout{display:flex;flex-direction:column;gap:20px;}
.by-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
.by-header h2{margin:0;font-size:24px;font-weight:600;}
.by-range{color:var(--text-muted,#64748b);font-size:14px;}
.by-card{background:var(--card,#fff);border:1px solid var(--border,#e2e8f0);border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.04);padding:18px 20px;}
.by-card-title{font-weight:600;margin:0 0 12px;}
.by-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
.by-tab{padding:6px 14px;border-radius:999px;border:1px solid var(--border,#e2e8f0);background:transparent;cursor:pointer;font-size:14px;color:var(--text-primary,#0f172a);transition:all .2s ease;}
.by-tab.is-active{background:var(--primary-soft,#e5f1ff);border-color:var(--primary-soft,#e5f1ff);color:var(--primary,#2563eb);}
.by-tab:focus{outline:none;box-shadow:0 0 0 2px rgba(37,99,235,0.2);}
.by-table-meta{font-size:12px;color:var(--text-muted,#64748b);margin:0 0 8px;}
.by-table-wrap{overflow-x:auto;}
.by-table{width:100%;min-width:640px;border-collapse:collapse;font-size:14px;}
.by-table th,.by-table td{padding:10px 12px;border-bottom:1px solid var(--border,#e2e8f0);text-align:left;white-space:nowrap;}
.by-table th:nth-child(3),.by-table td:nth-child(3),.by-table th:nth-child(5),.by-table td:nth-child(5){text-align:right;}
.by-empty{padding:28px 0;text-align:center;color:var(--text-muted,#64748b);font-size:14px;}
.by-chart{height:360px;}
@media (max-width:768px){
  .by-card{padding:16px;}
  .by-table{min-width:520px;}
  .by-chart{height:300px;}
}
`;
  document.head.appendChild(style);
}

/**
 * 渲染债券利率完整视图。
 * @param {HTMLElement} mount - 视图挂载容器。
 */
export async function renderBondYield(mount) {
  if (!mount) return;
  injectStyles();
  ensureEcharts();

  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }

  disposeAllCharts();

  const sheet = await loadSheet('bond_yield');
  const topGroups = pickTop5Latest(sheet); // ★ 用兜底函数
  const series = sheet?.series ?? [];
  const rangeWindow = sheet?.export_info?.range_window ?? [];

  mount.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'by-layout';
  mount.appendChild(layout);

  const header = document.createElement('div');
  header.className = 'by-header';
  const title = document.createElement('h2');
  title.textContent = '债券利率';
  header.appendChild(title);

  const rangeEl = document.createElement('div');
  rangeEl.className = 'by-range';
  const rangeText = formatRangeWindow(rangeWindow);
  if (rangeText) {
    rangeEl.textContent = rangeText;
  }
  header.appendChild(rangeEl);
  layout.appendChild(header);

  const topCard = document.createElement('div');
  topCard.className = 'by-card';
  layout.appendChild(topCard);

  const topTitle = document.createElement('div');
  topTitle.className = 'by-card-title';
  topTitle.textContent = 'Top1~Top5（根据区间成交金额排名）';
  topCard.appendChild(topTitle);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'by-tabs';
  topCard.appendChild(tabsEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'by-table-meta';
  topCard.appendChild(metaEl);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'by-table-wrap';
  topCard.appendChild(tableWrap);

  const tabButtons = new Map();
  let activeKey = firstAvailableGroup(topGroups, GROUP_ORDER);

  GROUP_ORDER.forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'by-tab';
    btn.textContent = GROUP_LABELS[key] || key;
    btn.addEventListener('click', () => {
      if (activeKey === key) return;
      activeKey = key;
      updateTabs();
      renderTable();
    });
    tabsEl.appendChild(btn);
    tabButtons.set(key, btn);
  });

  function updateTabs() {
    tabButtons.forEach((btn, key) => {
      btn.classList.toggle('is-active', key === activeKey);
    });
  }

  function renderTable() {
    tableWrap.innerHTML = '';
    metaEl.textContent = '';
    const block = topGroups?.[activeKey];
    const rows = Array.isArray(block?.rows) ? block.rows : [];

    if (block?.date) {
      metaEl.textContent = `数据日期：${block.date}`;
    }

    if (!ensure(rows.length, 'bond-yield: top rows empty', { activeKey })) {
      renderEmptyState(tableWrap, '暂无数据', { className: 'by-empty' });
      return;
    }

    const table = document.createElement('table');
    table.className = 'by-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>名次</th>
          <th>公司简称</th>
          <th>发行规模(亿)</th>
          <th>发行期限</th>
          <th>票面利率(%)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    rows.slice(0, 5).forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safeText(row.rank)}</td>
        <td>${safeText(row.issuer)}</td>
        <td>${formatSizeYi(row.size_yi)}</td>
        <td>${safeText(row.term)}</td>
        <td>${formatCoupon(row.coupon_pct)}</td>
      `;
      tbody.appendChild(tr);
    });

    tableWrap.appendChild(table);
  }

  updateTabs();
  renderTable();

  const chartCard = document.createElement('div');
  chartCard.className = 'by-card';
  layout.appendChild(chartCard);

  const chartTitle = document.createElement('div');
  chartTitle.className = 'by-card-title';
  chartTitle.textContent = '中票利率走势（上一完整周）';
  chartCard.appendChild(chartTitle);

  const chartEl = document.createElement('div');
  chartEl.className = 'by-chart';
  chartCard.appendChild(chartEl);

  const lineSeries = prepareLineSeries(series, rangeWindow, SERIES_ORDER);

  if (!ensure(lineSeries.length, 'bond-yield: line series empty', { rangeWindow })) {
    renderEmptyState(chartEl, '暂无数据', { className: 'by-empty' });
  } else {
    const values = lineSeries.flatMap((serie) =>
      (Array.isArray(serie.data) ? serie.data : [])
        .map((entry) => entry?.[1])
        .filter((v) => typeof v === 'number')
    );
    const minVal = values.length ? Math.min(...values) : null;
    const maxVal = values.length ? Math.max(...values) : null;
    const spread = minVal != null && maxVal != null ? maxVal - minVal : 0;
    const padding = spread > 0 ? spread * 0.1 : (Math.abs(maxVal ?? 0) || 1) * 0.05;
    const axisMin = minVal != null ? minVal - padding : null;
    const axisMax = maxVal != null ? maxVal + padding : null;

    const chartOption = {
      legend: {
        type: 'scroll',
        top: 0,
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLabel: {
          formatter: (value) => formatTooltipDate(value),
        },
      },
      yAxis: {
        scale: true,
        min: axisMin != null ? axisMin : undefined,
        max: axisMax != null ? axisMax : undefined,
        axisLabel: {
          formatter: (value) => {
            const num = Number(value);
            if (Number.isNaN(num)) return '--';
            return `${num.toFixed(2)}%`;
          },
        },
      },
      tooltip: {
        formatter: tooltipFormatter,
      },
      series: lineSeries,
    };

    const chart = renderLineChart(chartEl, chartOption);
    if (!ensure(chart, 'bond-yield: chart init failed')) {
      renderEmptyState(chartEl, '暂无数据', { className: 'by-empty' });
    }
  }

  mount.__viewCleanup = () => {
    disposeAllCharts();
  };
}
