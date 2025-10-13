/**
 * 公开市场视图：整合央行公开市场操作与 Shibor 曲线。
 * - 上半部分展示 summary 中的“周度数值”卡片（到期量/投放量/净投放/利率），0 也是有效数据不得过滤。
 * - 下半部分展示 Shibor 时间序列，提供 90/180/365 天三个视窗，使用 renderLineChart 绘制折线。
 * - 数据来源：open_market.json，summary/kpis 驱动卡片，series 映射到图表。
 * - diagnostics/export_info.range_window 用于标注卡片对应的统计区间。
 */
import { loadSheet } from '../data-adapter.js';
import {
  ensureEcharts,
  disposeAllCharts,
  removeChartFromResize,
  renderLineChart,
} from './common-charts.js';
import { fmtDateLabel } from '../core/dates.js';
import { ensure } from '../core/guard.js';
import { renderEmptyState } from '../core/empty.js';
import {
  parseNumeric,
  toSeriesMap,
  pickSeries,
  pickShibor,
  findLatestPoint,
  formatMarketNumber,
  formatLatestLabel,
} from '../core/open-market.js';

(function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('open-market-styles')) return;
  const style = document.createElement('style');
  style.id = 'open-market-styles';
  style.textContent = `
.ec-grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));align-items:stretch;}
.ec-card{background:var(--bg,#fff);border:1px solid var(--border,#e6e6e6);border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.04);padding:18px 18px 16px;position:relative;transition:border-color .2s ease,box-shadow .2s ease;}
.ec-card .title{font-weight:600;margin:0 0 12px 2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.ec-card .chart{height:240px;}
.om-card-value{font-size:32px;font-weight:700;margin:0 0 4px 2px;}
.om-card-value small{font-size:16px;font-weight:500;opacity:.7;margin-left:4px;}
.om-card-secondary{font-size:13px;color:var(--text2,#666);margin:0 0 12px 2px;}
.om-range{font-size:13px;color:var(--text2,#666);margin:4px 0 16px;}
.badge-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--primary,#2563eb);color:#fff;}
.shibor-card .chart{height:320px;margin-top:var(--space-md,12px);}
.shibor-card .title{margin-bottom:6px;}
.shibor-subtitle{font-size:13px;color:var(--text2,#666);margin:0 0 12px 2px;}
.section-title{margin:18px 0 8px;font-weight:700;font-size:16px;}
@media (max-width:1180px){.ec-grid{grid-template-columns:1fr;}}
`;
  document.head.appendChild(style);
})();

const MARKET_ITEMS = [
  {
    key: 'rr7d',
    label: '逆回购 7D',
    summaryPrefix: 'r7d',
    seriesName: '逆回购7D利率(%)',
  },
  {
    key: 'rr14d',
    label: '逆回购 14D',
    summaryPrefix: 'r14d',
    seriesName: '逆回购14D利率(%)',
  },
  {
    key: 'mlf',
    label: 'MLF',
    summaryPrefix: 'mlf',
    seriesName: 'MLF利率(%)',
  },
  {
    key: 'tcd',
    label: '国库定存',
    summaryPrefix: 'tcd',
    seriesName: '国库定存利率(%)',
  },
  {
    key: 'slf',
    label: 'SLF',
    summaryPrefix: 'slf',
    seriesName: 'SLF利率(%)',
  },
  {
    key: 'slo',
    label: 'SLO',
    summaryPrefix: 'slo',
    seriesName: 'SLO利率(%)',
  },
  {
    key: 'repo',
    label: '正回购',
    summaryPrefix: 'repo',
    seriesName: '正回购利率(%)',
  },
];

