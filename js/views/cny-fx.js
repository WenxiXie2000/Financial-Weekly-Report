import { loadSheet } from "../data-adapter.js";
import { asPercent } from "../utils.js";

export async function renderCnyFx(mount) {
  const data = await loadSheet("cny_fx");

  const h = document.createElement("h2");
  h.textContent = "人民币汇率";
  mount.appendChild(h);

  const kpis = [
    { key: "usdcny_mid", label: "美元中间价" },
    { key: "usdcny_mid_chg", label: "美元中间价调整" },
    { key: "eurcny_mid", label: "欧元中间价" },
    { key: "eurcny_mid_chg", label: "欧元中间价调整" },
    { key: "jpy100cny_mid", label: "100日元中间价" },
    { key: "jpy100cny_mid_chg", label: "100日元中间价调整" },
    { key: "audcny_mid", label: "澳元中间价" },
    { key: "audcny_mid_chg", label: "澳元中间价调整" },
  ];
  const kpiWrap = document.createElement("div");
  kpiWrap.className = "kpi-grid";
  kpis.forEach((k) => {
    const raw = data.summary?.[k.key];
    const txt = /_chg$/.test(k.key) ? asPercent(raw) : raw ?? "--";
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${txt}</div>`;
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
    data: Array.isArray(s.data) ? s.data.map(([t, v]) => [t, Number(v)]) : [],
  }));

  if (seriesOpt.length) {
    const ech = echarts.init(chartEl);
    ech.setOption({
      tooltip: { trigger: "axis" },
      legend: { top: 0, type: "scroll" },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: seriesOpt,
    });
    window.addEventListener("resize", () => ech.resize());
  } else {
    chartEl.innerHTML = '<div class="empty-state">暂无汇率数据</div>';
  }

  if (Array.isArray(data.table) && data.table.length) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="card-header">近一周明细（过滤后全列）</div>`;
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
          if (/涨跌幅|调整/.test(k)) v = asPercent(v);
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
