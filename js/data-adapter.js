/**
 * 数据适配层：负责从 values-only JSON 中加载并规范化数据集。
 * - BASE_PATH 可通过 window.__DATA_BASE__ / BASE_PATH / __BASE_PATH__ 注入，默认 /data/values-only/。
 * - normalizeSummary / normalizeSeries 保证前端视图能直接消费标准结构。
 * - 所有 API 返回 Promise，失败时抛出 Error，供视图层的 renderError 捕获。
 */

// --- robust base path detection ---
const DEFAULT_DATA_BASE = '/data/values-only/';
// 兼容多种命名：window.__DATA_BASE__（推荐）/ window.BASE_PATH / window.__BASE_PATH__
const DATA_BASE =
  (typeof window !== 'undefined' &&
    (window.__DATA_BASE__ || window.BASE_PATH || window.__BASE_PATH__)) ||
  DEFAULT_DATA_BASE;

// 规范化，确保末尾带 '/'
const _DATA_BASE_NORM = DATA_BASE.endsWith('/') ? DATA_BASE : DATA_BASE + '/';
export const SHEET_TO_FILE = {
  国内股市: 'equity_cn.json',
  全球股市: 'equity_global.json',
  人民币汇率: 'cny_fx.json',
  Shibor利率: 'open_market.json',
  公开市场货币: 'open_market.json',
  债券利率: 'bond_yield.json',
  集团上市公司: 'group_listed.json',
  财经资讯: 'news.json',
};

export const DATASET_TO_FILE = {
  overview: 'overview.json',
  equity_cn: 'equity_cn.json',
  equity_global: 'equity_global.json',
  cny_fx: 'cny_fx.json',
  open_market: 'open_market.json',
  bond_yield: 'bond_yield.json',
  group_listed: 'group_listed.json',
  news: 'news.json',
};

const cache = new Map();

const normalizeSummary = (summary) => {
  if (!summary) return {};
  if (Array.isArray(summary)) {
    return summary.reduce((acc, item) => {
      if (item && item.label) {
        acc[item.label] = item.value ?? '';
      }
      return acc;
    }, {});
  }
  if (typeof summary === 'object') {
    return Object.keys(summary).reduce((acc, key) => {
      const value = summary[key];
      if (value === null || value === undefined) {
        acc[key] = '';
      } else if (typeof value === 'object' && 'value' in value) {
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
          if (point && typeof point === 'object') {
            const date = point.date ?? point.time ?? '';
            const value = point.value ?? point.val ?? '';
            return [String(date), value];
          }
          return [String(point ?? ''), null];
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
    id: item?.id ?? `${item?.title ?? 'news'}-${idx}`,
    title: item?.title ?? '未命名资讯',
    source: item?.source ?? item?.publisher ?? '',
    time: item?.time ?? item?.date ?? '',
    link: item?.link ?? item?.url ?? '#',
    summary: item?.summary ?? item?.description ?? '',
  }));
};

/**
 * 从静态目录拉取 JSON，统一处理相对路径与缓存策略。
 * @param {string} fileName - 数据文件名，例如 cny_fx.json。
 * @returns {Promise<unknown>} - 解析后的原始 JSON。
 * @throws {Error} - 网络错误或 HTTP 状态非 200 时抛出。
 */
async function fetchJson(fileName) {
  // 以站点根为基准拼 URL，避免在 /tools/ 下相对路径跑偏
  const url = new URL(fileName, new URL(_DATA_BASE_NORM, location.origin)).href;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`[fetchJson] ${res.status} ${res.statusText} -> ${url}`);
  }
  return res.json();
}

/**
 * 加载并规范化单个数据集。
 * @param {string} datasetKey - 对应 DATASET_TO_FILE 的键，例如 open_market。
 * @returns {Promise<object>} - {meta, summary, series, table, board?, articles?}。
 */
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
    table: Array.isArray(raw?.table) ? raw.table : Array.isArray(raw?.rows) ? raw.rows : [],
    board: raw?.board || null,
  };

  if (datasetKey === 'news') {
    normalized.articles = normalizeArticles(raw);
    normalized.items = normalized.articles;
  }

  cache.set(datasetKey, normalized);
  return normalized;
}

/**
 * loadDataset 的别名，兼容旧代码使用“sheet”术语。
 * @param {string} sheetKey
 * @returns {Promise<object>}
 */
export async function loadSheet(sheetKey) {
  return loadDataset(sheetKey);
}

/**
 * 并行加载多个数据集，常用于页面初始化。
 * @param {string[]} datasetKeys
 * @returns {Promise<object[]>}
 */
export async function loadDatasets(datasetKeys = []) {
  return Promise.all(datasetKeys.map((key) => loadDataset(key)));
}

/**
 * 使缓存失效：传具体 key 清理单个，否则清空整个 Map。
 * @param {string} [datasetKey]
 */
export function invalidateCache(datasetKey) {
  if (datasetKey) {
    cache.delete(datasetKey);
  } else {
    cache.clear();
  }
}

/**
 * 将工作表中文名映射至文件名，便于工具页与视图联动。
 * @param {string} sheetName
 * @returns {string|null}
 */
export function mapSheetName(sheetName) {
  return SHEET_TO_FILE[sheetName] || null;
}

if (typeof window !== 'undefined') {
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
