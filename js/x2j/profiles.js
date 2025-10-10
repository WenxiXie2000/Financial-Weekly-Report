/**
 * 解析器专用 profiles：描述每个工作表的结构、匹配规则与输出期望。
 * - 与前端 sheet-profiles.js 区分：此处包含正则、列匹配、范围策略等，仅供转换器使用。
 * - headerRow/dateCol 指定读取表头与日期列，rangeDefault 控制 computePrevWeekWorkdays 等策略。
 * - 正则写法需兼容常见括号/空格变体（例如 “（亿元）”/“(%)”）。
 */
import { toDateSafe, isWeekday, mondayOf, fridayOf, prevCompletedWeekRange } from './utils.js';

export const SHEET_ALIASES = {
  集团上市公司: '国能上市公司',
  公开市场: '公开市场货币',
  公开市场组合: '公开市场货币',
};

export const SHEET_TO_FILE = {
  国内股市: 'equity_cn.json',
  全球股市: 'equity_global.json',
  人民币汇率: 'cny_fx.json',
  公开市场: 'open_market.json',
  公开市场货币: 'open_market.json',
  Shibor利率: 'open_market.json',
  债券利率: 'bond_yield.json',
  集团上市公司: 'group_listed.json',
  国能上市公司: 'group_listed.json',
  中票利率: 'bond_yield.json',
  财经资讯: 'news.json',
};

export function normalizeSheetName(sheetName) {
  const name = String(sheetName ?? '').trim();
  if (!name) return '';
  return SHEET_ALIASES[name] || name;
}

export function getOutputFile(sheetName) {
  const normalized = normalizeSheetName(sheetName);
  return SHEET_TO_FILE[normalized] || null;
}

export { toDateSafe, isWeekday, mondayOf, fridayOf } from './utils.js';

