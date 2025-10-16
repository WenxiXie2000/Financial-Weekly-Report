/**
 * X2J 核心调度：负责调度各 Sheet 解析器并汇总成 JSON 文件 Map。
 * - runArrayBuffer: 读取 Excel -> rows 映射 -> 调用 convertSheets。
 * - convertSheets: 根据 profile 选择解析器，处理 diagnostics/mergeDatasets。
 * - parseSheet: 针对单表执行解析，返回 {kind, payload, outputFile}。
 * - range 策略说明：profile.rangeDefault 等定义在 profiles.js，由解析器内部采用（如 prevWeekWorkdays）裁剪数据窗口。
 * - diagnostics：解析器通过 diagnostics.items 记录列匹配、缺失列等信息，最终由 convertSheets 聚合到 diagnosticsList。
 */
import { SHEET_PROFILES, SHEET_TO_FILE, normalizeSheetName, getOutputFile } from './profiles.js';
import parseByProfile from './parsers/profile-based.js';
import parseGroupListed from './parsers/group-listed.js';
import parseCnyFx from './parsers/cny-fx.js';
import parseShibor from './parsers/shibor.js';
import { parseOpenMarketMonetary, buildOpenMarketDataset } from './parsers/open-market.js';
import parseBondYield from './parsers/bond-yield.js';
import parseMidPaper from './parsers/mid-paper.js';

const DIRECT_PARSERS = [
  '人民币汇率',
  '公开市场货币',
  'Shibor利率',
  '国能上市公司',
  '债券利率',
  '中票利率',
];

if (typeof console !== 'undefined' && typeof console.debug === 'function') {
  try {
    const profileKeys = Object.keys(SHEET_PROFILES || {});
    console.debug('[convert] bootstrap SHEET_PROFILES keys =', profileKeys);
    console.debug(
      '[convert] bootstrap direct parser handlers =',
      DIRECT_PARSERS,
      'profile-backed=',
      profileKeys.filter((name) => !DIRECT_PARSERS.includes(name))
    );
  } catch (err) {
    console.warn('[convert] bootstrap logging failed', err);
  }
}
import {
  cloneDataset,
  ensureArray,
  cloneDiagnostics,
  mergeSeries,
  readHeaderRowSmart,
} from './utils.js';

function resolveHeaderInfo(ws, profile) {
  const XLSXLib = globalThis?.XLSX;
  if (!ws || !XLSXLib?.utils || typeof XLSXLib.utils.decode_range !== 'function') {
    return { headerRow: null, headers: [], range: null };
  }

  const ref = ws['!ref'];
  if (!ref) return { headerRow: null, headers: [], range: null };

  const rg = XLSXLib.utils.decode_range(ref);
  const smart = readHeaderRowSmart(ws, XLSXLib);

  if (profile && typeof profile.headerRow === 'number') {
    const targetRow = rg.s.r + profile.headerRow;
    const headers = [];
    for (let c = rg.s.c; c <= rg.e.c; c += 1) {
      const cell = ws[XLSXLib.utils.encode_cell({ r: targetRow, c })];
      headers.push(String(cell?.v ?? '').trim());
    }
    const nonEmpty = headers.filter(Boolean).length;
    if (nonEmpty >= 3) {
      return { headerRow: targetRow, headers, range: rg };
    }
  }

  return { headerRow: smart.headerRow ?? null, headers: smart.headers ?? [], range: rg };
}

function getHeaderRowIndex(headerInfo) {
  if (!headerInfo) return null;
  if (Number.isInteger(headerInfo.headerRowIndex)) {
    return headerInfo.headerRowIndex;
  }
  const startRow = headerInfo?.range?.s?.r;
  if (Number.isInteger(headerInfo.headerRow) && Number.isInteger(startRow)) {
    const offset = headerInfo.headerRow - startRow;
    if (Number.isInteger(offset) && offset >= 0) {
      return offset;
    }
  }
  return null;
}

