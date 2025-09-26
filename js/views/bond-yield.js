import { loadSheet } from "../data-adapter.js";
import { formatYi, asPercent, percentAxisLabel } from "../utils.js";

export async function renderBondYield(mount) {
  const data = await loadSheet("bond_yield");

  const h = document.createElement("h2");
  h.textContent = "债券利率（周度）";
  mount.appendChild(h);

  const kpiKeys = [
    "aaa_3y_sum_size",
    "AAA公司债3年_avg_coupon",
    "aaa_5y_sum_size",
    "AAA公司债5年_avg_coupon",
    "aaa_mt_5y_sum_size",
    "AAA中票5年_avg_coupon",
    "mp_1y_rate",
    "mp_3y_rate",
    "mp_5y_rate",
    "mp_7y_rate",
    "mp_10y_rate",
  ];
  const labels = {
    aaa_3y_sum_size: "AAA公司债3年 发行规模合计(亿)",
    AAA公司债3年_avg_coupon: "AAA公司债3年 均值票面(%)",
    aaa_5y_sum_size: "AAA公司债5年 发行规模合计(亿)",
    AAA公司债5年_avg_coupon: "AAA公司债5年 均值票面(%)",
    aaa_mt_5y_sum_size: "AAA中票5年 发行规模合计(亿)",
    AAA中票5年_avg_coupon: "AAA中票5年 均值票面(%)",
    mp_1y_rate: "AAA中短票 1Y(%)",
    mp_3y_rate: "AAA中短票 3Y(%)",
    mp_5y_rate: "AAA中短票 5Y(%)",
    mp_7y_rate: "AAA中短票 7Y(%)",
    mp_10y_rate: "AAA中短票 10Y(%)",
  };
  const kpiWrap = document.createElement("div");
  kpiWrap.className = "kpi-grid";
  kpiKeys.forEach((k) => {
    let v = data.summary?.[k];
    let txt = v ?? "--";
    if (/_sum_size$/.test(k)) txt = formatYi(v);
    if (/_avg_coupon$|_rate$/.test(k)) txt = asPercent(v);
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `<div class="kpi-label">${
      labels[k] || k
    }</div><div class="kpi-value">${txt}</div>`;
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
          if (/发行规模/.test(k) && v != null) v = formatYi(v);
          if (/票面利率/.test(k) && v != null && v !== "--") {
            const num = Number(v);
            v = Number.isNaN(num) ? v : asPercent(`${num.toFixed(4)}%`);
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
