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

function parseNumeric(raw) {
  if (raw == null || raw === '' || raw === '--') return null;
  if (typeof raw === 'number') {
    return Number.isNaN(raw) ? null : raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.replace(/[%\s]/g, '');
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isNaN(num) ? null : num;
  }
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

function toSeriesMap(seriesArr) {
  const map = new Map();
  if (Array.isArray(seriesArr)) {
    for (const item of seriesArr) {
      if (!item || typeof item.name === 'undefined') continue;
      const key = String(item.name);
      const data = Array.isArray(item.data) ? item.data : [];
      map.set(key, data);
    }
  }
  return map;
}

function pickSeries(seriesMap, name, options = {}) {
  if (!name) return [];
  const arr = (seriesMap instanceof Map ? seriesMap.get(name) : null) || [];
  const clean = [];
  for (const entry of arr) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, raw] = entry;
    if (date == null) continue;
    const num = parseNumeric(raw);
    if (num == null && num !== 0) continue;
    clean.push([String(date), num]);
  }
  if (clean.length === 0) return [];

  let windowDays = null;
  let lastN = null;
  if (typeof options === 'number') {
    lastN = options;
  } else if (options && typeof options === 'object') {
    if (Number.isFinite(options.windowDays)) {
      windowDays = options.windowDays;
    }
    if (Number.isFinite(options.lastN)) {
      lastN = options.lastN;
    }
  }

  let filtered = clean;
  if (windowDays && windowDays > 0 && clean.length) {
    const latestRaw = clean[clean.length - 1][0];
    const latestDate = new Date(latestRaw.replace(/-/g, '/'));
    if (!Number.isNaN(latestDate.getTime())) {
      const cutoff = new Date(latestDate.getTime() - (windowDays - 1) * 86400000);
      cutoff.setHours(0, 0, 0, 0);
      filtered = clean.filter(([dateStr]) => {
        if (!dateStr) return false;
        const parsed = new Date(String(dateStr).replace(/-/g, '/'));
        if (Number.isNaN(parsed.getTime())) return false;
        parsed.setHours(0, 0, 0, 0);
        return parsed >= cutoff;
      });
    }
  }

  if (lastN && lastN > 0) {
    return filtered.slice(-lastN);
  }

  return filtered;
}

function windowForShibor(name) {
  if (!name) return null;
  if (/隔夜|1周|2周/.test(name)) return 90;
  if (/3月|6月|9月/.test(name)) return 180;
  if (/1年/.test(name)) return 365;
  return null;
}

function pickShibor(seriesSource, name) {
  if (!name) return [];
  let rawSeries = [];
  if (seriesSource instanceof Map) {
    rawSeries = seriesSource.get(name) || [];
  } else if (Array.isArray(seriesSource)) {
    const found = seriesSource.find((item) => item && item.name === name);
    rawSeries = found && Array.isArray(found.data) ? found.data : [];
  }

  const clean = [];
  for (const entry of rawSeries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, raw] = entry;
    if (date == null) continue;
    const num = parseNumeric(raw);
    if (num == null && num !== 0) continue;
    clean.push([String(date), num]);
  }

  if (!clean.length) return [];
  const win = windowForShibor(name);
  return Number.isFinite(win) && win > 0 ? clean.slice(-win) : clean;
}

function findLatestPoint(seriesMap, name) {
  if (!name) return null;
  const arr = (seriesMap instanceof Map ? seriesMap.get(name) : null) || [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const entry = arr[i];
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, raw] = entry;
    if (date == null) continue;
    const num = parseNumeric(raw);
    if (num == null && num !== 0) continue;
    return { date: String(date), value: num };
  }
  return null;
}

function getShiborSeriesGroup(seriesSource, groupKey) {
  const group = SHIBOR_GROUPS.find((item) => item.key === groupKey) || SHIBOR_GROUPS[0];
  if (!group) return [];
  return group.series.map((serie) => ({
    name: serie.label,
    data: pickShibor(seriesSource, serie.name),
  }));
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
    const latestLabel = latest?.date ? fmtDateLabel(latest.date) : '';

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

/**
 * 渲染单个迷你数值卡。
 * @param {HTMLElement} container
 * @param {string} label
 * @param {number|string|null} value
 * @param {string} [unit='']
 * @param {string} [rateInfo='']
 */
function renderValueCard(container, label, value, unit = '', rateInfo = '') {
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'mini-card compact';
  div.innerHTML = `
    <div class="mini-card__label">${label}</div>
    <div class="mini-card__value">
      ${
        // 0 属于有效指标（例如净投放为 0），不可当作空值过滤
        value != null && value !== '' && !Number.isNaN(Number(value))
          ? `${formatNumber(value)}${unit}`
          : '--'
      }
    </div>
    ${rateInfo ? `<div class="mini-card__rate">${rateInfo}</div>` : ''}
  `;
  container.appendChild(div);
}

function formatNumber(num) {
  if (num == null || num === '' || Number.isNaN(Number(num))) return '--';
  const value = Number(num);
  const abs = Math.abs(value);
  if (abs >= 1e8) return (value / 1e8).toFixed(1);
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return value.toLocaleString();
}

/**
 * 绘制 Shibor 折线图，依据 groupKey 选择曲线集合。
 * @param {HTMLElement} mountEl
 * @param {Map<string, Array<[string, number]>>|Array} seriesSource
 * @param {string} groupKey
 */
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

  if (!seriesList.length) {
    if (shiborChartState.mount) {
      shiborChartState.mount.innerHTML = '<div class="empty-state">暂无数据</div>';
    }
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
    container.innerHTML = '<div class="empty-state">暂无 Shibor 配置</div>';
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
    if (!group) {
      chartEl.innerHTML = '<div class="empty-state">暂无 Shibor 数据</div>';
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
