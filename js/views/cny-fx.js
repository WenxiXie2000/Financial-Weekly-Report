import { loadSheet } from "../data-adapter.js";
import { percentAxisLabel } from "../utils.js";

const CURRENCIES = [
  { id: "USDCNY", label: "美元", keyword: "人民币兑美元" },
  { id: "CNHUSD", label: "离岸美元", keyword: "离岸人民币兑美元", noMid: true },
  { id: "EURCNY", label: "欧元", keyword: "人民币兑欧元" },
  { id: "JPY100CNY", label: "100日元", keyword: "人民币兑100日元" },
  { id: "AUDCNY", label: "澳元", keyword: "人民币兑澳元" },
];

function metricSuffix(key) {
  switch (key) {
    case "rate":
      return "汇率";
    case "chg":
      return "涨跌幅";
    case "mid":
      return "央行中间价";
    case "mid_chg":
      return "央行中间价调整情况";
    default:
      return "";
  }
}

function pickSeries(data, currencyKw, metricKey) {
  if (!Array.isArray(data.series)) return null;
  const suffix = metricSuffix(metricKey);
  if (!suffix) return null;
  const series = data.series.find(
    (item) =>
      typeof item.name === "string" &&
      item.name.includes(currencyKw) &&
      item.name.includes(suffix)
  );
  if (!series) return null;
  const points = Array.isArray(series.data)
    ? series.data.map(([t, v]) => [t, v == null ? null : Number(v)])
    : [];
  return { name: series.name, points };
}

function buildSeriesFromTable(data, currencyKw, metricKey) {
  const table = data.table;
  if (!Array.isArray(table) || !table.length) return null;

  const cols = Object.keys(table[0]);
  const dateCol = cols.includes("日期") ? "日期" : cols[0];
  const metricKw =
    metricKey === "rate"
      ? "汇率"
      : metricKey === "chg"
      ? "涨跌幅"
      : metricKey === "mid"
      ? "中间价"
      : "中间价调整";
  const col = cols.find((c) => c.includes(currencyKw) && c.includes(metricKw));
  if (!col) return null;

  const points = table
    .filter((row) => row[dateCol])
    .map((row) => {
      const raw = row[col];
      if (raw == null || raw === "") return [row[dateCol], null];
      let value = raw;
      if (metricKey === "chg" || metricKey === "mid_chg") {
        if (typeof value === "string" && value.endsWith("%")) {
          value = value.slice(0, -1);
        }
      }
      const num = Number(value);
      return [row[dateCol], Number.isNaN(num) ? null : num];
    });

  return { name: `${currencyKw}${metricKw}`, points };
}

function sliceLastWeekdays(points, maxDays = 7) {
  const arr = (points || [])
    .filter(([t]) => t)
    .map(([t, v]) => [new Date(String(t).replace(/-/g, "/")).getTime(), v])
    .filter(([ts]) => !Number.isNaN(ts))
    .sort((a, b) => a[0] - b[0]);
  if (!arr.length) return [];
  const endTs = arr[arr.length - 1][0];
  const beginTs = endTs - maxDays * 86400000;
  return arr.filter(([ts]) => {
    if (ts < beginTs) return false;
    const w = new Date(ts).getDay();
    return w >= 1 && w <= 5;
  });
}

function renderKpiChips(container, metricKey, points) {
  container.innerHTML = "";
  if (!points.length) {
    container.innerHTML = '<div class="empty-state">近一周无数据</div>';
    return;
  }
  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;";
  points.forEach(([ts, v]) => {
    const d = new Date(ts);
    const tag = `${d.getMonth() + 1}/${d.getDate()}`;
    const label =
      v == null
        ? "--"
        : metricKey === "chg" || metricKey === "mid_chg"
        ? `${Number(v).toFixed(4)}%`
        : String(v);
    const chip = document.createElement("div");
    chip.style.cssText =
      "border:1px solid var(--border);border-radius:10px;padding:6px 10px;font-size:12px;";
    chip.textContent = `${tag}  ${label}`;
    row.appendChild(chip);
  });
  container.appendChild(row);
}

