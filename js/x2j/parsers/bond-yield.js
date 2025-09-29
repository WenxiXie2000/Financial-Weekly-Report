import parseByProfile from './profile-based.js';

const DEFAULT_SHEET_NAME = '债券利率';

export function parseBondYield(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  return parseByProfile(rows, profile, { sheetName, anchor });
}

export default parseBondYield;
