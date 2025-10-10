import { toDateSafe, toNumberOrNull } from '../utils.js';
import { fmtISO, deriveRange, createSheetDiagnostics, trackColumn } from './common.js';

const DEFAULT_SHEET_NAME = 'Shibor利率';

function dedupeByDate(pairs) {
  const map = new Map();
  for (const [date, value] of pairs) {
    if (date == null) continue;
    if (value == null) continue;
    map.set(date, value);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => [date, value]);
}

export function parseShibor(rows, profile = {}, { sheetName = DEFAULT_SHEET_NAME } = {}) {
  const headerRowIndex = Number.isInteger(profile?.headerRow) ? Math.max(0, profile.headerRow) : 0;
  const header = Array.isArray(rows?.[headerRowIndex])
    ? rows[headerRowIndex].map((cell) => String(cell ?? '').trim())
    : [];
  const body = Array.isArray(rows)
    ? rows.slice(headerRowIndex + 1).filter((row) => Array.isArray(row))
    : [];

  const diagnostics = createSheetDiagnostics(sheetName);
  const series = [];

  const groupConfigs = [
    {
      key: 'g_90',
      label: 'SHIBOR 90d',
      dateMatcher: profile?.dateCol_on_90,
      series: [
        { name: 'SHIBOR 隔夜(%)', matcher: profile?.col_on },
        { name: 'SHIBOR 1周(%)', matcher: profile?.col_1w },
        { name: 'SHIBOR 2周(%)', matcher: profile?.col_2w },
      ],
    },
    {
      key: 'g_180',
      label: 'SHIBOR 180d',
      dateMatcher: profile?.dateCol_3m_180,
      series: [
        { name: 'SHIBOR 3月(%)', matcher: profile?.col_3m },
        { name: 'SHIBOR 6月(%)', matcher: profile?.col_6m },
        { name: 'SHIBOR 9月(%)', matcher: profile?.col_9m },
      ],
    },
    {
      key: 'g_365',
      label: 'SHIBOR 365d',
      dateMatcher: profile?.dateCol_1y_365,
      series: [{ name: 'SHIBOR 1年(%)', matcher: profile?.col_1y }],
    },
  ];

  const buildGroupSeries = (group) => {
    const dateIdx = trackColumn(diagnostics, header, group.dateMatcher ?? '', {
      category: 'date',
      label: `${group.label} 代表日期`,
      allowMissing: true,
      extra: { group: group.key },
    });
    const dateEntry = diagnostics.items[diagnostics.items.length - 1] || null;
    if (dateIdx < 0) {
      if (dateEntry) {
        dateEntry.note = dateEntry.note || '未找到日期列';
      }
      return [];
    }

    const seriesStates = group.series.map((seriesDef) => {
      const colIdx = trackColumn(diagnostics, header, seriesDef.matcher ?? '', {
        category: 'rate',
        label: seriesDef.name,
        allowMissing: true,
        extra: { group: group.key },
      });
      const entry = diagnostics.items[diagnostics.items.length - 1] || null;
      if (colIdx < 0 && entry) {
        entry.note = entry.note || '未找到数据列';
      }
      return {
        def: seriesDef,
        colIdx,
        entry,
        data: [],
      };
    });

    const dateMap = new Map();
    body.forEach((row) => {
      const dateValue = dateIdx >= 0 ? toDateSafe(row?.[dateIdx]) : null;
      if (!dateValue) return;
      const iso = fmtISO(dateValue);
      if (!iso) return;
      const bucket = dateMap.get(iso) || { iso };
      seriesStates.forEach((state) => {
        if (state.colIdx < 0) return;
        const raw = row?.[state.colIdx];
        const parsed = toNumberOrNull(raw);
        if (parsed == null) return;
        bucket[state.def.name] = Number(parsed.toFixed(4));
      });
      dateMap.set(iso, bucket);
    });

    const ordered = Array.from(dateMap.values()).sort((a, b) =>
      a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0
    );
    if (dateEntry) {
      dateEntry.extra = {
        ...(dateEntry.extra || {}),
        points: ordered.length,
      };
      if (ordered.length) {
        dateEntry.extra.dateRange = [ordered[0].iso, ordered[ordered.length - 1].iso];
      }
    }

    seriesStates.forEach((state) => {
      const rawPairs = [];
      ordered.forEach((item) => {
        const value = item[state.def.name];
        if (value == null) return;
        rawPairs.push([item.iso, value]);
      });
      const data = dedupeByDate(rawPairs);
      state.data = data;
      if (state.entry) {
        state.entry.extra = {
          ...(state.entry.extra || {}),
          points: data.length,
        };
        if (data.length) {
          state.entry.extra.dateRange = [data[0][0], data[data.length - 1][0]];
        }
      }
    });

    return seriesStates.map((state) => ({
      name: state.def.name,
      data: state.data,
      unit: '%',
    }));
  };

  groupConfigs.forEach((group) => {
    const collected = buildGroupSeries(group);
    collected.forEach((serie) => {
      if (Array.isArray(serie.data) && serie.data.length) {
        series.push(serie);
      } else {
        series.push({ ...serie, data: [] });
      }
    });
  });

  const totalPoints = series.reduce(
    (acc, serie) => acc + (Array.isArray(serie.data) ? serie.data.length : 0),
    0
  );
  let minDate = null;
  let maxDate = null;
  series.forEach((serie) => {
    (serie.data || []).forEach(([iso]) => {
      if (!iso) return;
      if (!minDate || iso < minDate) minDate = iso;
      if (!maxDate || iso > maxDate) maxDate = iso;
    });
  });
  const overallRange = minDate && maxDate ? [minDate, maxDate] : deriveRange(series);

  const meta = {
    timezone: 'Asia/Shanghai',
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    sourceSheets: [sheetName],
    unit: { rate: '%' },
  };

  const exportInfo = {
    source_sheet: sheetName,
    rows: totalPoints,
    last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    diagnostics,
  };
  if (overallRange) {
    exportInfo.range = overallRange;
    diagnostics.range = diagnostics.range || overallRange.join(' ~ ');
  }

  return {
    meta,
    summary: {},
    series,
    export_info: exportInfo,
    diagnostics: diagnostics.items,
  };
}

export default parseShibor;
