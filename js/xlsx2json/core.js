import { SHEET_PROFILES } from "./profiles.js";
import parseByProfile from "./parsers/profile-based.js";
import parseGroupListed from "./parsers/group-listed.js";
import parseCnyFx from "./parsers/cny-fx.js";
import parseShibor from "./parsers/shibor.js";
import {
  parseOpenMarketMonetary,
  buildOpenMarketDataset,
} from "./parsers/open-market.js";
import parseBondYield from "./parsers/bond-yield.js";
import parseMidPaper from "./parsers/mid-paper.js";

/**
 * @typedef {import("./types.js").CnyFxJson} CnyFxJson
 * @typedef {import("./types.js").GroupListedJson} GroupListedJson
 * @typedef {import("./types.js").OpenMarketMonetaryFragment} OpenMarketMonetaryFragment
 * @typedef {import("./types.js").OpenMarketJson} OpenMarketJson
 * @typedef {import("./types.js").ShiborJson} ShiborJson
 * @typedef {import("./types.js").BondYieldJson} BondYieldJson
 * @typedef {import("./types.js").ProfileJson} ProfileJson
 * @typedef {import("./types.js").ConvertSheetsResult} ConvertSheetsResult
 * @typedef {import("./types.js").SheetParseDetail} SheetParseDetail
 * @typedef {import("./types.js").RunArrayBufferResult} RunArrayBufferResult
 */

const SHEET_ALIASES = {
  集团上市公司: "国能上市公司",
  公开市场: "公开市场货币",
};

export const SHEET_TO_FILE = {
  国内股市: "equity_cn.json",
  全球股市: "equity_global.json",
  人民币汇率: "cny_fx.json",
  公开市场: "open_market.json",
  公开市场货币: "open_market.json",
  Shibor利率: "open_market.json",
  债券利率: "bond_yield.json",
  集团上市公司: "group_listed.json",
  国能上市公司: "group_listed.json",
  中票利率: "bond_yield.json",
  财经资讯: "news.json",
};

/**
 * 将原始工作表名称统一为内部标准名称。
 *
 * @param {unknown} sheetName 原始工作表名称。
 * @returns {string}
 */
export function normalizeSheetName(sheetName) {
  const name = String(sheetName ?? "").trim();
  if (!name) return "";
  return SHEET_ALIASES[name] || name;
}

/**
 * 根据工作表名称推断输出文件名。
 *
 * @param {unknown} sheetName 原始工作表名称。
 * @returns {string|null}
 */
export function getOutputFile(sheetName) {
  const normalized = normalizeSheetName(sheetName);
  return SHEET_TO_FILE[normalized] || null;
}

