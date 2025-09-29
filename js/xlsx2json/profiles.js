import {
  toDateSafe,
  isWeekday,
  mondayOf,
  fridayOf,
  prevCompletedWeekRange,
} from "./utils.js";

// === 工具函数区 ===
export { toDateSafe, isWeekday, mondayOf, fridayOf };

export function fmtISO(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function computeRange(rows, dateIdx, mode, options = {}) {
  if (!Array.isArray(rows) || typeof dateIdx !== "number") return [];

  const enriched = rows
    .map((row) => ({ row, date: toDateSafe(row?.[dateIdx]) }))
    .filter((item) => item.date);

  if (!mode || mode === "all") {
    return enriched;
  }

  if (typeof mode === "string" && mode.startsWith("lastNDays:")) {
    if (!enriched.length) return [];
    const n = Number(mode.split(":")[1] || 7);
    const latest = enriched.reduce((prev, cur) =>
      cur.date > prev.date ? cur : prev
    );
    const end = new Date(latest.date.getTime());
    const begin = new Date(end.getTime() - n * 86400000);
    return enriched.filter(
      (item) => item.date >= begin && item.date <= end && isWeekday(item.date)
    );
  }

  if (typeof mode === "string" && mode.startsWith("since:")) {
    const [, raw] = mode.split(":");
    const since = toDateSafe(raw);
    if (!since) return [];
    return enriched.filter(
      (item) => item.date >= since && isWeekday(item.date)
    );
  }

  const now = options?.now instanceof Date ? options.now : new Date();
  const { mon, fri } = prevCompletedWeekRange(now);
  if (
    !(mon instanceof Date) ||
    Number.isNaN(mon.getTime()) ||
    !(fri instanceof Date) ||
    Number.isNaN(fri.getTime())
  ) {
    return [];
  }

  const isPrevWeekOnly = mode === "prevWeekOnly";
  return enriched
    .filter((item) => item.date >= mon && item.date <= fri)
    .filter((item) => (isPrevWeekOnly ? true : isWeekday(item.date)));
}

/**
 * Sheet 配置说明：
 * - headerRow: 表头所在的行（0 基，下标从 0 开始）
 * - dateCol: 匹配日期列的正则表达式（对列标题做测试）
 * - rangeDefault: 默认时间范围策略（如 'prevWeekWorkdays' / 'all' / 'lastNDays:5'）
 * - rowFilter: 行过滤函数，返回 true 的行才会参与解析
 * - series: 需要抽取的指标配置，支持自定义正则匹配
 * - events: 额外事件列的映射配置
 * - unit: 指标的单位说明，便于后续渲染
 */
export const SHEET_PROFILES = {
  人民币汇率: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: "prevWeekWorkdays",
    currencies: [
      { key: "USDCNY", keyword: "人民币兑美元" },
      { key: "CNHUSD", keyword: "离岸人民币兑美元", noMid: true },
      { key: "EURCNY", keyword: "人民币兑欧元" },
      { key: "JPY100CNY", keyword: "人民币兑100日元" },
      { key: "AUDCNY", keyword: "人民币兑澳元" },
    ],
    cols: {
      rate: (kw) => new RegExp(`^${kw}汇率$`),
      chg: (kw) => new RegExp(`^${kw}涨跌幅$`),
      mid: (kw) => new RegExp(`^${kw}央行中间价$`),
      mid_chg: (kw) => new RegExp(`^${kw}央行中间价调整情况$`),
    },
  },
  公开市场货币: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: "prevWeekOnly",
    items: [
      {
        key: "rr7d",
        label: "逆回购7D",
        cols: {
          due: /^逆回购到期量$/,
          inj: /^逆回购7D投放量$/,
          net: /^逆回购7D净投放$/,
          rate: /^逆回购7D利率$/,
        },
      },
      {
        key: "rr14d",
        label: "逆回购14D",
        cols: {
          inj: /^逆回购14D投放量$/,
          rate: /^逆回购14D利率$/,
        },
      },
      {
        key: "mlf",
        label: "MLF",
        cols: {
          due: /^MLF到期量$/,
          inj: /^MLF投放量$/,
          net: /^MLF净投放$/,
          rate: /^MLF利率$/,
        },
      },
      {
        key: "tcd",
        label: "国库定存",
        cols: {
          due: /^国库定存到期量$/,
          inj: /^国库定存投放量$/,
          net: /^国库定存净投放$/,
          rate: /^国库定存利率$/,
        },
      },
      {
        key: "slf",
        label: "SLF",
        cols: {
          due: /^SLF到期量$/,
          inj: /^SLF投放量$/,
          net: /^SLF净投放$/,
          rate: /^SLF利率$/,
        },
      },
      {
        key: "slo",
        label: "SLO",
        cols: {
          due: /^SLO到期量$/,
          inj: /^SLO投放量$/,
          net: /^SLO净投放$/,
          rate: /^SLO利率$/,
        },
      },
      {
        key: "repo",
        label: "正回购",
        cols: {
          due: /^正回购到期量$/,
          inj: /^正回购投放量$/,
          net: /^正回购净投放$/,
          rate: /^正回购利率$/,
        },
      },
    ],
  },
  Shibor利率: {
    headerRow: 0,
    groups: [
      {
        range: "lastNDays:90",
        dateCol: /^SHIBOR隔夜日期（?90）?$/,
        items: [
          {
            key: "shibor_on",
            label: "SHIBOR 隔夜(%)",
            col: /^SHIBOR隔夜利率$/,
          },
          { key: "shibor_1w", label: "SHIBOR 1周(%)", col: /^SHIBOR1周利率$/ },
          { key: "shibor_2w", label: "SHIBOR 2周(%)", col: /^SHIBOR2周利率$/ },
        ],
      },
      {
        range: "lastNDays:180",
        dateCol: /^SHIBOR3月日期（?180）?$/,
        items: [
          { key: "shibor_3m", label: "SHIBOR 3月(%)", col: /^SHIBOR3月利率$/ },
          { key: "shibor_6m", label: "SHIBOR 6月(%)", col: /^SHIBOR6月利率$/ },
          { key: "shibor_9m", label: "SHIBOR 9月(%)", col: /^SHIBOR9月利率$/ },
        ],
      },
      {
        range: "lastNDays:365",
        dateCol: /^SHIBOR1年日期（?365）?$/,
        items: [
          { key: "shibor_1y", label: "SHIBOR 1年(%)", col: /^SHIBOR一年利率$/ },
        ],
      },
    ],
  },
  国能上市公司: {
    headerRow: 0,
    dateCol: /^日期$/,
    rangeDefault: "prevWeekWorkdays",
    stocks: [
      "国电电力",
      "中国神华",
      "龙源电力",
      "长源电力",
      "龙源技术",
      "英力特",
    ],
    cols: {
      close: (s) => new RegExp(`^${s}收盘价$`),
      chg: (s) => new RegExp(`^${s}涨跌幅$`),
      amount: (s) => new RegExp(`^${s}成交金额`),
      amount_chg: (s) => new RegExp(`^${s}成交金额变化$|^${s}成交变化$`),
      mainflow: (s) => new RegExp(`^${s}主力资金流向`),
      pe: (s) => new RegExp(`^${s}市盈率$`),
      pb: (s) => new RegExp(`^${s}市净率$`),
      dev: (s) => new RegExp(`^${s}每日偏离值$`),
      turn_ratio: (s) => new RegExp(`^${s}换手率比值$`),
    },
    rowFilter: (row) => {
      if (!row.date) return false;
      const d = new Date(String(row.date).replace(/-/g, "/"));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },
  },
  国内股市: {
    headerRow: 1,
    dateCol: /^交易日$/,
    rangeDefault: "prevWeekWorkdays",
    indices: [
      { key: "上证综指", alias: "上证综指" },
      { key: "深圳成指", alias: "深圳成指" },
      { key: "中小板指", alias: "中小板指" },
      { key: "创业板指", alias: "创业板指" },
      { key: "沪深300", alias: "沪深300" },
      { key: "300电力", alias: "300电力" },
    ],
    cols: {
      close: (idx) => new RegExp(`^${idx}收盘价$`),
      chg: (idx) => new RegExp(`^${idx}涨跌幅$`),
      amount: (idx) => new RegExp(`^${idx}成交金额`),
      amount_chg: (idx) => new RegExp(`^${idx}成交金额变化$|^${idx}成交变化$`),
      mainflow: (idx) => new RegExp(`^${idx}主力资金流向`),
    },
    marketCols: {
      total_amount: /^两市成交额/,
      total_amount_chg: /^两市成交变化$/,
      north_inflow: /^沪股通资金净流入/,
    },
    rowFilter: (row) => {
      if (!row.date) return false;
      const d = new Date(String(row.date).replace(/-/g, "/"));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },
  },
  全球股市: {
    // 表头在第 2 行（0 基，下标 1）
    headerRow: 1,
    // 日期列匹配
    dateCol: /^日期$/,
    // 时间范围：上一周（周一~周五）
    rangeDefault: "prevWeekWorkdays",
    // 行过滤：日期存在且为工作日
    rowFilter: (row) => {
      if (!row.date) return false;
      const d = new Date(String(row.date).replace(/-/g, "/"));
      return !Number.isNaN(d.getTime()) && d.getDay() >= 1 && d.getDay() <= 5;
    },
    // 需要的系列（收盘价 + 涨跌幅）
    series: [
      {
        label: "道琼斯工业指数",
        close: /道琼斯工业指数收盘价/,
        chgPct: /道琼斯工业指数涨跌幅/,
      },
      {
        label: "纳斯达克指数",
        close: /纳斯达克指数收盘价/,
        chgPct: /纳斯达克指数涨跌幅/,
      },
      {
        label: "标普500",
        close: /标准普尔500指数收盘价/,
        chgPct: /标准普尔500指数涨跌幅/,
      },
      { label: "富时100", close: /富时100收盘价/, chgPct: /富时100涨跌幅/ },
      {
        label: "法国CAC40",
        close: /法国CAC40收盘价/,
        chgPct: /法国CAC40涨跌幅/,
      },
      { label: "德国DAX", close: /德国DAX收盘价/, chgPct: /德国DAX涨跌幅/ },
      {
        label: "泛欧斯托克600",
        close: /泛欧斯托克600收盘价/,
        chgPct: /泛欧斯托克600涨跌幅/,
      },
      { label: "恒生指数", close: /恒生指数收盘价/, chgPct: /恒生指数涨跌幅/ },
    ],
    // 事件列（如后续需要可在此添加）
    events: [
      { region: "US", cols: [/美股重点事件\d+/] },
      { region: "EU", cols: [/欧股重点事件\d+/] },
      { region: "HK", cols: [/港股重点事件\d+/] },
    ],
    // 单位说明：收盘为指数，涨跌幅为百分比（四位小数）
    unit: { close: "index", chgPct: "%" },
  },
  债券利率: {
    headerRow: 0,
    dateCol: /^日期$/,
    // 这是周表：以“上一周工作日”区间聚合；你每周填一行也会命中
    rangeDefault: "prevWeekWorkdays",

    // —— 债券分组（模板 + 名次范围）——
    // {R} 为名次占位符，按 rankRange 自动展开 1..N
    bondGroups: [
      {
        key: "aaa_3y",
        label: "AAA公司债3年",
        rankRange: [1, 5],
        cols: {
          issuer: /AAA公司债3年{R}公司简称$/,
          size: /AAA公司债3年{R}发行规模$/,
          term: /AAA公司债3年{R}发行期限$/,
          coupon: /AAA公司债3年{R}票面利率$/,
        },
      },
      {
        key: "aaa_5y",
        label: "AAA公司债5年",
        rankRange: [1, 5],
        cols: {
          issuer: /AAA公司债5年{R}公司简称$/,
          size: /AAA公司债5年{R}发行规模$/,
          term: /AAA公司债5年{R}发行期限$/,
          coupon: /AAA公司债5年{R}票面利率$/,
        },
      },
      {
        key: "aaa_mt_5y",
        label: "AAA中票5年",
        rankRange: [1, 5],
        cols: {
          issuer: /AAA中票5年{R}公司简称$/,
          size: /AAA中票5年{R}发行规模$/,
          term: /AAA中票5年{R}发行期限$/,
          coupon: /AAA中票5年{R}票面利率$/,
        },
      },
      {
        key: "aaa_priv_5y",
        label: "AAA私募债5年",
        rankRange: [1, 5],
        cols: {
          issuer: /AAA私募债5年{R}公司简称$/,
          size: /AAA私募债5年{R}发行规模$/,
          term: /AAA私募债5年{R}发行期限$/,
          coupon: /AAA私募债5年{R}票面利率$/,
        },
      },
      {
        key: "cp_short",
        label: "短融",
        rankRange: [1, 5],
        cols: {
          issuer: /短融{R}公司简称$/,
          size: /短融{R}发行规模$/,
          term: /短融{R}发行期限$/,
          coupon: /短融{R}票面利率$/,
        },
      },
      {
        key: "scp_270d",
        label: "270D超短融",
        rankRange: [1, 5],
        cols: {
          issuer: /270D超短融{R}公司简称$/,
          size: /270D超短融{R}发行规模$/,
          term: /270D超短融{R}发行期限$/,
          coupon: /270D超短融{R}票面利率$/,
        },
      },
      {
        key: "scp_180d",
        label: "180D超短融",
        rankRange: [1, 5],
        cols: {
          issuer: /180D超短融{R}公司简称$/,
          size: /180D超短融{R}发行规模$/,
          term: /180D超短融{R}发行期限$/,
          coupon: /180D超短融{R}票面利率$/,
        },
      },
    ],

    // 行过滤：只要日期存在即可（周表允许留空）
    rowFilter: (row) => !!row.date,

    // 单位（前端文案）
    unit: {
      coupon: "%",
      size: "亿",
    },
  },
  中票利率: {
    // 表头在第一行
    headerRow: 0,
    // 日期列
    dateCol: /^日期$/,
    // 时间范围：上一周（周一~周五）
    rangeDefault: "prevWeekWorkdays",

    // 利率序列（折线图直接画利率）
    series: [
      { label: "AAA中短票 1年", close: /AAA中短票1年利率$/ },
      { label: "AAA中短票 3年", close: /AAA中短票3年利率$/ },
      { label: "AAA中短票 5年", close: /AAA中短票5年利率$/ },
      { label: "AAA中短票 7年", close: /AAA中短票7年利率$/ },
      { label: "AAA中短票 10年", close: /AAA中短票10年利率$/ },
    ],

    // 额外 KPI：取“区间内最后一日”的最新利率；按百分比四位显示
    kpis: [
      { key: "mp_1y_rate", col: /AAA中短票1年利率$/, type: "pct" },
      { key: "mp_3y_rate", col: /AAA中短票3年利率$/, type: "pct" },
      { key: "mp_5y_rate", col: /AAA中短票5年利率$/, type: "pct" },
      { key: "mp_7y_rate", col: /AAA中短票7年利率$/, type: "pct" },
      { key: "mp_10y_rate", col: /AAA中短票10年利率$/, type: "pct" },
    ],

    // 行过滤：日期存在且为工作日
    rowFilter: (row) => {
      if (!row.date) return false;
      const d = new Date(String(row.date).replace(/-/g, "/"));
      const w = d.getDay();
      return !isNaN(d) && w >= 1 && w <= 5;
    },

    // 单位提示（供前端文案）
    unit: { rate: "%" },
  },
};

export default SHEET_PROFILES;