function applyHeaderFallback(profile, rows, headerInfo) {
  if (!profile) return profile;

  const headerIndexHint = getHeaderRowIndex(headerInfo);
  const manualHeaderRow = Number.isInteger(profile.headerRow)
    ? Math.max(0, profile.headerRow)
    : null;

  if (manualHeaderRow == null) {
    if (headerIndexHint != null && headerIndexHint !== manualHeaderRow) {
      return { ...profile, headerRow: headerIndexHint };
    }
    return profile;
  }

  const manualRowValues = Array.isArray(rows?.[manualHeaderRow]) ? rows[manualHeaderRow] : null;
  let nonEmpty = 0;
  if (manualRowValues) {
    for (const cell of manualRowValues) {
      if (String(cell ?? '').trim()) {
        nonEmpty += 1;
      }
    }
  }

  if (nonEmpty >= 3) {
    return profile;
  }

  if (headerIndexHint != null && headerIndexHint !== manualHeaderRow) {
    return { ...profile, headerRow: headerIndexHint };
  }

  return profile;
}

export { SHEET_PROFILES, SHEET_TO_FILE, normalizeSheetName, getOutputFile } from './profiles.js';

/**
 * 合并两个数据集对象，保留元数据与时间序列并去重来源。
 * @param {object|null|undefined} target - 已有数据集，会在原地合并。
 * @param {object|null|undefined} incoming - 新增数据集。
 * @returns {object|null|undefined} 合并后的数据集引用。
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

  merged.series = mergeSeries(ensureArray(merged.series), ensureArray(addition.series));

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
    merged.table = ensureArray(merged.table).concat(ensureArray(addition.table));
  }

  if (addition.top5_latest) {
    const existingTop5 =
      merged.top5_latest && typeof merged.top5_latest === 'object' ? { ...merged.top5_latest } : {};
    const incomingTop5 =
      addition.top5_latest && typeof addition.top5_latest === 'object' ? addition.top5_latest : {};
    merged.top5_latest = {
      ...existingTop5,
      ...cloneDataset(incomingTop5),
    };
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
      const formatted = value.includes('T') ? value : value.replace(' ', 'T');
      const parsed = new Date(formatted);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const prevTime = normalizeTime(merged.export_info.last_updated);
    const nextTime = normalizeTime(nextInfo.last_updated);
    if (!prevTime || (nextTime && nextTime > prevTime)) {
      merged.export_info.last_updated = nextInfo.last_updated;
    }

    if (typeof nextInfo.rows === 'number') {
      const prevRows = typeof merged.export_info.rows === 'number' ? merged.export_info.rows : 0;
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
 * 解析单个工作表，选择匹配的解析器并返回结果。
 * @param {Array[]} rows - sheet_to_json(header:1) 生成的二维数组。
 * @param {string} sheetName - 原始工作表名称。
 * @param {{anchor?: Date, profiles?: Record<string, object>, headerInfo?: object}} [options]
 * @returns {{sheetName: string, normalizedSheetName: string, outputFile: string|null, kind: string, payload: object|null}}
 */
export function parseSheet(
  rows,
  sheetName,
  { anchor = new Date(), profiles = SHEET_PROFILES, headerInfo = null } = {}
) {
  const normalized = normalizeSheetName(sheetName);
  const profile = profiles?.[normalized];
  const effectiveProfile = applyHeaderFallback(profile, rows, headerInfo);
  const activeProfile = effectiveProfile || profile || {};
  const context = { anchor, sheetName: normalized };

  if (normalized === '公开市场组合') {
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: null,
      kind: 'ignored',
      payload: null,
    };
  }

  if (normalized === '人民币汇率') {
    const payload = parseCnyFx(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'cny_fx',
      payload,
    };
  }

  if (normalized === '国能上市公司') {
    const payload = parseGroupListed(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'group_listed',
      payload,
    };
  }

  if (normalized === '公开市场货币') {
    const payload = parseOpenMarketMonetary(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'open_market_monetary',
      payload,
    };
  }

  if (normalized === 'Shibor利率') {
    const payload = parseShibor(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'open_market_shibor',
      payload,
    };
  }

  if (normalized === '债券利率') {
    const payload = parseBondYield(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'bond_yield',
      payload,
    };
  }

  if (normalized === '中票利率') {
    const payload = parseMidPaper(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'mid_paper',
      payload,
    };
  }

  if (profile) {
    const payload = parseByProfile(rows, activeProfile, context);
    return {
      sheetName,
      normalizedSheetName: normalized,
      outputFile: getOutputFile(normalized),
      kind: 'profile',
      payload,
    };
  }

  return {
    sheetName,
    normalizedSheetName: normalized,
    outputFile: getOutputFile(normalized),
    kind: 'unknown',
    payload: null,
  };
}