function cloneDataset(data) {
  return data == null ? null : JSON.parse(JSON.stringify(data));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneDiagnostics(diag, fallbackSheet) {
  if (!diag || !Array.isArray(diag.items)) return null;
  const sheetName =
    diag.sheet || (fallbackSheet != null ? String(fallbackSheet) : "");
  const cloned = {
    sheet: sheetName,
    items: diag.items.map((item) => {
      if (!item || typeof item !== "object") {
        return item;
      }
      const clonedEntry = { ...item };
      if (Array.isArray(item.closest)) {
        clonedEntry.closest = [...item.closest];
      }
      if (item.extra && typeof item.extra === "object") {
        clonedEntry.extra = { ...item.extra };
      }
      return clonedEntry;
    }),
  };
  if (Object.prototype.hasOwnProperty.call(diag, "dateCol")) {
    cloned.dateCol = diag.dateCol ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(diag, "range")) {
    cloned.range = diag.range ?? null;
  }
  return cloned;
}

function dedupeSortedPairs(pairs) {
  const result = [];
  for (const point of pairs) {
    if (!Array.isArray(point) || point.length === 0) continue;
    const key = point[0];
    if (result.length && result[result.length - 1][0] === key) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }
  return result;
}

function mergeSeries(targetList = [], incomingList = []) {
  const map = new Map();
  targetList.forEach((serie) => {
    if (!serie || !serie.name) return;
    const clone = {
      ...serie,
      data: ensureArray(serie.data).map((item) =>
        Array.isArray(item) ? [...item] : item
      ),
    };
    map.set(serie.name, clone);
  });

  incomingList.forEach((serie) => {
    if (!serie || !serie.name) return;
    const existing = map.get(serie.name);
    const incomingData = ensureArray(serie.data).map((item) =>
      Array.isArray(item) ? [...item] : item
    );
    if (existing) {
      const merged = ensureArray(existing.data)
        .concat(incomingData)
        .filter((item) => Array.isArray(item) && item.length >= 2)
        .sort((a, b) => new Date(a[0]) - new Date(b[0]));
      existing.data = dedupeSortedPairs(merged);
    } else {
      map.set(serie.name, {
        ...serie,
        data: incomingData,
      });
    }
  });

  return Array.from(map.values());
}

/**
 * 合并两个数据集，优先保留已有字段并补充新增数据。
 *
 * @template {Record<string, unknown>} T
 * @param {T|null|undefined} target 已有数据集。
 * @param {T|null|undefined} incoming 新增数据集。
 * @returns {T|null}
 */
export function mergeDatasets(target, incoming) {
  if (!incoming) return target;
  if (!target) return cloneDataset(incoming);

  const merged = target;
  const addition = cloneDataset(incoming);

  merged.meta = merged.meta || {};
  addition.meta = addition.meta || {};

  const sourceSet = new Set();
  ensureArray(merged.meta.sourceSheets).forEach((s) => s && sourceSet.add(s));
  if (merged.meta.sourceSheet) sourceSet.add(merged.meta.sourceSheet);
  ensureArray(addition.meta.sourceSheets).forEach((s) => s && sourceSet.add(s));
  if (addition.meta.sourceSheet) sourceSet.add(addition.meta.sourceSheet);
  merged.meta.sourceSheets = Array.from(sourceSet);

  merged.meta.unit = {
    ...(addition.meta.unit || {}),
    ...(merged.meta.unit || {}),
  };

  if (!merged.meta.note && addition.meta.note) {
    merged.meta.note = addition.meta.note;
  }

  merged.summary = {
    ...(merged.summary || {}),
    ...(addition.summary || {}),
  };

  merged.series = mergeSeries(
    ensureArray(merged.series),
    ensureArray(addition.series)
  );

  if (addition.changeSeries) {
    merged.changeSeries = mergeSeries(
      ensureArray(merged.changeSeries),
      ensureArray(addition.changeSeries)
    );
  }

  if (addition.events) {
    merged.events = merged.events || {};
    Object.entries(addition.events).forEach(([region, entries]) => {
      if (!Array.isArray(entries) || !entries.length) return;
      if (!Array.isArray(merged.events[region])) {
        merged.events[region] = [];
      }
      merged.events[region] = merged.events[region].concat(entries);
    });
  }

  if (addition.table) {
    merged.table = ensureArray(merged.table).concat(
      ensureArray(addition.table)
    );
  }

  merged.export_info = merged.export_info || {};
  if (addition.export_info) {
    const { export_info: prevInfo } = merged;
    const nextInfo = addition.export_info || {};

    const r1 = prevInfo.range;
    const r2 = nextInfo.range;
    if (r1 || r2) {
      const all = [];
      if (Array.isArray(r1)) {
        if (r1[0]) all.push(r1[0]);
        if (r1[1]) all.push(r1[1]);
      }
      if (Array.isArray(r2)) {
        if (r2[0]) all.push(r2[0]);
        if (r2[1]) all.push(r2[1]);
      }
      all.sort((a, b) => new Date(a) - new Date(b));
      if (all.length) {
        prevInfo.range = [all[0], all[all.length - 1]];
      }
    }

    const normalizeTime = (value) => {
      if (!value) return null;
      const formatted = value.includes("T") ? value : value.replace(" ", "T");
      const parsed = new Date(formatted);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const prevTime = normalizeTime(merged.export_info.last_updated);
    const nextTime = normalizeTime(nextInfo.last_updated);
    if (!prevTime || (nextTime && nextTime > prevTime)) {
      merged.export_info.last_updated = nextInfo.last_updated;
    }

    if (typeof nextInfo.rows === "number") {
      const prevRows =
        typeof merged.export_info.rows === "number"
          ? merged.export_info.rows
          : 0;
      merged.export_info.rows = prevRows + nextInfo.rows;
    }

    if (nextInfo.diagnostics) {
      merged.export_info.diagnostics = merged.export_info.diagnostics || {};
      Object.entries(nextInfo.diagnostics).forEach(([key, value]) => {
        if (!Array.isArray(value)) return;
        merged.export_info.diagnostics[key] = ensureArray(
          merged.export_info.diagnostics[key]
        ).concat(value);
      });
    }
  }

  return merged;
}

/**
 * 将单个工作表转换为规范化的解析结果。
 *
 * @param {Array<Array<unknown>>} rows SheetJS 转换后的二维数组。
 * @param {string} sheetName 原始工作表名称。
 * @param {{ anchor?: Date, profiles?: typeof SHEET_PROFILES }} [options] 解析选项。
 * @returns {SheetParseDetail & {
 *   payload:
 *     | CnyFxJson
 *     | GroupListedJson
 *     | OpenMarketMonetaryFragment
 *     | ShiborJson
 *     | BondYieldJson
 *     | ProfileJson
 *     | null
 * }}
 */
export function parseSheet(
  rows,
  sheetName,
  { anchor = new Date(), profiles = SHEET_PROFILES } = {}
) {
  const normalized = normalizeSheetName(sheetName);
  const profile = profiles?.[normalized];
  const context = { anchor, sheetName: normalized };

  if (normalized === "人民币汇率") {
    const payload = parseCnyFx(rows, profile || {}, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "cny_fx",
      payload,
    };
  }

  if (normalized === "国能上市公司") {
    const payload = parseGroupListed(rows, profile || {}, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "group_listed",
      payload,
    };
  }

  if (normalized === "公开市场货币") {
    const payload = parseOpenMarketMonetary(rows, profile || {}, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "open_market_monetary",
      payload,
    };
  }

  if (normalized === "Shibor利率") {
    const payload = parseShibor(rows, profile || {}, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "open_market_shibor",
      payload,
    };
  }

  if (normalized === "债券利率") {
    const payload = parseBondYield(rows, profile || {}, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "bond_yield",
      payload,
    };
  }

  if (normalized === "中票利率") {
    const payload = parseMidPaper(rows, profile || {}, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "mid_paper",
      payload,
    };
  }

  if (profile) {
    const payload = parseByProfile(rows, profile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: "profile",
      payload,
    };
  }

  return {
    sheetName,
    normalizedSheetName: normalized,
    outputFile: getOutputFile(normalized),
    kind: "unknown",
    payload: null,
  };
}

/**
 * 批量解析多个工作表并聚合为文件映射。
 *
 * @param {Array<[string, Array<Array<unknown>>]>|Map<string, Array<Array<unknown>>>|Record<string, Array<Array<unknown>>>} sheetEntries 输入的工作表集合。
 * @param {{ anchor?: Date, profiles?: typeof SHEET_PROFILES }} [options] 解析选项。
 * @returns {ConvertSheetsResult}
 */
export function convertSheets(sheetEntries, options = {}) {
  const anchor = options.anchor || new Date();
  const profiles = options.profiles || SHEET_PROFILES;
  const outputs = new Map();
  const details = [];
  const diagnosticsList = [];

  const openMarketState = {
    monetary: null,
    shibor: null,
  };

  const iterator = Array.isArray(sheetEntries)
    ? sheetEntries
    : sheetEntries instanceof Map
    ? Array.from(sheetEntries.entries())
    : Object.entries(sheetEntries || {});

  iterator.forEach(([sheetName, rows]) => {
    const result = parseSheet(rows, sheetName, { anchor, profiles });
    details.push(result);
    if (!result || !result.payload) return;

    const payload = result.payload;
    const normalized = result.normalizedSheetName;
    const pushDiagnostics = (diag) => {
      const cloned = cloneDiagnostics(diag, normalized);
      if (cloned) {
        diagnosticsList.push(cloned);
      }
    };
    if (
      payload &&
      typeof payload === "object" &&
      payload.export_info &&
      payload.export_info.diagnostics &&
      Array.isArray(payload.export_info.diagnostics.items)
    ) {
      pushDiagnostics(payload.export_info.diagnostics);
    } else if (
      payload &&
      typeof payload === "object" &&
      payload.diagnostics &&
      !Array.isArray(payload.diagnostics) &&
      Array.isArray(payload.diagnostics.items)
    ) {
      pushDiagnostics(payload.diagnostics);
    }

    if (result.kind === "open_market_monetary") {
      openMarketState.monetary = result.payload;
      return;
    }
    if (result.kind === "open_market_shibor") {
      openMarketState.shibor = result.payload;
      return;
    }

    const fileName = result.outputFile;
    if (!fileName) return;

    const previous = outputs.get(fileName) || null;
    const merged = mergeDatasets(previous, result.payload);
    outputs.set(fileName, merged);
  });

  if (openMarketState.monetary || openMarketState.shibor) {
    const dataset = buildOpenMarketDataset(
      openMarketState.monetary,
      openMarketState.shibor
    );
    if (dataset) {
      if (
        dataset.export_info &&
        dataset.export_info.diagnostics &&
        Array.isArray(dataset.export_info.diagnostics.items)
      ) {
        const cloned = cloneDiagnostics(
          dataset.export_info.diagnostics,
          dataset.export_info.diagnostics.sheet || "公开市场组合"
        );
        if (cloned) {
          diagnosticsList.push(cloned);
        }
      }
      const prev = outputs.get("open_market.json") || null;
      const merged = mergeDatasets(prev, dataset);
      outputs.set("open_market.json", merged);
    }
  }

  return { files: outputs, details, diagnostics: diagnosticsList };
}

/**
 * 读取 Excel 二进制数据并执行批量解析。
 *
 * @param {ArrayBuffer|ArrayBufferView|Blob} source Excel 数组缓冲区或 Blob 对象。
 * @param {{ anchor?: Date, profiles?: typeof SHEET_PROFILES, XLSX?: any }} [options]
 * @returns {Promise<RunArrayBufferResult>}
 */
export async function runArrayBuffer(source, options = {}) {
  const { anchor = new Date(), profiles = SHEET_PROFILES } = options;
  const XLSXLib = options.XLSX || globalThis?.XLSX;

  if (!XLSXLib || typeof XLSXLib.read !== "function") {
    throw new Error("runArrayBuffer 需要提供 SheetJS XLSX 库");
  }

  let arrayBuffer = source;
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    arrayBuffer = await source.arrayBuffer();
  }

  let uint8;
  if (arrayBuffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(arrayBuffer);
  } else if (ArrayBuffer.isView(arrayBuffer)) {
    uint8 = new Uint8Array(
      arrayBuffer.buffer,
      arrayBuffer.byteOffset,
      arrayBuffer.byteLength
    );
  } else {
    throw new TypeError(
      "runArrayBuffer 接收 ArrayBuffer、ArrayBufferView 或 Blob 类型"
    );
  }

  const workbook = XLSXLib.read(uint8, { type: "array" });
  const rows = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets?.[sheetName];
    if (!worksheet) {
      return [sheetName, []];
    }
    const sheetRows = XLSXLib.utils?.sheet_to_json
      ? XLSXLib.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: true,
          defval: null,
        })
      : [];
    return [sheetName, sheetRows];
  });

  const converted = convertSheets(rows, { anchor, profiles });
  return {
    files: converted.files,
    details: converted.details,
    diagnostics: converted.diagnostics,
    sheetNames: workbook.SheetNames.slice(),
    rows,
    workbook,
  };
}

