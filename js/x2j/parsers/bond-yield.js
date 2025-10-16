/**
 * 债券利率解析器：将“债券利率”工作表转换为 Top5 JSON。
 * 输入：rows（二位数组）、profile（profiles.js 定义）、anchor。
 * 输出契约：{
 *   "top5_latest": {"aaa_3y": {date: "25-09-22～25-09-26", rows: [...] }},
 *   "series": [],
 *   "export_info": {...}
 * }
 * - 依赖 profile.bondGroups 中的 {R} 占位符，为各名次生成列正则。
 */
import {
  buildHeaderIndex,
  normalizeHeaderCell,
  findColIndex,
  closestHeaderCandidates,
  toDateSafe,
  prevCompletedWeekRange,
  toNumberOrNull,
  toPctString4OrNull,
  ymd,
} from '../utils.js';

const DEFAULT_SHEET_NAME = '债券利率';

const isNonEmptyRow = (row) =>
  Array.isArray(row) &&
  row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');

// {R} 占位符在 profiles 中表示名次，解析时替换为具体数字
const expandRankRe = (re, rank) => {
  if (!(re instanceof RegExp)) return null;
  const src = re.source.replace(/{R}/g, String(rank));
  return new RegExp(src, re.flags || '');
};

const FIELD_LABELS = {
  issuer: '公司简称',
  size: '发行规模',
  term: '发行期限',
  coupon: '票面利率',
};

/**
 * 解析“债券利率”工作表为 Top5 展示所需结构。
 * @param {Array[]} rows - SheetJS sheet_to_json(header:1) 的二维数组。
 * @param {object} [profile={}] - profiles.js 中的解析配置。
 * @param {{sheetName?: string, anchor?: Date}} [options]
 * @returns {{top5_latest: object, series: any[], export_info: object}}
 */
export default function parseBondYield(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow) ? Math.max(0, profile.headerRow) : 0;
  const headerRow = Array.isArray(rows?.[headerRowIndex])
    ? rows[headerRowIndex].map(normalizeHeaderCell)
    : [];
  const headerIndex = buildHeaderIndex(headerRow);
  const bodyRows = Array.isArray(rows)
    ? rows.slice(headerRowIndex + 1).filter((row) => isNonEmptyRow(row))
    : [];

  const { mon, fri } = prevCompletedWeekRange(anchor);
  const window = { mon: ymd(mon), fri: ymd(fri) };

  const diagnostics = {
    sheet: sheetName,
    window,
    rows: { scanned: bodyRows.length, kept: 0 },
    columns: [],
  };

  const recordHit = (label, matcher, colIdx) => {
    diagnostics.columns.push({
      label,
      matcher: matcher instanceof RegExp ? matcher.toString() : String(matcher ?? ''),
      column: colIdx >= 0 ? headerRow[colIdx] ?? null : null,
      index: colIdx >= 0 ? colIdx : null,
      closest: colIdx >= 0 ? [] : closestHeaderCandidates(headerRow, matcher),
    });
  };

  const dateMatcher = profile?.dateCol || /^日期$/;
  const dateIdx = findColIndex(headerIndex, dateMatcher);
  recordHit('日期列', dateMatcher, dateIdx);
  const dateColName = dateIdx >= 0 ? headerRow[dateIdx] ?? null : null;

  const filtered = bodyRows
    .map((row) => {
      const raw = dateIdx >= 0 ? row[dateIdx] : null;
      const dateValue = toDateSafe(raw);
      if (!dateValue) return null;
      if (mon && dateValue < mon) return null;
      if (fri && dateValue > fri) return null;
      const iso = ymd(dateValue);
      if (typeof profile.rowFilter === 'function' && !profile.rowFilter({ date: iso })) {
        return null;
      }
      return { row, dateObj: dateValue, date: iso };
    })
    .filter(Boolean)
    .sort((a, b) => a.dateObj - b.dateObj);

  diagnostics.rows.kept = filtered.length;

  if (dateIdx < 0 || !filtered.length) {
    return {
      top5_latest: {},
      series: [],
      export_info: {
        source_sheet: '债券利率 + 中票利率',
        range: 'prevCompletedWeek',
        range_window: [window.mon, window.fri],
        rows: filtered.length,
        diagnostics: {
          columns: diagnostics.columns,
          stats: [
            {
              rows_total: bodyRows.length,
              rows_kept: filtered.length,
              range_start: window.mon,
              range_end: window.fri,
              date_column: dateColName,
            },
          ],
        },
      },
    };
  }

  const repEntry = filtered.at(-1) || null;
  const repRow = repEntry?.row || null;

  const groups = Array.isArray(profile?.bondGroups) ? profile.bondGroups : [];
  const top5Latest = {};

  groups.forEach((group) => {
    if (!group) return;
    const key = group.key || group.label;
    const [rankStart, rankEnd] =
      Array.isArray(group.rankRange) && group.rankRange.length === 2 ? group.rankRange : [1, 5];

    const rowsOut = [];
    for (let rank = rankStart; rank <= rankEnd; rank += 1) {
      const indices = {};
      ['issuer', 'size', 'term', 'coupon'].forEach((field) => {
        const matcher = expandRankRe(group?.cols?.[field], rank);
        const label = `${key}[${rank}] ${FIELD_LABELS[field] || field}`;
        const colIdx = matcher ? findColIndex(headerIndex, matcher) : -1;
        recordHit(label, matcher, colIdx);
        indices[field] = colIdx;
      });

      const issuerRaw = repRow && indices.issuer >= 0 ? repRow[indices.issuer] : null;
      const sizeRaw = repRow && indices.size >= 0 ? repRow[indices.size] : null;
      const termRaw = repRow && indices.term >= 0 ? repRow[indices.term] : null;
      const couponRaw = repRow && indices.coupon >= 0 ? repRow[indices.coupon] : null;

      const issuer = issuerRaw == null ? null : String(issuerRaw).trim() || null;
      const sizeVal = toNumberOrNull(sizeRaw);
      const term = termRaw == null ? null : String(termRaw).trim() || null;
      const coupon = toPctString4OrNull(couponRaw);

      rowsOut.push({
        rank,
        issuer,
        size_yi: Number.isFinite(sizeVal) ? sizeVal : null,
        term,
        coupon_pct: coupon ?? null,
      });
    }

    const monLabel = window.mon ? String(window.mon).slice(2) : null;
    const friLabel = window.fri ? String(window.fri).slice(2) : null;
    const displayRange = repRow && monLabel && friLabel ? `${monLabel}～${friLabel}` : null;

    top5Latest[key] = {
      date: displayRange,
      rows: rowsOut,
    };
  });

  const export_info = {
    source_sheet: '债券利率 + 中票利率',
    range: 'prevCompletedWeek',
    range_window: [window.mon, window.fri],
    rows: filtered.length,
    diagnostics: {
      columns: diagnostics.columns,
      stats: [
        {
          rows_total: bodyRows.length,
          rows_kept: filtered.length,
          range_start: window.mon,
          range_end: window.fri,
          date_column: dateColName,
        },
      ],
    },
  };

  return {
    top5_latest: top5Latest,
    series: [],
    export_info,
  };
}
