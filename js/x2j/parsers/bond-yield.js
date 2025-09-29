import {
  findColIndex,
  toDateSafe,
  prevCompletedWeekRange,
  toNumberOrNull,
  toPctString4OrNull,
} from '../utils.js';
import { formatDate, describeMatcher, closestHeaders } from './common.js';

const DEFAULT_SHEET_NAME = '债券利率';
const DEFAULT_HEADER_ROW = 0;

const GROUP_DEFS = [
  { key: 'aaa_3y', label: 'AAA公司债3年' },
  { key: 'aaa_5y', label: 'AAA公司债5年' },
  { key: 'aaa_mt_5y', label: 'AAA中票5年' },
  { key: 'aaa_priv_5y', label: 'AAA私募债5年' },
  { key: 'cp_short', label: '短融' },
  { key: 'scp_270d', label: '270D超短融' },
  { key: 'scp_180d', label: '180D超短融' },
];

const FIELD_PATTERNS = {
  issuer: '公司简称',
  size: '发行规模',
  term: '发行期限',
  coupon: '票面利率',
};

const buildMatcher = (base, field, rank) => {
  const core = `${base}${rank}${field}`;
  return new RegExp(`^${core}(?:（[^）]*）)?$`);
};

const trackColumnInfo = (header, diagnostics, matcher, label) => {
  const idx = findColIndex(header, matcher);
  const column = idx >= 0 ? header[idx] ?? null : null;
  diagnostics.columns.push({
    label,
    matcher: describeMatcher(matcher),
    column,
    index: idx >= 0 ? idx : null,
    closest: idx >= 0 ? [] : closestHeaders(header, matcher),
  });
  return idx;
};

const normalizeHeader = (value) => (value == null ? '' : String(value).trim());

const formatRangeLabel = (start, end) => (start && end ? `${start}~${end}` : start || end || '');