/**
 * 批量解析多张工作表，并生成文件名 -> Dataset 的 Map。
 * @param {Array|Map|Object} sheetEntries - 形如 [[name, rows]] 的数组、Map 或对象。
 * @param {{anchor?: Date, profiles?: Record<string, object>, headerInfos?: Map}} [options]
 * @returns {{files: Map<string, object>, details: Array, diagnostics: Array}}
 */
export function convertSheets(sheetEntries, options = {}) {
  const anchor = options.anchor || new Date();
  const profiles = options.profiles || SHEET_PROFILES;
  const headerInfos = options.headerInfos || null;
  const outputs = new Map();
  const details = [];
  const diagnosticsList = [];

  const openMarketState = {
    monetary: null,
    shibor: null,
  };

  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    try {
      const profileKeys = Object.keys(profiles || {});
      console.debug('[convert] convertSheets profile keys =', profileKeys);
      console.debug(
        '[convert] convertSheets direct parser keys =',
        DIRECT_PARSERS,
        'total=',
        DIRECT_PARSERS.length
      );
    } catch (err) {
      console.warn('[convert] logging convertSheets profiles failed', err);
    }
  }

  const iterator = Array.isArray(sheetEntries)
    ? sheetEntries
    : sheetEntries instanceof Map
    ? Array.from(sheetEntries.entries())
    : Object.entries(sheetEntries || {});

  iterator.forEach(([sheetName, rows]) => {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      try {
        const normalized = normalizeSheetName(sheetName);
        console.debug(
          '[convert] visiting sheet =',
          sheetName,
          'normalized=',
          normalized,
          'has profile?',
          !!profiles?.[normalized]
        );
      } catch (err) {
        console.warn('[convert] visiting sheet log failed', err);
      }
    }
    const headerInfo =
      headerInfos instanceof Map
        ? headerInfos.get(sheetName) || null
        : headerInfos && typeof headerInfos === 'object'
        ? headerInfos[sheetName] || null
        : null;
    const result = parseSheet(rows, sheetName, { anchor, profiles, headerInfo });
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
      typeof payload === 'object' &&
      payload.export_info &&
      payload.export_info.diagnostics &&
      Array.isArray(payload.export_info.diagnostics.items)
    ) {
      pushDiagnostics(payload.export_info.diagnostics);
    } else if (
      payload &&
      typeof payload === 'object' &&
      payload.diagnostics &&
      !Array.isArray(payload.diagnostics) &&
      Array.isArray(payload.diagnostics.items)
    ) {
      pushDiagnostics(payload.diagnostics);
    }

    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      try {
        console.debug(
          '[convert] parsed sheet stats',
          sheetName,
          'series=',
          Array.isArray(payload?.series) ? payload.series.length : 0,
          'tableRows=',
          Array.isArray(payload?.table) ? payload.table.length : 0
        );
      } catch (err) {
        console.warn('[convert] parsed sheet stats log failed', err);
      }
    }

    if (result.kind === 'open_market_monetary') {
      openMarketState.monetary = result.payload;
      return;
    }
    if (result.kind === 'open_market_shibor') {
      openMarketState.shibor = result.payload;
      return;
    }

    const fileName = result.outputFile;
    if (!fileName) return;

    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('[convert] will write?', !!payload, 'file=', fileName);
    }

    const previous = outputs.get(fileName) || null;
    const merged = mergeDatasets(previous, result.payload);
    outputs.set(fileName, merged);
  });

  if (openMarketState.monetary || openMarketState.shibor) {
    const dataset = buildOpenMarketDataset(openMarketState.monetary, openMarketState.shibor);
    if (dataset) {
      if (
        dataset.export_info &&
        dataset.export_info.diagnostics &&
        Array.isArray(dataset.export_info.diagnostics.items)
      ) {
        const cloned = cloneDiagnostics(
          dataset.export_info.diagnostics,
          dataset.export_info.diagnostics.sheet || '公开市场组合'
        );
        if (cloned) {
          diagnosticsList.push(cloned);
        }
      }
      const prev = outputs.get('open_market.json') || null;
      const merged = mergeDatasets(prev, dataset);
      outputs.set('open_market.json', merged);
    }
  }

  return { files: outputs, details, diagnostics: diagnosticsList };
}

