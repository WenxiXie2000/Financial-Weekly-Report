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

const expandMatcher = (matcher, rank) => {
  if (matcher == null) return null;
  if (typeof matcher === 'function') {
    return matcher(rank);
  }
  if (matcher instanceof RegExp) {
    return new RegExp(matcher.source.replace(/{R}/g, String(rank)), matcher.flags);
  }
  return new RegExp(String(matcher).replace(/{R}/g, String(rank)));
};

const formatRangeLabel = (mon, fri) => {
  if (mon && fri) {
    return mon === fri ? mon : `${mon}~${fri}`;
  }
  return mon || fri || '';
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

  const groups = Array.isArray(profile?.bondGroups) ? profile.bondGroups : [];

  const groupDefs = groups
    .map((group) => {
      if (!group) return null;
      const [rankStart, rankEnd] =
        Array.isArray(group.rankRange) && group.rankRange.length === 2 ? group.rankRange : [1, 5];

      const ranks = [];
      for (let rank = rankStart; rank <= rankEnd; rank += 1) {
        const cols = {};
        ['issuer', 'size', 'term', 'coupon'].forEach((field) => {
          const matcher = expandMatcher(group?.cols?.[field], rank);
          if (!matcher) {
            cols[field] = -1;
            return;
          }
          const label = `${group?.label || group?.key || '组'} R${rank} ${
            FIELD_LABELS[field] || field
          }`;
          const colIdx = findColIndex(headerIndex, matcher);
          recordHit(label, matcher, colIdx);
          cols[field] = colIdx;
        });

        if (Object.values(cols).every((idx) => idx < 0)) {
          continue;
        }

        ranks.push({ rank, cols });
      }

      if (!ranks.length) return null;

      return {
        key: group.key || group.label,
        label: group.label || group.key || String(group.key ?? '组'),
        ranks,
      };
    })
    .filter(Boolean);

  const latestMap = new Map();

  filtered.forEach(({ row, date }) => {
    const dateIso = ymd(date);
    groupDefs.forEach((group) => {
      const rowsForGroup = [];

      group.ranks.forEach(({ rank, cols }) => {
        const issuerRaw = cols.issuer >= 0 ? row[cols.issuer] : null;
        const sizeRaw = cols.size >= 0 ? row[cols.size] : null;
        const termRaw = cols.term >= 0 ? row[cols.term] : null;
        const couponRaw = cols.coupon >= 0 ? row[cols.coupon] : null;

        const issuer = issuerRaw == null ? null : String(issuerRaw).trim() || null;
        const sizeVal = toNumberOrNull(sizeRaw);
        const term = termRaw == null ? null : String(termRaw).trim() || null;
        const coupon = toPctString4OrNull(couponRaw);

        const hasContent =
          issuer !== null ||
          (sizeVal !== null && Number.isFinite(sizeVal)) ||
          term !== null ||
          (coupon !== null && coupon !== '');

        if (!hasContent) return;

        rowsForGroup.push({
          rank,
          issuer,
          size_yi: Number.isFinite(sizeVal) ? sizeVal : null,
          term,
          coupon_pct: coupon ?? null,
        });
      });

      if (!rowsForGroup.length) return;

      const previous = latestMap.get(group.key);
      if (!previous || previous.date < dateIso) {
        latestMap.set(group.key, { date: dateIso, rows: rowsForGroup.slice() });
      }
    });
  });

  const rangeLabel = formatRangeLabel(window.mon, window.fri);
  const top5Latest = {};

  groups.forEach((group) => {
    const key = group.key || group.label;
    const latest = latestMap.get(key) || { rows: [] };
    const rowsSorted = Array.isArray(latest.rows)
      ? latest.rows.slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      : [];

    top5Latest[key] = {
      date: rangeLabel,
      rows: rowsSorted,
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