export function parseBondYield(
  rows,
  profile = {},
  { sheetName = DEFAULT_SHEET_NAME, anchor = new Date() } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow)
    ? Math.max(0, profile.headerRow)
    : DEFAULT_HEADER_ROW;
  const header = Array.isArray(rows?.[headerRowIndex])
    ? rows[headerRowIndex].map(normalizeHeader)
    : [];
  const bodyRows = Array.isArray(rows)
    ? rows
        .slice(headerRowIndex + 1)
        .filter(
          (row) =>
            Array.isArray(row) &&
            row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
        )
    : [];

  const diagnostics = {
    sheet: sheetName,
    range: null,
    rows: { total: bodyRows.length, kept: 0 },
    date_column: null,
    columns: [],
  };

  const dateMatcher = profile?.dateCol || /^日期$/;
  const dateIdx = trackColumnInfo(header, diagnostics, dateMatcher, '日期');
  diagnostics.date_column = dateIdx >= 0 ? header[dateIdx] || null : null;

  const { mon, fri } = prevCompletedWeekRange(anchor);
  const rangeStart = mon ? formatDate(mon) : '';
  const rangeEnd = fri ? formatDate(fri) : '';
  diagnostics.range = { start: rangeStart, end: rangeEnd };

  const filtered = bodyRows
    .map((row) => {
      const raw = dateIdx >= 0 ? row[dateIdx] : null;
      const date = toDateSafe(raw);
      return { row, date };
    })
    .filter((item) => item.date && item.date >= mon && item.date <= fri)
    .sort((a, b) => a.date - b.date);

  diagnostics.rows.kept = filtered.length;

  if (!filtered.length || dateIdx < 0) {
    return {
      top5_latest: {},
      series: [],
      export_info: {
        source_sheet: '债券利率 + 中票利率',
        range: 'prevCompletedWeek',
        range_window: [rangeStart, rangeEnd],
        rows: filtered.length,
        diagnostics: {
          columns: diagnostics.columns,
          stats: [
            {
              rows_total: bodyRows.length,
              rows_kept: filtered.length,
              range_start: rangeStart,
              range_end: rangeEnd,
              date_column: diagnostics.date_column,
            },
          ],
        },
      },
    };
  }

  const groupColumnDefs = GROUP_DEFS.map((group) => {
    const ranks = [];
    for (let rank = 1; rank <= 5; rank += 1) {
      const issuerIdx = trackColumnInfo(
        header,
        diagnostics,
        buildMatcher(group.label, FIELD_PATTERNS.issuer, rank),
        `${group.label} R${rank} 公司简称`
      );
      const sizeIdx = trackColumnInfo(
        header,
        diagnostics,
        buildMatcher(group.label, FIELD_PATTERNS.size, rank),
        `${group.label} R${rank} 发行规模`
      );
      const termIdx = trackColumnInfo(
        header,
        diagnostics,
        buildMatcher(group.label, FIELD_PATTERNS.term, rank),
        `${group.label} R${rank} 发行期限`
      );
      const couponIdx = trackColumnInfo(
        header,
        diagnostics,
        buildMatcher(group.label, FIELD_PATTERNS.coupon, rank),
        `${group.label} R${rank} 票面利率`
      );

      ranks.push({ rank, issuerIdx, sizeIdx, termIdx, couponIdx });
    }
    return { ...group, ranks };
  });

  const groupDateMap = new Map();

  filtered.forEach(({ row, date }) => {
    const iso = formatDate(date);
    groupColumnDefs.forEach((group) => {
      const records = [];
      group.ranks.forEach((rankDef) => {
        const issuerRaw = rankDef.issuerIdx >= 0 ? row[rankDef.issuerIdx] : null;
        const sizeRaw = rankDef.sizeIdx >= 0 ? row[rankDef.sizeIdx] : null;
        const termRaw = rankDef.termIdx >= 0 ? row[rankDef.termIdx] : null;
        const couponRaw = rankDef.couponIdx >= 0 ? row[rankDef.couponIdx] : null;

        const issuer = issuerRaw == null ? null : String(issuerRaw).trim() || null;
        const sizeValue = toNumberOrNull(sizeRaw);
        const term = termRaw == null ? null : String(termRaw).trim() || null;
        const coupon = toPctString4OrNull(couponRaw);

        if (
          issuer === null &&
          (sizeValue === null || Number.isNaN(sizeValue)) &&
          term === null &&
          (coupon === null || coupon === '')
        ) {
          return;
        }

        records.push({
          rank: rankDef.rank,
          issuer,
          size_yi: Number.isFinite(sizeValue) ? sizeValue : null,
          term,
          coupon_pct: coupon ?? null,
        });
      });

      if (!records.length) return;
      if (!groupDateMap.has(group.key)) {
        groupDateMap.set(group.key, new Map());
      }
      const dateMap = groupDateMap.get(group.key);
      dateMap.set(iso, records);
    });
  });

  const rangeLabel = formatRangeLabel(rangeStart, rangeEnd);
  const top5Latest = {};

  GROUP_DEFS.forEach((group) => {
    const dateMap = groupDateMap.get(group.key) || new Map();
    const dates = Array.from(dateMap.keys()).sort((a, b) => (a < b ? -1 : 1));
    const latestDate = dates.length ? dates[dates.length - 1] : null;
    const rowsForLatest = latestDate ? dateMap.get(latestDate) || [] : [];
    top5Latest[group.key] = {
      date: rangeLabel,
      rows: rowsForLatest.slice().sort((a, b) => a.rank - b.rank),
    };
  });

  const exportInfo = {
    source_sheet: '债券利率 + 中票利率',
    range: 'prevCompletedWeek',
    range_window: [rangeStart, rangeEnd],
    rows: filtered.length,
    diagnostics: {
      columns: diagnostics.columns,
      stats: [
        {
          rows_total: bodyRows.length,
          rows_kept: filtered.length,
          range_start: rangeStart,
          range_end: rangeEnd,
          date_column: diagnostics.date_column,
        },
      ],
    },
  };

  return {
    top5_latest: top5Latest,
    series: [],
    export_info: exportInfo,
  };
}

export default parseBondYield;
