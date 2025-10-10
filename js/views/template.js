import { loadSheet } from '../data-adapter.js';

export function renderPlaceholder(mount, message = '内容即将上线') {
  if (!mount) return;
  mount.innerHTML = `
    <div class="empty-state" style="
      padding:16px;border:1px dashed var(--border,#e6e6e6);
      border-radius:12px;color:var(--text2,#666);background:var(--bg2,#fafafa);
    ">${message}</div>
  `;
}

export function renderError(mount, err) {
  if (!mount) return;
  const msg = err && err.message ? err.message : String(err ?? '未知错误');
  mount.innerHTML = `
    <div class="empty-state" style="
      padding:16px;border:1px solid #f5c2c7;background:#fff5f5;color:#b42318;
      border-radius:12px;white-space:pre-wrap;font-family:var(--font-mono,ui-monospace,monospace);
    ">渲染失败：${msg}</div>
  `;
}

export function ensureEcharts() {
  if (typeof window === 'undefined' || typeof window.echarts === 'undefined') {
    throw new Error(
      'ECharts library not loaded. 请确认 index.html 已正确引入 echarts.min.js 且顺序在 app.js 之前。'
    );
  }
}

export async function renderTemplate(mount, { title, sheet }) {
  const data = await loadSheet(sheet);
  const h = document.createElement('h2');
  h.textContent = title;
  mount.appendChild(h);

  if (Array.isArray(data.series) && data.series.length) {
    ensureEcharts();
    const chartEl = document.createElement('div');
    chartEl.style.cssText = 'height:320px;margin-top:8px';
    mount.appendChild(chartEl);
    const ech = echarts.init(chartEl);
    ech.setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value' },
      series: data.series.map((s) => ({
        name: s.name,
        type: 'line',
        showSymbol: false,
        data: Array.isArray(s.data) ? s.data.map(([t, v]) => [t, Number(v)]) : [],
      })),
    });
    window.addEventListener('resize', () => ech.resize());
  }

  if (Array.isArray(data.table) && data.table.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="card-header">明细（过滤后全列）</div>`;
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:14px;margin:8px 0';
    const cols = Object.keys(data.table[0]);
    tbl.innerHTML = `<thead><tr>${cols
      .map(
        (c) =>
          `<th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">${c}</th>`
      )
      .join('')}</tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector('tbody');
    data.table.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = cols
        .map(
          (k) =>
            `<td style="padding:6px;border-bottom:1px solid var(--border)">${row[k] ?? '--'}</td>`
        )
        .join('');
      tb.appendChild(tr);
    });
    card.appendChild(tbl);
    mount.appendChild(card);
  }
}
