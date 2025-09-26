const BASE_PATH = "./data/values-only/";

export const SHEET_TO_FILE = {
  国内股市: "equity_cn.json",
  全球股市: "equity_global.json",
  人民币汇率: "cny_fx.json",
  Shibor利率: "open_market.json",
  公开市场货币: "open_market.json",
  债券利率: "bond_yield.json",
  集团上市公司: "group_listed.json",
  财经资讯: "news.json",
};

export const DATASET_TO_FILE = {
  overview: "overview.json",
  equity_cn: "equity_cn.json",
  equity_global: "equity_global.json",
  cny_fx: "cny_fx.json",
  open_market: "open_market.json",
  bond_yield: "bond_yield.json",
  group_listed: "group_listed.json",
  news: "news.json",
};

const cache = new Map();

const normalizeSummary = (summary) => {
  if (!summary) return {};
  if (Array.isArray(summary)) {
    return summary.reduce((acc, item) => {
      if (item && item.label) {
        acc[item.label] = item.value ?? "";
      }
      return acc;
    }, {});
  }
  if (typeof summary === "object") {
    return Object.keys(summary).reduce((acc, key) => {
      const value = summary[key];
      if (value === null || value === undefined) {
        acc[key] = "";
      } else if (typeof value === "object" && "value" in value) {
        acc[key] = value;
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  }
  return {};
};

const normalizeSeries = (series) => {
  if (!Array.isArray(series)) return [];
  return series.map((serie, index) => {
    const resolved = Array.isArray(serie?.data)
      ? serie.data.map((point) => {
          if (Array.isArray(point) && point.length >= 2) {
            return [String(point[0]), point[1]];
          }
          if (point && typeof point === "object") {
            const date = point.date ?? point.time ?? "";
            const value = point.value ?? point.val ?? "";
            return [String(date), value];
          }
          return [String(point ?? ""), null];
        })
      : [];

    return {
      name: serie?.name || `系列 ${index + 1}`,
      data: resolved,
    };
  });
};

const normalizeArticles = (data) => {
  const source = Array.isArray(data?.articles)
    ? data.articles
    : Array.isArray(data?.items)
    ? data.items
    : [];

  return source.map((item, idx) => ({
    id: item?.id ?? `${item?.title ?? "news"}-${idx}`,
    title: item?.title ?? "未命名资讯",
    source: item?.source ?? item?.publisher ?? "",
    time: item?.time ?? item?.date ?? "",
    link: item?.link ?? item?.url ?? "#",
    summary: item?.summary ?? item?.description ?? "",
  }));
};

async function fetchJson(fileName) {
  const url = `${BASE_PATH}${fileName}`;
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`数据文件获取失败：${fileName}（HTTP ${response.status}）`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`解析 JSON 失败：${fileName}`);
  }
}

export async function loadDataset(datasetKey) {
  const fileName = DATASET_TO_FILE[datasetKey];
  if (!fileName) {
    throw new Error(`未知的数据集：${datasetKey}`);
  }

  if (cache.has(datasetKey)) {
    return cache.get(datasetKey);
  }

  const raw = await fetchJson(fileName);
  const normalized = {
    meta: raw?.meta || {},
    summary: normalizeSummary(raw?.summary),
    series: normalizeSeries(raw?.series),
    table: Array.isArray(raw?.table)
      ? raw.table
      : Array.isArray(raw?.rows)
      ? raw.rows
      : [],
    board: raw?.board || null,
  };

  if (datasetKey === "news") {
    normalized.articles = normalizeArticles(raw);
    normalized.items = normalized.articles;
  }

  cache.set(datasetKey, normalized);
  return normalized;
}

export async function loadSheet(sheetKey) {
  return loadDataset(sheetKey);
}

export async function loadDatasets(datasetKeys = []) {
  return Promise.all(datasetKeys.map((key) => loadDataset(key)));
}

export function invalidateCache(datasetKey) {
  if (datasetKey) {
    cache.delete(datasetKey);
  } else {
    cache.clear();
  }
}

export function mapSheetName(sheetName) {
  return SHEET_TO_FILE[sheetName] || null;
}

if (typeof window !== "undefined") {
  window.dataAdapter = {
    loadDataset,
    loadDatasets,
    loadSheet,
    invalidateCache,
    mapSheetName,
    SHEET_TO_FILE,
    DATASET_TO_FILE,
  };
}