/**
 * 在指定目标上注册最小化的解析助手，便于快速验证关键表格。
 *
 * @param {Record<string, unknown>|null} [target]
 * @returns {{
 *   __parseCnyFxMinimal(rows: Array<Array<unknown>>, anchor?: Date): { filename: string, json: CnyFxJson|null },
 *   __parseOpenMarketShiborMinimal(
 *     omRows: Array<Array<unknown>>,
 *     shiborRows: Array<Array<unknown>>,
 *     anchor?: Date
 *   ): { filename: string, json: OpenMarketJson|null }|null
 * }}
 */
export function createMinimalParsers(
  target = typeof window !== "undefined" ? window : null
) {
  const minimal = {
    __parseCnyFxMinimal(rows, anchor = new Date()) {
      const parsed = parseSheet(rows, "人民币汇率", { anchor });
      return {
        filename: "cny_fx.json",
        json: parsed.payload,
      };
    },
    __parseOpenMarketShiborMinimal(omRows, shiborRows, anchor = new Date()) {
      const om = parseSheet(omRows, "公开市场货币", { anchor });
      const shibor = parseSheet(shiborRows, "Shibor利率", { anchor });
      const json = buildOpenMarketDataset(om.payload, shibor.payload);
      if (!json) return null;
      return {
        filename: "open_market.json",
        json,
      };
    },
  };

  if (target && typeof target === "object") {
    Object.assign(target, minimal);
  }

  return minimal;
}