function lazyInitChart(dom, option) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        const chart = echarts.init(dom);
        chart.setOption(option);
        const handleResize = () => chart.resize();
        window.addEventListener("resize", handleResize);
        observer.unobserve(dom);
      }
    },
    { threshold: 0.1 }
  );
  observer.observe(dom);
}

export async function renderCnyFx(mount) {
  const data = await loadSheet("cny_fx");

  const title = document.createElement("h2");
  title.textContent = "人民币汇率仪表盘";
  mount.appendChild(title);

  CURRENCIES.forEach((cfg) => {
    const section = document.createElement("section");
    section.className = "fx-section card";
    section.innerHTML = `<div class="card-header">${cfg.label}</div>`;

    const grid = document.createElement("div");
    grid.className = "fx-grid";
    section.appendChild(grid);

    mount.appendChild(section);

    (() => {
      const card = document.createElement("div");
      card.className = "fx-card";
      card.innerHTML = `<div class="fx-card-title">兑${cfg.label}汇率</div>`;
      const chartEl = document.createElement("div");
      chartEl.style.cssText = "height:220px;";
      card.appendChild(chartEl);
      grid.appendChild(card);

      const ser =
        pickSeries(data, cfg.keyword, "rate") ||
        buildSeriesFromTable(data, cfg.keyword, "rate");
      const option = {
        tooltip: { trigger: "axis" },
        xAxis: { type: "time" },
        yAxis: { type: "value" },
        series: [
          {
            name: ser?.name || `${cfg.label}汇率`,
            type: "line",
            showSymbol: false,
            data: ser?.points || [],
          },
        ],
      };
      lazyInitChart(chartEl, option);
    })();

    (() => {
      const card = document.createElement("div");
      card.className = "fx-card";
      card.innerHTML = `<div class="fx-card-title">${cfg.label}涨跌幅（%）</div>`;
      const chartEl = document.createElement("div");
      chartEl.style.cssText = "height:220px;";
      card.appendChild(chartEl);
      grid.appendChild(card);

      const ser =
        pickSeries(data, cfg.keyword, "chg") ||
        buildSeriesFromTable(data, cfg.keyword, "chg");
      const option = {
        tooltip: { trigger: "axis" },
        xAxis: { type: "time" },
        yAxis: { type: "value", axisLabel: { formatter: percentAxisLabel } },
        series: [
          {
            name: ser?.name || `${cfg.label}涨跌幅`,
            type: "line",
            showSymbol: false,
            data: ser?.points || [],
          },
        ],
      };
      lazyInitChart(chartEl, option);
    })();

    if (!cfg.noMid) {
      (() => {
        const card = document.createElement("div");
        card.className = "fx-card";
        card.innerHTML = `<div class="fx-card-title">${cfg.label}央行中间价（近一周）</div>`;
        const body = document.createElement("div");
        body.style.cssText = "min-height:48px;";
        card.appendChild(body);
        grid.appendChild(card);

        const ser =
          pickSeries(data, cfg.keyword, "mid") ||
          buildSeriesFromTable(data, cfg.keyword, "mid");
        const week = sliceLastWeekdays(ser?.points || [], 7);
        renderKpiChips(body, "mid", week);
      })();

      (() => {
        const card = document.createElement("div");
        card.className = "fx-card";
        card.innerHTML = `<div class="fx-card-title">${cfg.label}中间价调整（近一周）</div>`;
        const body = document.createElement("div");
        body.style.cssText = "min-height:48px;";
        card.appendChild(body);
        grid.appendChild(card);

        const ser =
          pickSeries(data, cfg.keyword, "mid_chg") ||
          buildSeriesFromTable(data, cfg.keyword, "mid_chg");
        const week = sliceLastWeekdays(ser?.points || [], 7);
        renderKpiChips(body, "mid_chg", week);
      })();
    }
  });
}
