import {
  toDateSafe,
  isWeekday,
  mondayOf,
  fridayOf,
  prevCompletedWeekRange,
} from '../js/x2j/utils.js';

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

export { toDateSafe, isWeekday, mondayOf, fridayOf } from '../js/x2j/utils.js';

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

const SHEET_PROFILES = {
  人民币汇率: {
    headerRow: 1,
    dateCol: /^日期$/,
    rangeDefault: 'prevCompletedWeek',
    metrics: {
      rate: { label: '汇率', type: 'number', digits: 4 },
      chg: { label: '涨跌幅(%)', type: 'percent', digits: 4 },
      mid: { label: '央行中间价', type: 'number', digits: 4 },
      mid_chg: { label: '央行中间价调整(%)', type: 'percent', digits: 4 },
    },
  },
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
  Shibor利率: {
    headerRow: 0,
    groups: [
      {
        key: 'overnight_90d',
        label: 'group_0',
        range: 'lastNDays:90',
        window: 90,
        dateCol: /^(?:SHIBOR)?隔夜日期(?:[（(]\s*90\s*[）)])?$/,
        items: [
          { key: 'shibor_on', label: 'SHIBOR 隔夜(%)', col: /^SHIBOR隔夜利率$/ },
          { key: 'shibor_1w', label: 'SHIBOR 1周(%)', col: /^SHIBOR1周利率$/ },
          { key: 'shibor_2w', label: 'SHIBOR 2周(%)', col: /^SHIBOR2周利率$/ },
        ],
      },
      {
        key: 'quarter_180d',
        label: 'group_1',
        range: 'lastNDays:180',
        window: 180,
        dateCol: /^(?:SHIBOR)?3月日期(?:[（(]\s*180\s*[）)])?$/,
        items: [
          { key: 'shibor_3m', label: 'SHIBOR 3月(%)', col: /^SHIBOR3月利率$/ },
          { key: 'shibor_6m', label: 'SHIBOR 6月(%)', col: /^SHIBOR6月利率$/ },
          { key: 'shibor_9m', label: 'SHIBOR 9月(%)', col: /^SHIBOR9月利率$/ },
        ],
      },
      {
        key: 'oneyear_365d',
        label: 'group_2',
        range: 'lastNDays:365',
        window: 365,
        dateCol: /^(?:SHIBOR)?1年日期(?:[（(]\s*365\s*[）)])?$/,
        items: [
          {
            key: 'shibor_1y',
            label: 'SHIBOR 1年(%)',
            col: /^(?:SHIBOR1年利率|SHIBOR一年利率)$/,
          },
        ],
      },
    ],
    rowFilter: (row) => !!row?.date,
    unit: { rate: '%' },
  },
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