/**
 * 入口函数：接收 Excel 二进制数据，输出转换结果。
 * @param {ArrayBuffer|ArrayBufferView|Blob} source - Excel 文件数据。
 * @param {{anchor?: Date, profiles?: Record<string, object>, XLSX?: typeof import('xlsx')}} [options]
 * @returns {Promise<{files: Map<string, object>, details: Array, diagnostics: Array, sheetNames: string[], rows: Array, workbook: object}>}
 */
export async function runArrayBuffer(source, options = {}) {
  const { anchor = new Date(), profiles = SHEET_PROFILES } = options;
  const XLSXLib = options.XLSX || globalThis?.XLSX;

  if (!XLSXLib || typeof XLSXLib.read !== 'function') {
    throw new Error('runArrayBuffer 需要提供 SheetJS XLSX 库');
  }

  let arrayBuffer = source;
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    arrayBuffer = await source.arrayBuffer();
  }

  let uint8;
  if (arrayBuffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(arrayBuffer);
  } else if (ArrayBuffer.isView(arrayBuffer)) {
    uint8 = new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
  } else {
    throw new TypeError('runArrayBuffer 接收 ArrayBuffer、ArrayBufferView 或 Blob 类型');
  }

  const workbook = XLSXLib.read(uint8, { type: 'array' });
  const headerInfos = new Map();
  const rows = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets?.[sheetName];
    if (!worksheet) {
      headerInfos.set(sheetName, null);
      return [sheetName, []];
    }
    const normalizedSheetName = normalizeSheetName(sheetName);
    const profile = profiles?.[normalizedSheetName];
    const headerMeta = resolveHeaderInfo(worksheet, profile);
    const headerRowIndex = getHeaderRowIndex(headerMeta);
    headerInfos.set(sheetName, {
      ...headerMeta,
      headerRowIndex,
    });
    const sheetRows = XLSXLib.utils?.sheet_to_json
      ? XLSXLib.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: true,
          defval: null,
        })
      : [];
    return [sheetName, sheetRows];
  });

  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    try {
      console.debug('[convert] runArrayBuffer profile keys =', Object.keys(profiles || {}));
      console.debug('[convert] runArrayBuffer sheetNames =', workbook.SheetNames);
    } catch (err) {
      console.warn('[convert] runArrayBuffer pre-convert log failed', err);
    }
  }

  const converted = convertSheets(rows, { anchor, profiles, headerInfos });

  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    try {
      const fileSize = converted?.files instanceof Map ? converted.files.size : undefined;
      const diagLen = Array.isArray(converted?.diagnostics)
        ? converted.diagnostics.length
        : undefined;
      console.debug('[convert] convertSheets returned files=', fileSize, 'diags=', diagLen);
    } catch (err) {
      console.warn('[convert] runArrayBuffer post-convert log failed', err);
    }
  }
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
 * 向目标对象挂载最小化解析函数集合。
 * @param {object|null} [target=window] - 挂载目标，缺省为浏览器 window。
 * @returns {{__parseCnyFxMinimal: Function, __parseOpenMarketShiborMinimal: Function}} 便捷解析器。
 */
export function createMinimalParsers(target = typeof window !== 'undefined' ? window : null) {
  const minimal = {
    __parseCnyFxMinimal(rows, anchor = new Date()) {
      const parsed = parseSheet(rows, '人民币汇率', { anchor });
      return {
        filename: 'cny_fx.json',
        json: parsed.payload,
      };
    },
    __parseOpenMarketShiborMinimal(omRows, shiborRows, anchor = new Date()) {
      const om = parseSheet(omRows, '公开市场货币', { anchor });
      const shibor = parseSheet(shiborRows, 'Shibor利率', { anchor });
      const json = buildOpenMarketDataset(om.payload, shibor.payload);
      if (!json) return null;
      return {
        filename: 'open_market.json',
        json,
      };
    },
  };

  if (target && typeof target === 'object') {
    Object.assign(target, minimal);
  }

  return minimal;
}

/**
 * 在全局对象上注册 x2jCore 调试接口。
 * @param {object|null} [target=window] - 挂载目标，默认为浏览器 window。
 * @returns {object|null} 暴露的核心接口对象。
 */
export function registerGlobalCore(target = typeof window !== 'undefined' ? window : null) {
  if (!target || typeof target !== 'object') {
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

  target.x2jCore = {
    ...(target.x2jCore || {}),
    ...core,
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
      if (result.kind === 'open_market_monetary' || result.kind === 'open_market_shibor') {
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

  return target.x2jCore;
}

if (typeof window !== 'undefined') {
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
