/**
 * 视图层工作表映射：仅服务 UI 路由与菜单展示。
 * - 与 /js/x2j/profiles.js 的“解析配置”严格区分：此处不含正则/匹配逻辑。
 * - 每项包含 view(路由 ID)、sheet(Excel 表名)、file(JSON 文件名)、label(显示文案)。
 * - app.js 与 sidebar 依赖该映射将 hash -> 渲染函数、loadSheet -> 数据文件串联起来。
 */

export const SHEET_SECTIONS = [
  { view: 'open-market', sheet: '公开市场', file: 'open_market.json', label: '公开市场' },
  { view: 'bond-yield', sheet: '债券利率', file: 'bond_yield.json', label: '债券利率' },
  { view: 'cny-fx', sheet: '人民币汇率', file: 'cny_fx.json', label: '人民币汇率' },
  { view: 'equity-cn', sheet: '国内股市', file: 'equity_cn.json', label: '国内股市' },
  { view: 'equity-global', sheet: '全球股市', file: 'equity_global.json', label: '全球股市' },
  { view: 'group-listed', sheet: '国能上市公司', file: 'group_listed.json', label: '国能上市公司' },
  { view: 'news', sheet: '财经资讯', file: 'news.json', label: '财经资讯' },
];

export const SHEET_BY_VIEW = SHEET_SECTIONS.reduce((acc, item) => {
  acc[item.view] = item;
  return acc;
}, {});

export const SHEET_LABELS = SHEET_SECTIONS.reduce((acc, item) => {
  acc[item.view] = item.label;
  return acc;
}, {});

export default {
  sections: SHEET_SECTIONS,
  byView: SHEET_BY_VIEW,
  labels: SHEET_LABELS,
};
