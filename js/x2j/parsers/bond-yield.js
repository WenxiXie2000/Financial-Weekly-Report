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
