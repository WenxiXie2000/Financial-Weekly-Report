/**
 * Sheet 配置说明：
 * - headerRow: 表头所在的行（0 基，下标从 0 开始）
 * - dateCol: 匹配日期列的正则表达式（对列标题做测试）
 * - range: 数据时间范围策略，例如 'prevWeekWorkdays'
 * - rowFilter: 行过滤函数，返回 true 的行才会参与解析
 * - series: 需要抽取的指标配置，支持自定义正则匹配
 * - events: 额外事件列的映射配置
 * - unit: 指标的单位说明，便于后续渲染
 */
export const SHEET_PROFILES = {
  人民币汇率: {
    // 表头在第一行
    headerRow: 0,
    // 日期列
    dateCol: /^日期$/,
    // 时间范围：上一周（周一~周五）
    range: "prevWeekWorkdays",

    // 折线图系列（用“汇率”作图；涨跌幅进 summary 为 % 四位）
    series: [
      {
        label: "人民币兑美元",
        close: /人民币兑美元汇率$/,
        chgPct: /人民币兑美元涨跌幅$/,
      },
      {
        label: "离岸人民币兑美元",
        close: /离岸人民币兑美元汇率$/,
        chgPct: /离岸人民币兑美元涨跌幅$/,
      },
      {
        label: "人民币兑欧元",
        close: /人民币兑欧元汇率$/,
        chgPct: /人民币兑欧元涨跌幅$/,
      },
      {
        label: "人民币兑100日元",
        close: /人民币兑100日元汇率$/,
        chgPct: /人民币兑100日元涨跌幅$/,
      },
      {
        label: "人民币兑澳元",
        close: /人民币兑澳元汇率$/,
        chgPct: /人民币兑澳元涨跌幅$/,
      },
    ],

    // 央行中间价与调整情况 → KPI（取区间内最后一日）
    kpis: [
      // 人民币兑美元
      { key: "usdcny_mid", col: /人民币兑美元央行中间价$/, type: "value" },
      {
        key: "usdcny_mid_chg",
        col: /人民币兑美元央行中间价调整情况$/,
        type: "pct",
      },

      // 人民币兑欧元
      { key: "eurcny_mid", col: /人民币兑欧元央行中间价$/, type: "value" },
      {
        key: "eurcny_mid_chg",
        col: /人民币兑欧元央行中间价调整情况$/,
        type: "pct",
      },

      // 人民币兑100日元
      {
        key: "jpy100cny_mid",
        col: /人民币兑100日元央行中间价$/,
        type: "value",
      },
      {
        key: "jpy100cny_mid_chg",
        col: /人民币兑100日元央行中间价调整情况$/,
        type: "pct",
      },

      // 人民币兑澳元
      { key: "audcny_mid", col: /人民币兑澳元央行中间价$/, type: "value" },
      {
        key: "audcny_mid_chg",
        col: /人民币兑澳元央行中间价调整情况$/,
        type: "pct",
      },
    ],

    // 行过滤：日期存在且为工作日
    rowFilter: (row) => {
      if (!row.date) return false;
      const d = new Date(String(row.date).replace(/-/g, "/"));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },

    // 单位提示（可选，供前端展示）
    unit: {
      close: "CNY per 1 unit",
      chgPct: "%",
      mid: "CNY per 1 unit",
    },
  },
  公开市场货币: {
    // 表头在第一行
    headerRow: 0,
    // 日期列（每周五作为代表日）
    dateCol: /^日期$/,
    // 取上一周（周一~周五）数据；表中主要包含周五
    range: "prevWeekWorkdays",
    // 允许保留空值
    allowNullPoints: true,

    // 折线图：以“利率”为主线
    series: [
      { label: "逆回购7D利率", close: /逆回购7D利率$/ },
      { label: "逆回购14D利率", close: /逆回购14D利率$/ },
      { label: "MLF利率", close: /MLF利率$/ },
      { label: "国库定存利率", close: /国库定存利率$/ },
      { label: "SLF利率", close: /SLF利率$/ },
      { label: "SLO利率", close: /SLO利率$/ },
      { label: "正回购利率", close: /正回购利率$/ },
    ],

    // KPI（区间内“最后一日/最新”的值）；缺值保留为 null
    kpis: [
      {
        key: "rr7d_due",
        col: /逆回购到期量$/,
        type: "value",
        allowBlank: true,
      },
      {
        key: "rr7d_inj",
        col: /逆回购7D投放量$/,
        type: "value",
        allowBlank: true,
      },
      {
        key: "rr7d_net",
        col: /逆回购7D净投放$/,
        type: "value",
        allowBlank: true,
      },

      {
        key: "rr14d_inj",
        col: /逆回购14D投放量$/,
        type: "value",
        allowBlank: true,
      },

      { key: "mlf_due", col: /MLF到期量$/, type: "value", allowBlank: true },
      { key: "mlf_inj", col: /MLF投放量$/, type: "value", allowBlank: true },
      { key: "mlf_net", col: /MLF净投放$/, type: "value", allowBlank: true },

      {
        key: "tmd_due",
        col: /国库定存到期量$/,
        type: "value",
        allowBlank: true,
      },
      {
        key: "tmd_inj",
        col: /国库定存投放量$/,
        type: "value",
        allowBlank: true,
      },
      {
        key: "tmd_net",
        col: /国库定存净投放$/,
        type: "value",
        allowBlank: true,
      },

      { key: "slf_due", col: /SLF到期量$/, type: "value", allowBlank: true },
      { key: "slf_inj", col: /SLF投放量$/, type: "value", allowBlank: true },
      { key: "slf_net", col: /SLF净投放$/, type: "value", allowBlank: true },

      { key: "slo_due", col: /SLO到期量$/, type: "value", allowBlank: true },
      { key: "slo_inj", col: /SLO投放量$/, type: "value", allowBlank: true },
      { key: "slo_net", col: /SLO净投放$/, type: "value", allowBlank: true },

      { key: "pr_due", col: /正回购到期量$/, type: "value", allowBlank: true },
      { key: "pr_inj", col: /正回购投放量$/, type: "value", allowBlank: true },
      { key: "pr_net", col: /正回购净投放$/, type: "value", allowBlank: true },
    ],

    // 行过滤：日期存在即可
    rowFilter: (row) => !!row.date,

    // 单位提示
    unit: {
      rate: "%", // 利率
      amount: "亿", // 到期量、投放量、净投放
    },
  },
  Shibor利率: {
    // 表头在第一行
    headerRow: 0,
    // 多个日期列：按回溯区间划分
    dateCols: {
      on_90: /^SHIBOR隔夜日期（90）$/,
      m3_180: /^SHIBOR3月日期（180）$/,
      y1_365: /^SHIBOR1年日期（365）$/,
    },
    // 展示全量趋势，不限制区间
    range: null,

    // 折线系列：每个系列绑定对应的日期列
    seriesByDateKey: [
      {
        label: "SHIBOR 隔夜",
        dateKey: "on_90",
        close: /SHIBOR隔夜利率$/,
        summaryKey: "shiborovernightrate",
      },
      {
        label: "SHIBOR 1周",
        dateKey: "on_90",
        close: /SHIBOR1周利率$/,
        summaryKey: "shibor1周rate",
      },
      {
        label: "SHIBOR 2周",
        dateKey: "on_90",
        close: /SHIBOR2周利率$/,
        summaryKey: "shibor2周rate",
      },

      {
        label: "SHIBOR 3月",
        dateKey: "m3_180",
        close: /SHIBOR3月利率$/,
        summaryKey: "shibor3月rate",
      },
      {
        label: "SHIBOR 6月",
        dateKey: "m3_180",
        close: /SHIBOR6月利率$/,
        summaryKey: "shibor6月rate",
      },
      {
        label: "SHIBOR 9月",
        dateKey: "m3_180",
        close: /SHIBOR9月利率$/,
        summaryKey: "shibor9月rate",
      },

      {
        label: "SHIBOR 1年",
        dateKey: "y1_365",
        close: /SHIBOR一年利率$/,
        summaryKey: "shibor1年rate",
      },
    ],

    // 行过滤：只要存在对应日期即可
    rowFilter: (row) => !!row.date,

    // 单位：利率（百分比）
    unit: { rate: "%" },
  },
  国能上市公司: {
    // 表头行：第一行 -> 索引 0
    headerRow: 0,
    // 日期列匹配
    dateCol: /^日期$/,
    // 时间范围：上一周（周一~周五）
    range: "prevWeekWorkdays",

    // 折线图系列（用“收盘价”作图；涨跌幅进入 summary，统一四位小数百分号）
    series: [
      { label: "国电电力", close: /国电电力收盘价/, chgPct: /国电电力涨跌幅/ },
      { label: "中国神华", close: /中国神华收盘价/, chgPct: /中国神华涨跌幅/ },
      { label: "龙源电力", close: /龙源电力收盘价/, chgPct: /龙源电力涨跌幅/ },
      { label: "长源电力", close: /长源电力收盘价/, chgPct: /长源电力涨跌幅/ },
      { label: "龙源技术", close: /龙源技术收盘价/, chgPct: /龙源技术涨跌幅/ },
      { label: "英力特", close: /英力特收盘价/, chgPct: /英力特涨跌幅/ },
    ],

    // 额外 KPI（按“区间内最后一日”取值）
    // type: 'pct' -> 按 xx.xxxx% 格式；'value' -> 原值（如金额、净流向）
    kpis: [
      // —— 国电电力 ——
      { key: "gddl_turnover", col: /国电电力成交金额$/, type: "value" },
      { key: "gddl_turnover_chg", col: /国电电力成交金额变化$/, type: "pct" },
      { key: "gddl_mainflow", col: /国电电力主力资金流向$/, type: "value" },
      { key: "gddl_pe", col: /国电电力市盈率$/, type: "value" },
      { key: "gddl_pb", col: /国电电力市净率$/, type: "value" },
      { key: "gddl_bias", col: /国电电力每日偏离值$/, type: "pct" },
      { key: "gddl_tratio", col: /国电电力换手率比值$/, type: "pct" },

      // —— 中国神华 ——
      { key: "zgsh_turnover", col: /中国神华成交金额$/, type: "value" },
      { key: "zgsh_turnover_chg", col: /中国神华成交金额变化$/, type: "pct" },
      { key: "zgsh_mainflow", col: /中国神华主力资金流向$/, type: "value" },
      { key: "zgsh_pe", col: /中国神华市盈率$/, type: "value" },
      { key: "zgsh_pb", col: /中国神华市净率$/, type: "value" },
      { key: "zgsh_bias", col: /中国神华每日偏离值$/, type: "pct" },
      { key: "zgsh_tratio", col: /中国神华换手率比值$/, type: "pct" },

      // —— 龙源电力 ——
      { key: "lydl_turnover", col: /龙源电力成交金额$/, type: "value" },
      { key: "lydl_turnover_chg", col: /龙源电力成交金额变化$/, type: "pct" },
      { key: "lydl_mainflow", col: /龙源电力主力资金流向$/, type: "value" },
      { key: "lydl_pe", col: /龙源电力市盈率$/, type: "value" },
      { key: "lydl_pb", col: /龙源电力市净率$/, type: "value" },
      { key: "lydl_bias", col: /龙源电力每日偏离值$/, type: "pct" },
      { key: "lydl_tratio", col: /龙源电力换手率比值$/, type: "pct" },

      // —— 长源电力 ——
      { key: "cydl_turnover", col: /长源电力成交金额$/, type: "value" },
      { key: "cydl_turnover_chg", col: /长源电力成交金额变化$/, type: "pct" },
      { key: "cydl_mainflow", col: /长源电力主力资金流向$/, type: "value" },
      { key: "cydl_pe", col: /长源电力市盈率$/, type: "value" },
      { key: "cydl_pb", col: /长源电力市净率$/, type: "value" },
      { key: "cydl_bias", col: /长源电力每日偏离值$/, type: "pct" },
      { key: "cydl_tratio", col: /长源电力换手率比值$/, type: "pct" },

      // —— 龙源技术 ——
      { key: "lyjs_turnover", col: /龙源技术成交金额$/, type: "value" },
      { key: "lyjs_turnover_chg", col: /龙源技术成交金额变化$/, type: "pct" },
      { key: "lyjs_mainflow", col: /龙源技术主力资金流向$/, type: "value" },
      { key: "lyjs_pe", col: /龙源技术市盈率$/, type: "value" },
      { key: "lyjs_pb", col: /龙源技术市净率$/, type: "value" },
      { key: "lyjs_bias", col: /龙源技术每日偏离值$/, type: "pct" },
      { key: "lyjs_tratio", col: /龙源技术换手率比值$/, type: "pct" },

      // —— 英力特 ——
      { key: "ylt_turnover", col: /英力特成交金额$/, type: "value" },
      { key: "ylt_turnover_chg", col: /英力特成交金额变化$/, type: "pct" },
      { key: "ylt_mainflow", col: /英力特主力资金流向$/, type: "value" },
      { key: "ylt_pe", col: /英力特市盈率$/, type: "value" },
      { key: "ylt_pb", col: /英力特市净率$/, type: "value" },
      { key: "ylt_bias", col: /英力特每日偏离值$/, type: "pct" },
      { key: "ylt_tratio", col: /英力特换手率比值$/, type: "pct" },
    ],

    // 行过滤：日期存在且为工作日
    rowFilter: (row) => {
      if (!row.date) return false;
      const d = new Date(String(row.date).replace(/-/g, "/"));
      const w = d.getDay();
      return !Number.isNaN(d.getTime()) && w >= 1 && w <= 5;
    },
  },
  国内股市: {
    // 表头在第 2 行（索引 1）
    headerRow: 1,
    // 日期列
    dateCol: /^交易日$/,
    // 区间：上一周（周一~周五）
    range: "prevWeekWorkdays",

    // 折线图系列（用“收盘价”作图，涨跌幅进入 summary）
    series: [
      { label: "上证综指", close: /上证综指收盘价/, chgPct: /上证综指涨跌幅/ },
      { label: "深圳成指", close: /深圳成指收盘价/, chgPct: /深圳成指涨跌幅/ },
      { label: "中小板指", close: /中小板指收盘价/, chgPct: /中小板指涨跌幅/ },
      { label: "创业板指", close: /创业板指收盘价/, chgPct: /创业板指涨跌幅/ },
      { label: "沪深300", close: /沪深300收盘价/, chgPct: /沪深300涨跌幅/ },
      { label: "300电力", close: /300电力收盘价/, chgPct: /300电力涨跌幅/ },
    ],

    // 事件列（如暂时没有可留空）
    events: [],

    // 额外 KPI（summary 中展示；按“最后一日”取值）
    kpis: [
      // —— 上证综指 ——
      { key: "sse_turnover", col: /上证综指成交金额$/, type: "value" },
      { key: "sse_turnover_chg", col: /上证综指成交金额变化$/, type: "pct" },
      { key: "sse_mainflow", col: /上证综指主力资金流向$/, type: "value" },

      // —— 深圳成指 ——
      { key: "szse_turnover", col: /深圳成指成交金额$/, type: "value" },
      { key: "szse_turnover_chg", col: /深圳成指成交金额变化$/, type: "pct" },
      { key: "szse_mainflow", col: /深圳成指主力资金流向$/, type: "value" },

      // —— 中小板指 ——
      { key: "sme_turnover", col: /中小板指成交金额$/, type: "value" },
      { key: "sme_turnover_chg", col: /中小板指成交金额变化$/, type: "pct" },
      { key: "sme_mainflow", col: /中小板指主力资金流向$/, type: "value" },

      // —— 创业板指 ——
      { key: "cyb_turnover", col: /创业板指成交金额$/, type: "value" },
      { key: "cyb_turnover_chg", col: /创业板指成交金额变化$/, type: "pct" },
      { key: "cyb_mainflow", col: /创业板指主力资金流向$/, type: "value" },

      // —— 沪深300 ——
      { key: "hs300_turnover", col: /沪深300成交金额$/, type: "value" },
      { key: "hs300_turnover_chg", col: /沪深300成交金额变化$/, type: "pct" },
      { key: "hs300_mainflow", col: /沪深300主力资金流向$/, type: "value" },

      // —— 300电力 ——
      { key: "csi300power_turnover", col: /300电力成交金额$/, type: "value" },
      {
        key: "csi300power_turnover_chg",
        col: /300电力成交金额变化$/,
        type: "pct",
      },
      {
        key: "csi300power_mainflow",
        col: /300电力主力资金流向$/,
        type: "value",
      },

      // —— 全市场汇总 ——
      { key: "market_turnover", col: /^两市成交额$/, type: "value" },
      { key: "market_turnover_chg", col: /^两市成交变化$/, type: "pct" },
      { key: "northbound_net", col: /^沪股通资金净流入$/, type: "value" },
    ],

    // 单位提示（可用于前端显示）
    unit: {
      close: "index",
      chgPct: "%",
      amount: "亿", // 成交额、主力资金流向
    },

    // 行过滤：日期存在且为工作日
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
    range: "prevWeekWorkdays",
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
    range: "prevWeekWorkdays",

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
    range: "prevWeekWorkdays",

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
