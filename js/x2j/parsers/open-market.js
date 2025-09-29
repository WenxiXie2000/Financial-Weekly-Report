import { toNumberOrNull, prevCompletedWeekRange } from '../utils.js';
import {
  computePrevWeekWorkdays,
  fmtISO,
  parseNumberLike,
  createSheetDiagnostics,
  trackColumn,
} from './common.js';

const DEFAULT_MONETARY_SHEET = '公开市场货币';

export function parseOpenMarketMonetary(
  rows,
  profile = {},
  { anchor = new Date(), sheetName = DEFAULT_MONETARY_SHEET } = {}
) {
  const headerRowIndex = Number.isInteger(profile.headerRow) ? Math.max(0, profile.headerRow) : 0;
  const header = rows[headerRowIndex] || [];
  const body = rows.slice(headerRowIndex + 1);

  const diagnostics = createSheetDiagnostics(sheetName);
  diagnostics.range = 'prevCompletedWeek';

  const dateIdx = trackColumn(diagnostics, header, profile.dateCol ?? '', {
    category: 'date',
    label: '日期列',
    allowMissing: true,
    note: profile.dateCol == null ? '未配置匹配规则' : undefined,
  });

  const summary = {
    r7d_amt_yi: null,
    r14d_amt_yi: null,
    mlf_amt_yi: null,
    tcd_amt_yi: null,
    slf_amt_yi: null,
    slo_amt_yi: null,
    repo_amt_yi: null,
  };
  const rateSeries = [];
  let table = [];
  let rangeWindow = [];

  const summaryKeyMap = {
    rr7d: 'r7d_amt_yi',
    rr14d: 'r14d_amt_yi',
    mlf: 'mlf_amt_yi',
    tcd: 'tcd_amt_yi',
    slf: 'slf_amt_yi',
    slo: 'slo_amt_yi',
    repo: 'repo_amt_yi',
  };

  diagnostics.dateCol = dateIdx >= 0 ? header[dateIdx] || null : null;
  const dateEntry = diagnostics.items[diagnostics.items.length - 1] || null;
  if (dateIdx < 0) {
    if (dateEntry) {
      dateEntry.note = dateEntry.note || '未找到日期列';
    }
    return {
      summary,
      diagnostics,
      rateSeries,
      table,
      rangeWindow,
    };
  }

  const weekRows = computePrevWeekWorkdays(body, dateIdx, anchor);
  const latestEntry = weekRows.length
    ? weekRows.reduce((prev, cur) => (cur.date > prev.date ? cur : prev))
    : null;

  const { mon, fri } = prevCompletedWeekRange(anchor);
  if (
    mon instanceof Date &&
    !Number.isNaN(mon.getTime()) &&
    fri instanceof Date &&
    !Number.isNaN(fri.getTime())
  ) {
    rangeWindow = [fmtISO(mon), fmtISO(fri)];
  }

  if (!latestEntry || !latestEntry.row) {
    return {
      summary,
      diagnostics,
      rateSeries,
      table,
      rangeWindow,
    };
  }

  const latestRow = latestEntry.row;
  const iso = latestEntry.date instanceof Date ? fmtISO(latestEntry.date) : '';

  table = [
    header.reduce((acc, cell, idx) => {
      const key = cell != null && String(cell).trim() ? String(cell).trim() : `COL_${idx + 1}`;
      acc[key] = latestRow[idx] ?? null;
      return acc;
    }, {}),
  ];

  const items = Array.isArray(profile.items) ? profile.items : [];
  items.forEach((item) => {
    if (!item || !item.key) return;
    const summaryKey = summaryKeyMap[item.key];
    const baseLabel = item.label || item.key;

    if (summaryKey && item.cols?.inj) {
      const amountIdx = trackColumn(diagnostics, header, item.cols.inj ?? '', {
        category: 'summary',
        label: `${baseLabel} 投放量(亿)`,
        extra: { field: summaryKey },
      });
      const amountVal = amountIdx >= 0 ? parseNumberLike(latestRow[amountIdx]) : null;
      if (amountVal != null) {
        summary[summaryKey] = amountVal;
      }
      const entry = diagnostics.items[diagnostics.items.length - 1];
      if (entry) {
        entry.extra = {
          ...(entry.extra || {}),
          field: summaryKey,
          value: amountVal,
        };
      }
    }

    if (item.cols?.rate) {
      const rateIdx = trackColumn(diagnostics, header, item.cols.rate ?? '', {
        category: 'rate',
        label: `${baseLabel} 利率(%)`,
        extra: { field: `rate:${item.key}` },
      });
      const rawRate = rateIdx >= 0 ? toNumberOrNull(latestRow[rateIdx]) : null;
      const rateVal = rawRate != null ? Number(rawRate.toFixed(4)) : null;
      const seriesName = `${baseLabel}利率(%)`;
      if (iso && rateVal != null) {
        rateSeries.push({ name: seriesName, data: [[iso, rateVal]] });
      }
      const entry = diagnostics.items[diagnostics.items.length - 1];
      if (entry) {
        entry.extra = {
          ...(entry.extra || {}),
          field: `rate:${seriesName}`,
          value: rateVal,
        };
      }
    }
  });

  if (dateEntry) {
    dateEntry.extra = {
      ...(dateEntry.extra || {}),
      points: weekRows.length,
      latest: iso,
    };
  }

  return {
    summary,
    diagnostics,
    rateSeries,
    table,
    rangeWindow,
  };
}

