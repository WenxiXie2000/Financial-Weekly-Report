import {
  computePrevWeekWorkdays,
  fmtISO,
  parseNumberLike,
  parsePercentNumber,
  formatNumber4,
  formatPercent4,
  deriveRange,
  createSheetDiagnostics,
  trackColumn,
} from './common.js';

/**
 * @typedef {import("../types.js").CnyFxJson} CnyFxJson
 */

const DEFAULT_SHEET_NAME = '人民币汇率';

export function parseCnyFx(
  rows,
  profile = {},
  { anchor = new Date(), sheetName = DEFAULT_SHEET_NAME } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow) ? Math.max(0, profile.headerRow) : 0;
  const header = rows[headerRowIndex] || [];
  const body = rows
    .slice(headerRowIndex + 1)
    .filter(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')
    );

  const diagnostics = createSheetDiagnostics(sheetName);
  diagnostics.range = profile?.rangeDefault || 'prevWeekWorkdays';

  const dateIdx = trackColumn(diagnostics, header, profile?.dateCol ?? '', {
    category: 'date',
    label: '日期列',
    allowMissing: false,
  });

  if (dateIdx < 0) {
    throw new Error(`${sheetName}：未找到日期列`);
  }

  let weekRows = computePrevWeekWorkdays(body, dateIdx, anchor)
    .map((item) => ({ ...item, iso: fmtISO(item.date) }))
    .sort((a, b) => a.date - b.date);

  if (typeof profile?.rowFilter === 'function') {
    weekRows = weekRows.filter((item) => profile.rowFilter({ date: item.iso }));
  }

  diagnostics.dateCol = header[dateIdx] || null;
  const dateEntry = diagnostics.items[diagnostics.items.length - 1] || null;
  if (dateEntry) {
    dateEntry.extra = {
      ...(dateEntry.extra || {}),
      points: weekRows.length,
      dateRange: weekRows.length >= 2 ? [weekRows[0].iso, weekRows[weekRows.length - 1].iso] : [],
    };
  }

  const metricDefs = [
    {
      key: 'rate',
      suffix: ' 汇率',
      label: '汇率',
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: 'chg',
      suffix: ' 涨跌幅(%)',
      label: '涨跌幅(%)',
      parser: parsePercentNumber,
      isPct: true,
    },
    {
      key: 'mid',
      suffix: ' 央行中间价',
      label: '央行中间价',
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: 'mid_chg',
      suffix: ' 央行中间价调整(%)',
      label: '央行中间价调整(%)',
      parser: parsePercentNumber,
      isPct: true,
    },
  ];

  const series = [];
  const kpis = {};
  const metricIndexMap = new Map();

  (profile?.currencies || []).forEach((currency) => {
    const keyBase = String(currency?.key || '')
      .trim()
      .toLowerCase();
    if (!keyBase) return;
    kpis[`${keyBase}_mid`] = null;
    kpis[`${keyBase}_mid_chg`] = null;
  });

  (profile?.currencies || []).forEach((currency) => {
    const keyword = String(currency?.keyword || '').trim();
    const keyBase = String(currency?.key || '')
      .trim()
      .toLowerCase();
    if (!keyword || !keyBase) return;

    metricDefs.forEach((metric) => {
      if (currency?.noMid && metric.key.startsWith('mid')) {
        return;
      }

      const matcherFactory = profile?.cols?.[metric.key];
      const matcher = typeof matcherFactory === 'function' ? matcherFactory(keyword) : null;

      const idx = trackColumn(diagnostics, header, matcher ?? '', {
        category: 'series',
        label: `${keyword}${metric.label}`,
        note: matcher == null ? '未配置匹配规则' : undefined,
        extra: {
          metric: metric.key,
          currency: keyword,
        },
      });

      if (idx >= 0) {
        metricIndexMap.set(`${keyBase}:${metric.key}`, idx);
      }

      const diagEntry = diagnostics.items[diagnostics.items.length - 1] || null;

      const data = weekRows.map((item) => {
        const raw = idx >= 0 ? item.row?.[idx] : null;
        if (raw === '' || raw == null) {
          return [item.iso, null];
        }
        const parsed = metric.parser(raw);
        if (parsed == null || Number.isNaN(parsed)) {
          return [item.iso, null];
        }
        return [item.iso, parsed];
      });

      if (diagEntry) {
        const points = data.filter(([, v]) => v != null).length;
        const range = deriveRange([{ data }]);
        diagEntry.extra = {
          ...(diagEntry.extra || {}),
          points,
          dateRange: Array.isArray(range) ? range : [],
        };
      }

      series.push({ name: `${keyword}${metric.suffix}`, data });
    });
  });

  const table = weekRows.map((item) => {
    const record = {};
    header.forEach((col, idx) => {
      if (idx === dateIdx) {
        record[col] = item.iso;
      } else {
        record[col] = item.row?.[idx] ?? null;
      }
    });
    return record;
  });

  if (weekRows.length) {
    const last = weekRows[weekRows.length - 1];
    (profile?.currencies || []).forEach((currency) => {
      const keyword = String(currency?.keyword || '').trim();
      const keyBase = String(currency?.key || '')
        .trim()
        .toLowerCase();
      if (!keyword || !keyBase || currency?.noMid) return;

      const midIdx = metricIndexMap.get(`${keyBase}:mid`);
      if (typeof midIdx === 'number' && midIdx >= 0) {
        const formatted = formatNumber4(last.row?.[midIdx]);
        if (formatted != null) {
          kpis[`${keyBase}_mid`] = formatted;
        }
      }

      const midChgIdx = metricIndexMap.get(`${keyBase}:mid_chg`);
      if (typeof midChgIdx === 'number' && midChgIdx >= 0) {
        const formatted = formatPercent4(last.row?.[midChgIdx]);
        if (formatted != null) {
          kpis[`${keyBase}_mid_chg`] = formatted;
        }
      }
    });
  }

  const rangeWindow =
    weekRows.length >= 2 ? [weekRows[0].iso, weekRows[weekRows.length - 1].iso] : [];

  const diagnosticEntries = diagnostics.items.map((item) => {
    const extra = item.extra || {};
    return {
      category: item.category || 'series',
      label: item.label,
      matcher: item.matcher,
      matched: Boolean(item.matched),
      column: item.column || null,
      index: typeof item.index === 'number' ? item.index : null,
      closest: Array.isArray(item.closest) ? item.closest : [],
      metric: extra.metric || '',
      points: typeof extra.points === 'number' ? extra.points : 0,
      dateRange: Array.isArray(extra.dateRange) ? extra.dateRange : [],
    };
  });

  const exportInfo = {
    source_sheet: sheetName,
    range: profile?.rangeDefault || 'prevWeekWorkdays',
    rows: weekRows.length,
    range_window: rangeWindow,
    last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    diagnostics,
  };

  const meta = {
    timezone: 'Asia/Shanghai',
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    rangeStrategy: profile?.rangeDefault || 'prevWeekWorkdays',
    sourceSheets: [sheetName],
  };

  return {
    meta,
    summary: {},
    series,
    table,
    kpis,
    export_info: exportInfo,
    diagnostics: diagnosticEntries,
  };
}

export default parseCnyFx;