const SHIBOR_GROUPS = [
  {
    key: 'overnight',
    tab: '90天',
    title: 'SHIBOR（隔夜系，近90天）',
    subtitle: '包含隔夜、1周、2周',
    windowDays: 90,
    series: [
      { name: 'SHIBOR 隔夜(%)', label: '隔夜' },
      { name: 'SHIBOR 1周(%)', label: '1周' },
      { name: 'SHIBOR 2周(%)', label: '2周' },
    ],
  },
  {
    key: 'threeMonth',
    tab: '180天',
    title: 'SHIBOR（3月系，近180天）',
    subtitle: '包含3月、6月、9月',
    windowDays: 180,
    series: [
      { name: 'SHIBOR 3月(%)', label: '3月' },
      { name: 'SHIBOR 6月(%)', label: '6月' },
      { name: 'SHIBOR 9月(%)', label: '9月' },
    ],
  },
  {
    key: 'oneYear',
    tab: '365天',
    title: 'SHIBOR（一年，近365天）',
    subtitle: '一年期代表性的长期限',
    windowDays: 365,
    series: [{ name: 'SHIBOR 1年(%)', label: '1年' }],
  },
];

const shiborChartState = {
  inst: null,
  mount: null,
  slot: null,
};

function shiborDisposeSafe() {
  try {
    if (shiborChartState.inst && typeof shiborChartState.inst.dispose === 'function') {
      removeChartFromResize(shiborChartState.inst);
      shiborChartState.inst.dispose();
    }
  } catch (err) {
    console.warn('[open-market] dispose shibor failed', err);
  } finally {
    shiborChartState.inst = null;
  }

  if (shiborChartState.mount) {
    shiborChartState.mount.innerHTML = '';
    const slot = document.createElement('div');
    slot.style.cssText = 'height:320px';
    shiborChartState.mount.appendChild(slot);
    shiborChartState.slot = slot;
  } else {
    shiborChartState.slot = null;
  }
}

function getShiborSeriesGroup(seriesSource, groupKey) {
  const group = SHIBOR_GROUPS.find((item) => item.key === groupKey) || SHIBOR_GROUPS[0];
  if (!group) return [];
  return group.series.map((serie) => ({
    name: serie.label,
    data: pickShibor(seriesSource, serie.name),
  }));
}

function renderValueCard(container, label, value, unit = '', rateInfo = '') {
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'mini-card compact';
  const display =
    value != null && value !== '' && !Number.isNaN(Number(value))
      ? `${formatMarketNumber(value)}${unit}`
      : '--';
  div.innerHTML = `
    <div class="mini-card__label">${label}</div>
    <div class="mini-card__value">${display}</div>
    ${rateInfo ? `<div class="mini-card__rate">${rateInfo}</div>` : ''}
  `;
  container.appendChild(div);
}

/**
 * 渲染“周度数值”卡片区域。
 * @param {HTMLElement} container
 * @param {Record<string, unknown>} summary - 解析器生成的 KPI 数据，如 r7d_amt_yi。
 * @param {Map<string, Array<[string, number]>>} seriesMap - 便于获取对应利率的时间序列。
 * @param {string[]} rangeWindow - 导出信息中的日期范围，用于提示。
 */
async function renderMarketCards(container, summary = {}, seriesMap = new Map(), rangeWindow) {
  if (!container) return;
  container.innerHTML = '';

  if (Array.isArray(rangeWindow) && rangeWindow.length === 2) {
    const [start, end] = rangeWindow;
    if (start || end) {
      const rangeEl = document.createElement('div');
      rangeEl.className = 'om-range';
      rangeEl.textContent = `统计区间：${start || '--'} ~ ${end || '--'}`;
      container.appendChild(rangeEl);
    }
  }

  const grid = document.createElement('div');
  grid.className = 'ec-grid';
  container.appendChild(grid);

  for (const item of MARKET_ITEMS) {
    const prefix = item.summaryPrefix || '';
    const expiryValue = prefix ? summary?.[`${prefix}_expiry_yi`] : null;
    const amountValue = prefix ? summary?.[`${prefix}_amt_yi`] : null;
    const netValue = prefix ? summary?.[`${prefix}_net_yi`] : null;
    const hasOperation = [amountValue, netValue].some(
      (val) => typeof val === 'number' && Number.isFinite(val) && Math.abs(val) > 0
    );
    const badgeHtml = hasOperation ? '<span class="badge-pill">有操作</span>' : '';
    const latest = findLatestPoint(seriesMap, item.seriesName);
    const latestRate =
      latest && Number.isFinite(latest.value) ? Number(latest.value.toFixed(2)) : null;
    const latestLabel = formatLatestLabel(latest);

    const card = document.createElement('div');
    card.className = 'ec-card market-card';
    card.innerHTML = `
      <div class="title">
        <span>${item.label}</span>
        ${badgeHtml}
      </div>
      ${latestLabel ? `<div class="om-card-secondary">更新：${latestLabel}</div>` : ''}
    `;
    grid.appendChild(card);

    const miniGrid = document.createElement('div');
    miniGrid.className = 'mini-card-grid';
    card.appendChild(miniGrid);

    renderValueCard(miniGrid, '到期量', expiryValue, '亿');
    renderValueCard(miniGrid, '投放量', amountValue, '亿');
    renderValueCard(miniGrid, '净投放', netValue, '亿');
    renderValueCard(miniGrid, '利率', latestRate, '%', latestLabel || '');
  }
}

