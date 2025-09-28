import { loadSheet } from "../data-adapter.js";
import { formatYi, percentAxisLabel } from "../utils.js";

export async function renderOpenMarket(mount) {
  const data = await loadSheet("open_market");

  const h = document.createElement("h2");
  h.textContent = "公开市场（周度）";
  mount.appendChild(h);

  const kpis = [
    { key: "r7d_amt_yi", label: "逆回购7D 投放(亿)" },
    { key: "r14d_amt_yi", label: "逆回购14D 投放(亿)" },
    { key: "mlf_amt_yi", label: "MLF 投放(亿)" },
    { key: "tcd_amt_yi", label: "国库定存 投放(亿)" },
    { key: "slf_amt_yi", label: "SLF 投放(亿)" },
    { key: "slo_amt_yi", label: "SLO 投放(亿)" },
    { key: "repo_amt_yi", label: "正回购 投放(亿)" },
  ];
  const kpiWrap = document.createElement("div");
  kpiWrap.className = "kpi-grid";
  kpis.forEach((k) => {
    const v = data.summary?.[k.key];
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `<div class="kpi-label">${
      k.label
    }</div><div class="kpi-value">${formatYi(v)}</div>`;
    kpiWrap.appendChild(card);
  });
  mount.appendChild(kpiWrap);

  const chartEl = document.createElement("div");
  chartEl.style.cssText = "height:360px;margin-top:12px";
  mount.appendChild(chartEl);

  const seriesOpt = (data.series || []).map((s) => ({
    name: s.name,
    type: "line",
    showSymbol: false,
    data: Array.isArray(s.data)
      ? s.data.map(([t, v]) => [t, v == null ? null : Number(v)])
      : [],
  }));

  if (seriesOpt.length) {
    const ech = echarts.init(chartEl);
    ech.setOption({
      tooltip: { trigger: "axis" },
      legend: { top: 0, type: "scroll" },
      xAxis: { type: "time" },
      yAxis: { type: "value", axisLabel: { formatter: percentAxisLabel } },
      series: seriesOpt,
    });
    window.addEventListener("resize", () => ech.resize());
  } else {
    chartEl.innerHTML = '<div class="empty-state">暂无利率数据</div>';
  }

  if (Array.isArray(data.table) && data.table.length) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="card-header">周度明细（过滤后全列）</div>`;
    const tbl = document.createElement("table");
    tbl.style.cssText =
      "width:100%;border-collapse:collapse;font-size:14px;margin:8px 0";
    const cols = Object.keys(data.table[0]);
    tbl.innerHTML = `<thead><tr>${cols
      .map(
        (c) =>
          `<th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">${c}</th>`
      )
      .join("")}</tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector("tbody");
    data.table.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = cols
        .map((k) => {
          let v = row[k];
          if (/到期量|投放量|净投放/.test(k)) v = formatYi(v);
          if (/利率/.test(k) && v != null && v !== "--") {
            const num = Number(v);
            v = Number.isNaN(num) ? v : `${num.toFixed(4)}%`;
          }
          return `<td style="padding:6px;border-bottom:1px solid var(--border)">${
            v ?? "--"
          }</td>`;
        })
        .join("");
      tb.appendChild(tr);
    });
    card.appendChild(tbl);
    mount.appendChild(card);
  }
}