/**
 * 将核心解析 API 附着到全局对象，便于调试与工具调用。
 *
 * @param {Record<string, unknown>|null} [target]
 * @returns {Record<string, unknown>|null}
 */
export function registerGlobalCore(
  target = typeof window !== "undefined" ? window : null
) {
  if (!target || typeof target !== "object") {
    return null;
  }

  const core = {
    SHEET_TO_FILE,
    SHEET_PROFILES,
    normalizeSheetName,
    getOutputFile,
    parseSheet,
    convertSheets,
    mergeDatasets,
    buildOpenMarketDataset,
    runArrayBuffer,
  };

  target.xlsx2jsonCore = {
    ...(target.xlsx2jsonCore || {}),
    ...core,
  };

  target.parsers = target.parsers || {};
  Object.keys(SHEET_TO_FILE).forEach((sheetName) => {
    target.parsers[sheetName] = (rows, ctx = {}) => {
      const anchor = ctx.anchor || ctx.now || new Date();
      const result = parseSheet(rows, sheetName, { anchor });
      if (!result || !result.payload) return null;
      if (
        result.kind === "open_market_monetary" ||
        result.kind === "open_market_shibor"
      ) {
        return {
          filename: result.outputFile,
          json: result.payload,
        };
      }
      return {
        filename: result.outputFile,
        json: result.payload,
      };
    };
  });

  createMinimalParsers(target);

  return target.xlsx2jsonCore;
}

if (typeof window !== "undefined") {
  registerGlobalCore(window);
}

export default {
  SHEET_TO_FILE,
  SHEET_PROFILES,
  normalizeSheetName,
  getOutputFile,
  parseSheet,
  convertSheets,
  mergeDatasets,
  buildOpenMarketDataset,
  runArrayBuffer,
  createMinimalParsers,
  registerGlobalCore,
};