function renderShiborChart(mountEl, seriesSource, groupKey) {
  if (!mountEl) return;

  if (shiborChartState.mount !== mountEl) {
    shiborChartState.mount = mountEl;
    shiborChartState.slot = mountEl;
  }

  shiborDisposeSafe();

  const seriesList = getShiborSeriesGroup(seriesSource, groupKey).filter(
    (serie) =>
      Array.isArray(serie.data) && serie.data.some(([, value]) => typeof value === 'number')
  );

  if (!ensure(seriesList.length, 'open-market: shibor series empty', { groupKey })) {
    renderEmptyState(mountEl, '暂无数据', { className: 'empty-state' });
    return;
  }

  const slot = shiborChartState.slot || document.createElement('div');
  if (!shiborChartState.slot) {
    slot.style.cssText = 'height:320px';
    mountEl.appendChild(slot);
    shiborChartState.slot = slot;
  }

  const valuePool = [];
  seriesList.forEach((serie) => {
    serie.data.forEach(([, value]) => {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        valuePool.push(value);
      }
    });
  });

  const safeValues = valuePool.length ? valuePool : [0];
  const vMin = Math.min(...safeValues);
  const vMax = Math.max(...safeValues);
  const spread = vMax - vMin;
  const pad = spread > 0 ? spread * 0.1 : Math.abs(vMax || 1) * 0.02;

  const chartSeries = seriesList.map((serie) => ({
    name: serie.name,
    data: serie.data.map(([date, value]) => [date, value]),
    smooth: true,
    showSymbol: true,
    symbolSize: 5,
    connectNulls: true,
  }));

  const chart = renderLineChart(slot, {
    legend: { top: 8, left: 0, icon: 'circle' },
    grid: { left: 48, right: 32, top: 40, bottom: 48, containLabel: true },
    tooltip: {
      valueFormatter: (value) => {
        if (value == null || Number.isNaN(Number(value))) return '--';
        return `${Number(value).toFixed(4)}%`;
      },
      formatter: (items) => {
        if (!Array.isArray(items) || !items.length) return '';
        const first = items[0];
        const rawDate = Array.isArray(first.data) ? first.data[0] : first.axisValue;
        const dateLabel = fmtDateLabel(rawDate);
        const lines = items.map((item) => {
          const raw = Array.isArray(item.data) ? item.data[1] : item.data;
          if (raw == null || Number.isNaN(Number(raw))) {
            return `${item.marker}${item.seriesName}: --`;
          }
          const val = Number(raw);
          return `${item.marker}${item.seriesName}: ${val.toFixed(2)}%`;
        });
        return `${dateLabel}<br/>${lines.join('<br/>')}`;
      },
    },
    xAxis: {
      axisLabel: {
        formatter: (value) => {
          const dt = new Date(value);
          if (Number.isNaN(dt.getTime())) return '';
          const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
            dt.getDate()
          ).padStart(2, '0')}`;
          return fmtDateLabel(iso);
        },
      },
    },
    yAxis: {
      min: vMin - pad,
      max: vMax + pad,
      axisLabel: {
        formatter: (value) => {
          if (value == null || Number.isNaN(Number(value))) return '--';
          return `${Number(value).toFixed(2)}%`;
        },
      },
    },
    series: chartSeries,
  });

  if (!ensure(chart, 'open-market: shibor chart init failed', { groupKey })) {
    renderEmptyState(slot, '暂无数据', { className: 'empty-state' });
    return;
  }

  shiborChartState.inst = chart;
}

/**
 * 渲染 Shibor 区域，包含 Tab/标题/图表。
 * @param {HTMLElement} container
 * @param {Array|Map} [seriesSource=[]]
 */
async function renderShiborSection(container, seriesSource = []) {
  if (!container) return;
  container.innerHTML = '';

  if (!SHIBOR_GROUPS.length) {
    renderEmptyState(container, '暂无 Shibor 配置', { className: 'empty-state' });
    return;
  }

  const tabs = document.createElement('div');
  tabs.className = 'ec-tabs';
  container.appendChild(tabs);

  const card = document.createElement('div');
  card.className = 'ec-card shibor-card';
  container.appendChild(card);

  const titleEl = document.createElement('div');
  titleEl.className = 'title';
  card.appendChild(titleEl);

  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'shibor-subtitle';
  card.appendChild(subtitleEl);

  const chartEl = document.createElement('div');
  chartEl.className = 'chart';
  chartEl.id = 'shibor-chart';
  card.appendChild(chartEl);

  const buttons = new Map();
  let currentKey = SHIBOR_GROUPS[0]?.key || '';

  const updateTabs = () => {
    buttons.forEach((btn, key) => {
      btn.classList.toggle('is-active', key === currentKey);
    });
  };

  const rerender = () => {
    const group = SHIBOR_GROUPS.find((item) => item.key === currentKey) || SHIBOR_GROUPS[0];
    if (!ensure(group, 'open-market: shibor group missing', { currentKey })) {
      renderEmptyState(chartEl, '暂无 Shibor 数据', { className: 'empty-state' });
      return;
    }

    titleEl.textContent = group.title;
    subtitleEl.textContent = group.subtitle || '';
    subtitleEl.style.display = group.subtitle ? 'block' : 'none';
    renderShiborChart(chartEl, seriesSource, group.key);
  };

  SHIBOR_GROUPS.forEach((group) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ec-tab';
    btn.textContent = group.tab || group.title;
    btn.addEventListener('click', () => {
      if (currentKey === group.key) return;
      currentKey = group.key;
      updateTabs();
      rerender();
    });
    tabs.appendChild(btn);
    buttons.set(group.key, btn);
  });

  updateTabs();
  rerender();
}

/**
 * 渲染公开市场视图入口。
 * @param {HTMLElement} mount
 * @returns {Promise<void>}
 */
export async function renderOpenMarket(mount) {
  if (!mount) return;
  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }
  disposeAllCharts();
  ensureEcharts();

  shiborChartState.inst = null;
  shiborChartState.mount = null;
  shiborChartState.slot = null;

  const data = await loadSheet('open_market');
  const summary = data?.summary && typeof data.summary === 'object' ? data.summary : {};
  const seriesMap = toSeriesMap(data?.series);
  const rangeWindow = data?.export_info?.range_window;

  mount.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = '公开市场';
  mount.appendChild(heading);

  const topTitle = document.createElement('div');
  topTitle.className = 'section-title';
  topTitle.textContent = '公开市场（周度）';
  mount.appendChild(topTitle);

  const topContainer = document.createElement('div');
  mount.appendChild(topContainer);
  await renderMarketCards(topContainer, summary, seriesMap, rangeWindow);

  const shTitle = document.createElement('div');
  shTitle.className = 'section-title';
  shTitle.textContent = 'SHIBOR';
  mount.appendChild(shTitle);

  const shContainer = document.createElement('div');
  mount.appendChild(shContainer);
  await renderShiborSection(shContainer, data?.series || []);

  mount.__viewCleanup = () => {
    disposeAllCharts();
    shiborDisposeSafe();
    shiborChartState.mount = null;
    shiborChartState.slot = null;
  };
}
