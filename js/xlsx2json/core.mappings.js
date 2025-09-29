export const SHEET_ALIASES = {
  集团上市公司: '国能上市公司',
  公开市场: '公开市场货币',
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