export function fmtISO(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function computeRange(rows, dateIdx, mode, options = {}) {
  if (!Array.isArray(rows) || typeof dateIdx !== 'number') return [];

  const enriched = rows
    .map((row) => ({ row, date: toDateSafe(row?.[dateIdx]) }))
    .filter((item) => item.date);

  if (!mode || mode === 'all') {
    return enriched;
  }

  if (typeof mode === 'string' && mode.startsWith('lastNDays:')) {
    if (!enriched.length) return [];
    const n = Number(mode.split(':')[1] || 7);
    const latest = enriched.reduce((prev, cur) => (cur.date > prev.date ? cur : prev));
    const end = new Date(latest.date.getTime());
    const begin = new Date(end.getTime() - n * 86400000);
    return enriched.filter(
      (item) => item.date >= begin && item.date <= end && isWeekday(item.date)
    );
  }

  if (typeof mode === 'string' && mode.startsWith('since:')) {
    const [, raw] = mode.split(':');
    const since = toDateSafe(raw);
    if (!since) return [];
    return enriched.filter((item) => item.date >= since && isWeekday(item.date));
  }

  const now = options?.now instanceof Date ? options.now : new Date();
  const { mon, fri } = prevCompletedWeekRange(now);
  if (
    mon instanceof Date &&
    !Number.isNaN(mon.getTime()) &&
    fri instanceof Date &&
    !Number.isNaN(fri.getTime())
  ) {
    return enriched.filter((item) => item.date >= mon && item.date <= fri);
  }

  return enriched.filter((item) => isWeekday(item.date));
}

export const SHEET_PROFILES = {
  /**
   * 人民币汇率：表头首行，日期列匹配 /^日期$/，默认使用上一完整周数据。
   * - cols.* 生成带括号容错的正则，兼容 “（%）/()” 及空格变体。
   * - currencies 数组驱动 parser 输出 series/kpis（rate/chg/mid/mid_chg）。
   * - 目标 JSON：{ series: [...], kpis: {usdcny_mid, ...}, diagnostics }。
   */
  人民币汇率: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: 'prevCompletedWeek',
    metrics: {
      rate: { label: '汇率', type: 'number', digits: 4 },
      chg: { label: '涨跌幅(%)', type: 'percent', digits: 4 },
      mid: { label: '央行中间价', type: 'number', digits: 4 },
      mid_chg: { label: '央行中间价调整(%)', type: 'percent', digits: 4 },
    },
    currencies: [
      { key: 'usdcny', keyword: '人民币兑美元' },
      { key: 'cnhusd', keyword: '离岸人民币兑美元', noMid: true },
      { key: 'eurcny', keyword: '人民币兑欧元' },
      { key: 'jpy100cny', keyword: '人民币兑100日元' },
      { key: 'audcny', keyword: '人民币兑澳元' },
    ],
    cols: {
      rate: (keyword) => new RegExp(`^${keyword}汇率(?:（[^）]*）|\\([^)]*\\))?$`),
      chg: (keyword) => new RegExp(`^${keyword}涨跌幅(?:（[^）]*）|\\([^)]*\\))?$`),
      mid: (keyword) => new RegExp(`^${keyword}央行中间价(?:（[^）]*）|\\([^)]*\\))?$`),
      mid_chg: (keyword) =>
        new RegExp(`^${keyword}央行中间价调整(?:情况)?(?:（[^）]*）|\\([^)]*\\))?$`),
    },
  },
  /**
   * 公开市场货币：headerRow=0，日期列 /^日期$/，取 prevCompletedWeek。
   * - items.* 定义操作项（逆回购/MLF 等），cols 正则覆盖“量/利率”。
   * - unit 指定金额/利率单位，parser 将填充 summary/table。
   * - 输出 JSON：{ summary: KPI, series: 利率折线, table: 原始周度 }。
   */
  公开市场货币: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: 'prevCompletedWeek',
    items: [
      {
        key: 'rr7d',
        label: '逆回购7D',
        cols: {
          due: /^逆回购到期量$/,
          inj: /^逆回购7D投放量$/,
          net: /^逆回购7D净投放$/,
          rate: /^逆回购7D利率$/,
        },
      },
      {
        key: 'rr14d',
        label: '逆回购14D',
        cols: {
          inj: /^逆回购14D投放量$/,
          rate: /^逆回购14D利率$/,
        },
      },
      {
        key: 'mlf',
        label: 'MLF',
        cols: {
          due: /^MLF到期量$/,
          inj: /^MLF投放量$/,
          net: /^MLF净投放$/,
          rate: /^MLF利率$/,
        },
      },
      {
        key: 'tcd',
        label: '国库定存',
        cols: {
          due: /^国库定存到期量$/,
          inj: /^国库定存投放量$/,
          net: /^国库定存净投放$/,
          rate: /^国库定存利率$/,
        },
      },
      {
        key: 'slf',
        label: 'SLF',
        cols: {
          due: /^SLF到期量$/,
          inj: /^SLF投放量$/,
          net: /^SLF净投放$/,
          rate: /^SLF利率$/,
        },
      },
      {
        key: 'slo',
        label: 'SLO',
        cols: {
          due: /^SLO到期量$/,
          inj: /^SLO投放量$/,
          net: /^SLO净投放$/,
          rate: /^SLO利率$/,
        },
      },
      {
        key: 'repo',
        label: '正回购',
        cols: {
          due: /^正回购到期量$/,
          inj: /^正回购投放量$/,
          net: /^正回购净投放$/,
          rate: /^正回购利率$/,
        },
      },
    ],
    rowFilter: (row) => !!row?.date,
    unit: {
      amount: '亿',
      rate: '%',
    },
  },
  /**
   * Shibor 利率：多组日期列（隔夜90、3月180、1年365），表头仍在第 0 行。
   * - col_* 使用明细正则锁定各期限利率，解析后并入 open_market 数据集。
   * - 输出 JSON：{ series: [...], summary?, diagnostics }，后续与货币操作合并。
   */
  Shibor利率: {
    headerRow: 0,
    dateCol_on_90: /^SHIBOR隔夜日期(?:[（(]90[）)])?$/,
    dateCol_3m_180: /^SHIBOR3月日期(?:[（(]180[）)])?$/,
    dateCol_1y_365: /^SHIBOR1年日期(?:[（(]365[）)])?$/,
    col_on: /^SHIBOR隔夜利率$/,
    col_1w: /^SHIBOR1周利率$/,
    col_2w: /^SHIBOR2周利率$/,
    col_3m: /^SHIBOR3月利率$/,
    col_6m: /^SHIBOR6月利率$/,
    col_9m: /^SHIBOR9月利率$/,
    col_1y: /^SHIBOR1年利率$/,
  },
  /**
   * 国能上市公司：headerRow=0，/^日期$/，prevCompletedWeek。
   * - metrics.* matcher 通过 `${股票名}指标` 构造，兼容“成交金额变化/成交变化”。
   * - rowFilter 仅保留工作日，unit 提供前端展示提示。
   * - 输出 JSON：{ summary, series, table }，series 以股票+指标命名。
   */
  国能上市公司: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: 'prevCompletedWeek',
    stocks: ['国电电力', '中国神华', '龙源电力', '长源电力', '龙源技术', '英力特'],
    metrics: {
      close: {
        label: '收盘价',
        type: 'number',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}收盘价$`),
      },
      chg: {
        label: '涨跌幅(%)',
        type: 'percent',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}涨跌幅$`),
      },
      amount: {
        label: '成交金额(亿)',
        type: 'number',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}成交金额`),
      },
      amount_chg: {
        label: '成交金额变化(%)',
        type: 'percent',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}成交金额变化$|^${s}成交变化$`),
      },
      mainflow: {
        label: '主力资金流向(亿)',
        type: 'number',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}主力资金流向`),
      },
      pe: {
        label: '市盈率(倍)',
        type: 'number',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}市盈率$`),
      },
      pb: {
        label: '市净率(倍)',
        type: 'number',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}市净率$`),
      },
      dev: {
        label: '每日偏离值',
        type: 'percent',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}每日偏离值$`),
      },
      turn_ratio: {
        label: '换手率比值',
        type: 'percent',
        digits: 4,
        matcher: (s) => new RegExp(`^${s}换手率比值$`),
      },
    },
    rowFilter: (row) => {
      if (!row?.date) return false;
      const d = new Date(String(row.date).replace(/-/g, '/'));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },
    unit: {
      chg: '%',
      amount: '亿',
      amount_chg: '%',
      mainflow: '亿',
      pe: '%',
      pb: '%',
      dev: '%',
      turn_ratio: '%',
    },
  },
  /**
   * 国内股市：headerRow=1（表头有标题行），/^交易日$/，prevCompletedWeek。
   * - indices 定义指数列表，metrics.* matcher 处理“成交金额/变化”等括号差异。
   * - rowFilter 保留工作日，以 summary/series/table 提供指数与市场总量。
   */
  国内股市: {
    headerRow: 1,
    dateCol: /^交易日$/,
    rangeDefault: 'prevCompletedWeek',
    indices: [
      { key: '上证综指', alias: '上证综指' },
      { key: '深圳成指', alias: '深圳成指' },
      { key: '中小板指', alias: '中小板指' },
      { key: '创业板指', alias: '创业板指' },
      { key: '沪深300', alias: '沪深300' },
      { key: '300电力', alias: '300电力' },
    ],
    metrics: {
      close: {
        label: '收盘价',
        type: 'number',
        digits: 4,
        matcher: (idx) => new RegExp(`^${idx}收盘价$`),
      },
      chg: {
        label: '涨跌幅(%)',
        type: 'percent',
        digits: 4,
        matcher: (idx) => new RegExp(`^${idx}涨跌幅$`),
      },
      amount: {
        label: '成交金额(亿)',
        type: 'number',
        digits: 4,
        matcher: (idx) => new RegExp(`^${idx}成交金额`),
      },
      amount_chg: {
        label: '成交金额变化(%)',
        type: 'percent',
        digits: 4,
        matcher: (idx) => new RegExp(`^${idx}成交金额变化$|^${idx}成交变化$`),
      },
      mainflow: {
        label: '主力资金流向(亿)',
        type: 'number',
        digits: 4,
        matcher: (idx) => new RegExp(`^${idx}主力资金流向`),
      },
    },
    marketCols: {
      total_amount: /^两市成交额/,
      total_amount_chg: /^两市成交变化$/,
      north_inflow: /^沪股通资金净流入/,
    },
    rowFilter: (row) => {
      if (!row?.date) return false;
      const d = new Date(String(row.date).replace(/-/g, '/'));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },
    unit: {
      chg: '%',
      amount: '亿',
      amount_chg: '%',
      mainflow: '亿',
    },
  },
  /**
   * 全球股市：headerRow=1，日期列 /^日期$/，prevCompletedWeek。
   * - series.* cols 正则覆盖境外指数，events 捕捉重点事件列。
   * - metricMeta 提供单位描述，供 parser 输出 summary/table/series。
   */
  全球股市: {
    headerRow: 1,
    dateCol: /^日期$/,
    rangeDefault: 'prevCompletedWeek',
    rowFilter: (row) => {
      if (!row?.date) return false;
      const d = new Date(String(row.date).replace(/-/g, '/'));
      return !Number.isNaN(d.getTime()) && d.getDay() >= 1 && d.getDay() <= 5;
    },
    series: [
      {
        label: '道琼斯工业指数',
        cols: {
          close: /道琼斯工业指数收盘价/,
          chgPct: /道琼斯工业指数涨跌幅/,
        },
      },
      {
        label: '纳斯达克指数',
        cols: {
          close: /纳斯达克指数收盘价/,
          chgPct: /纳斯达克指数涨跌幅/,
        },
      },
      {
        label: '标普500',
        cols: {
          close: /标准普尔500指数收盘价/,
          chgPct: /标准普尔500指数涨跌幅/,
        },
      },
      {
        label: '富时100',
        cols: {
          close: /富时100收盘价/,
          chgPct: /富时100涨跌幅/,
        },
      },
      {
        label: '法国CAC40',
        cols: {
          close: /法国CAC40收盘价/,
          chgPct: /法国CAC40涨跌幅/,
        },
      },
      {
        label: '德国DAX',
        cols: {
          close: /德国DAX收盘价/,
          chgPct: /德国DAX涨跌幅/,
        },
      },
      {
        label: '泛欧斯托克600',
        cols: {
          close: /泛欧斯托克600收盘价/,
          chgPct: /泛欧斯托克600涨跌幅/,
        },
      },
      {
        label: '恒生指数',
        cols: {
          close: /恒生指数收盘价/,
          chgPct: /恒生指数涨跌幅/,
        },
      },
    ],
    events: [
      { region: 'US', cols: [/美股重点事件\d+/] },
      { region: 'EU', cols: [/欧股重点事件\d+/] },
      { region: 'HK', cols: [/港股重点事件\d+/] },
    ],
    metricMeta: {
      close: { label: '收盘价', type: 'number', digits: 4 },
      chgPct: { label: '涨跌幅(%)', type: 'percent', digits: 4 },
    },
  },
  /**
   * 债券利率：headerRow=0，/^日期$/，prevCompletedWeek。
   * - bondGroups.* 使用 {R} 占位拼出“公司简称/发行规模”等列，兼容括号后缀。
   * - 输出 JSON：{ top5_latest, table, series }，top5_latest 用于视图 Top5。
   */
  债券利率: {
    headerRow: 0,
    dateCol: /^日期$/,
    range: 'prevCompletedWeek',
    rangeDefault: 'prevCompletedWeek',
    bondGroups: [
      {
        key: 'aaa_3y',
        label: 'AAA公司债3年',
        rankRange: [1, 5],
        cols: {
          issuer: /AAA公司债3年{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /AAA公司债3年{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /AAA公司债3年{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /AAA公司债3年{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
      {
        key: 'aaa_5y',
        label: 'AAA公司债5年',
        rankRange: [1, 5],
        cols: {
          issuer: /AAA公司债5年{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /AAA公司债5年{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /AAA公司债5年{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /AAA公司债5年{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
      {
        key: 'aaa_mt_5y',
        label: 'AAA中票5年',
        rankRange: [1, 5],
        cols: {
          issuer: /AAA中票5年{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /AAA中票5年{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /AAA中票5年{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /AAA中票5年{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
      {
        key: 'aaa_priv_5y',
        label: 'AAA私募债5年',
        rankRange: [1, 5],
        cols: {
          issuer: /AAA私募债5年{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /AAA私募债5年{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /AAA私募债5年{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /AAA私募债5年{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
      {
        key: 'cp_short',
        label: '短融',
        rankRange: [1, 5],
        cols: {
          issuer: /短融{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /短融{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /短融{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /短融{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
      {
        key: 'scp_270d',
        label: '270D超短融',
        rankRange: [1, 5],
        cols: {
          issuer: /270D超短融{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /270D超短融{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /270D超短融{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /270D超短融{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
      {
        key: 'scp_180d',
        label: '180D超短融',
        rankRange: [1, 5],
        cols: {
          issuer: /180D超短融{R}公司简称(?:（[^）]*）|\([^)]*\))?$/,
          size: /180D超短融{R}发行规模(?:（[^）]*）|\([^)]*\))?$/,
          term: /180D超短融{R}发行期限(?:（[^）]*）|\([^)]*\))?$/,
          coupon: /180D超短融{R}票面利率(?:（[^）]*）|\([^)]*\))?$/,
        },
      },
    ],
    rowFilter: (row) => !!row?.date,
    unit: {
      coupon: '%',
      size: '亿',
    },
  },
  /**
   * 中票利率：headerRow=0，/^日期$/，prevCompletedWeek。
   * - series 定义各期限曲线，kpis 填充最新利率，metricMeta 指定单位。
   * - 输出 JSON：{ series, kpis, table }。
   */
  中票利率: {
    headerRow: 0,
    dateCol: /^日期$/,
    range: 'prevCompletedWeek',
    rangeDefault: 'prevCompletedWeek',
    series: [
      { label: 'AAA中短票 1年', cols: { rate: /AAA中短票1年利率$/ } },
      { label: 'AAA中短票 3年', cols: { rate: /AAA中短票3年利率$/ } },
      { label: 'AAA中短票 5年', cols: { rate: /AAA中短票5年利率$/ } },
      { label: 'AAA中短票 7年', cols: { rate: /AAA中短票7年利率$/ } },
      { label: 'AAA中短票 10年', cols: { rate: /AAA中短票10年利率$/ } },
    ],
    kpis: [
      { key: 'mp_1y_rate', col: /AAA中短票1年利率$/, type: 'percent', digits: 4 },
      { key: 'mp_3y_rate', col: /AAA中短票3年利率$/, type: 'percent', digits: 4 },
      { key: 'mp_5y_rate', col: /AAA中短票5年利率$/, type: 'percent', digits: 4 },
      { key: 'mp_7y_rate', col: /AAA中短票7年利率$/, type: 'percent', digits: 4 },
      { key: 'mp_10y_rate', col: /AAA中短票10年利率$/, type: 'percent', digits: 4 },
    ],
    metricMeta: {
      rate: { label: '利率(%)', type: 'percent', digits: 4 },
    },
    rowFilter: (row) => {
      if (!row?.date) return false;
      const d = new Date(String(row.date).replace(/-/g, '/'));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },
    unit: { rate: '%' },
  },
  /**
   * 财经资讯：headerRow=0，日期列 /^日期$/，默认 range lastNDays:30。
   * - rowFilter 过滤非法日期，series 由 parser 动态生成（新闻条目）。
   * - 输出 JSON：{ series: [], table, summary? }，前端依赖 articles/items 字段。
   */
  财经资讯: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: 'lastNDays:30',
    rowFilter: (row) => {
      if (!row?.date) return false;
      const d = new Date(String(row.date).replace(/-/g, '/'));
      return !Number.isNaN(d.getTime());
    },
    series: [],
  },
};

export default SHEET_PROFILES;
