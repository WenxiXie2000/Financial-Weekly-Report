import parseByProfile from "./profile-based.js";

/**
 * @typedef {import("../types.js").ProfileJson} ProfileJson
 */

const DEFAULT_SHEET_NAME = "中票利率";

/**
 * 解析中票利率工作表，复用通用的 profile-based 解析器。
 *
 * @param {Array<Array<unknown>>} rows SheetJS 提供的二维数组。
 * @param {object} profile 解析配置。
 * @param {{ sheetName?: string, anchor?: Date }} [context] 解析上下文。
 * @returns {ProfileJson}
 */
export function parseMidPaper(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  return /** @type {ProfileJson} */ (
    parseByProfile(rows, profile, { sheetName, anchor })
  );
}

export default parseMidPaper;
