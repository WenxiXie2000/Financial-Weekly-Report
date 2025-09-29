import parseByProfile from './profile-based.js';

const DEFAULT_SHEET_NAME = '中票利率';

export function parseMidPaper(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  return parseByProfile(rows, profile, { sheetName, anchor });
}

export default parseMidPaper;