export function buildOpenMarketDataset(omPart, shiborPart) {
  const hasOm = omPart && Object.keys(omPart).length;
  const hasShibor = shiborPart && Object.keys(shiborPart).length;
  if (!hasOm && !hasShibor) return null;

  const summary = {
    r7d_amt_yi: omPart?.summary?.r7d_amt_yi ?? null,
    r14d_amt_yi: omPart?.summary?.r14d_amt_yi ?? null,
    mlf_amt_yi: omPart?.summary?.mlf_amt_yi ?? null,
    tcd_amt_yi: omPart?.summary?.tcd_amt_yi ?? null,
    slf_amt_yi: omPart?.summary?.slf_amt_yi ?? null,
    slo_amt_yi: omPart?.summary?.slo_amt_yi ?? null,
    repo_amt_yi: omPart?.summary?.repo_amt_yi ?? null,
  };

  const order = [
    '逆回购7D利率(%)',
    '逆回购14D利率(%)',
    'MLF利率(%)',
    '国库定存利率(%)',
    'SLF利率(%)',
    'SLO利率(%)',
    '正回购利率(%)',
    'SHIBOR 隔夜(%)',
    'SHIBOR 1周(%)',
    'SHIBOR 2周(%)',
    'SHIBOR 3月(%)',
    'SHIBOR 6月(%)',
    'SHIBOR 9月(%)',
    'SHIBOR 1年(%)',
  ];

  const seriesMap = new Map();
  const collect = (list) => {
    (Array.isArray(list) ? list : []).forEach((serie) => {
      if (!serie || !serie.name) return;
      seriesMap.set(serie.name, Array.isArray(serie.data) ? serie.data : []);
    });
  };
  collect(omPart?.rateSeries);
  collect(shiborPart?.series);

  const series = order.map((name) => ({
    name,
    data: seriesMap.get(name) || [],
  }));

  const exportInfo = {
    source_sheet: '公开市场货币 + Shibor利率',
    range: 'prevCompletedWeek',
    diagnostics: createSheetDiagnostics('公开市场组合'),
    last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  const combinedDiagnostics = exportInfo.diagnostics;

  const mergeDiagnostics = (source, diag) => {
    if (!diag || !Array.isArray(diag.items)) return;
    if (!combinedDiagnostics.dateCol && diag.dateCol) {
      combinedDiagnostics.dateCol = diag.dateCol;
    }
    if (!combinedDiagnostics.range && diag.range) {
      combinedDiagnostics.range = diag.range;
    }
    diag.items.forEach((item) => {
      if (!item) return;
      combinedDiagnostics.items.push({
        ...item,
        extra: {
          ...(item.extra || {}),
          source,
          sheet: diag.sheet,
        },
      });
    });
  };

  mergeDiagnostics('open_market_monetary', omPart?.diagnostics);
  mergeDiagnostics('shibor', shiborPart?.export_info?.diagnostics);

  if (
    Array.isArray(omPart?.rangeWindow) &&
    omPart.rangeWindow.length === 2 &&
    omPart.rangeWindow.every((item) => typeof item === 'string')
  ) {
    exportInfo.range_window = omPart.rangeWindow;
  }

  return {
    summary,
    series,
    table: Array.isArray(omPart?.table) ? omPart.table : [],
    export_info: exportInfo,
  };
}

export default {
  parseOpenMarketMonetary,
  buildOpenMarketDataset,
};
