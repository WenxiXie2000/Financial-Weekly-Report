import { toNumberOrNull, prevCompletedWeekRange } from '../utils.js';
import {
  computePrevWeekWorkdays,
  fmtISO,
  parseNumberLike,
  createSheetDiagnostics,
  trackColumn,
} from './common.js';

const DEFAULT_MONETARY_SHEET = '公开市场货币';

const SUMMARY_PREFIX_MAP = {
  rr7d: 'r7d',
  rr14d: 'r14d',
  mlf: 'mlf',
  tcd: 'tcd',
  slf: 'slf',
  slo: 'slo',
  repo: 'repo',
};

const toYiSafe = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value).trim();
  if (!text) return null;

  let normalized = text.replace(/,/g, '').replace(/（|）/g, (m) => (m === '（' ? '(' : ')'));
  let multiplier = 1;

  const unitMatch = normalized.match(/(万亿|亿元|亿|万元|万)/);
  if (unitMatch) {
    const unit = unitMatch[1];
    switch (unit) {
      case '万亿':
        multiplier = 1e4;
        break;
      case '亿元':
      case '亿':
        multiplier = 1;
        break;
      case '万元':
      case '万':
        multiplier = 1e-4;
        break;
      default:
        multiplier = 1;
    }
    normalized = normalized.replace(unit, '');
  }

  normalized = normalized.replace(/[\s元人民币]/g, '');
  normalized = normalized.replace(/[^0-9.+-]/g, '');

  if (!normalized) {
    const fallback = parseNumberLike(text);
    if (!Number.isFinite(fallback)) return null;
    return Number(fallback);
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    const fallback = parseNumberLike(text);
    return Number.isFinite(fallback) ? Number(fallback) : null;
  }
  return num * multiplier;
};

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

  const summary = {};
  Object.values(SUMMARY_PREFIX_MAP).forEach((prefix) => {
    summary[`${prefix}_expiry_yi`] = null;
    summary[`${prefix}_amt_yi`] = null;
    summary[`${prefix}_net_yi`] = null;
    summary[`${prefix}_rate_pct`] = null;
  });
  const rateSeries = [];
  let table = [];
  let rangeWindow = [];

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

  if (dateEntry) {
    dateEntry.extra = {
      ...(dateEntry.extra || {}),
      field: 'date',
      header: diagnostics.dateCol,
      index: dateIdx,
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
    const baseLabel = item.label || item.key;
    const summaryPrefix = SUMMARY_PREFIX_MAP[item.key] || null;
    const summaryFields = summaryPrefix
      ? {
          expiry: `${summaryPrefix}_expiry_yi`,
          amount: `${summaryPrefix}_amt_yi`,
          net: `${summaryPrefix}_net_yi`,
          rate: `${summaryPrefix}_rate_pct`,
        }
      : {};

    if (summaryFields.expiry && item.cols?.due) {
      const dueIdx = trackColumn(diagnostics, header, item.cols.due ?? '', {
        category: 'summary',
        label: `${baseLabel} 到期量(亿)`,
        extra: { field: summaryFields.expiry },
      });
      const dueVal = dueIdx >= 0 ? toYiSafe(latestRow[dueIdx]) : null;
      if (dueVal != null) {
        summary[summaryFields.expiry] = dueVal;
      }
      const entry = diagnostics.items[diagnostics.items.length - 1];
      if (entry) {
        entry.extra = {
          ...(entry.extra || {}),
          field: summaryFields.expiry,
          value: dueVal,
          header: entry.column ?? null,
        };
      }
    }

    if (summaryFields.amount && item.cols?.inj) {
      const amountIdx = trackColumn(diagnostics, header, item.cols.inj ?? '', {
        category: 'summary',
        label: `${baseLabel} 投放量(亿)`,
        extra: { field: summaryFields.amount },
      });
      const amountVal = amountIdx >= 0 ? toYiSafe(latestRow[amountIdx]) : null;
      if (amountVal != null) {
        summary[summaryFields.amount] = amountVal;
      }
      const entry = diagnostics.items[diagnostics.items.length - 1];
      if (entry) {
        entry.extra = {
          ...(entry.extra || {}),
          field: summaryFields.amount,
          value: amountVal,
          header: entry.column ?? null,
        };
      }
    }

    if (summaryFields.net && item.cols?.net) {
      const netIdx = trackColumn(diagnostics, header, item.cols.net ?? '', {
        category: 'summary',
        label: `${baseLabel} 净投放(亿)`,
        extra: { field: summaryFields.net },
      });
      const netVal = netIdx >= 0 ? toYiSafe(latestRow[netIdx]) : null;
      if (netVal != null) {
        summary[summaryFields.net] = netVal;
      }
      const entry = diagnostics.items[diagnostics.items.length - 1];
      if (entry) {
        entry.extra = {
          ...(entry.extra || {}),
          field: summaryFields.net,
          value: netVal,
          header: entry.column ?? null,
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
      const normalizedLabel = String(baseLabel ?? '')
        .replace(/[（]/g, '(')
        .replace(/[）]/g, ')')
        .replace(/\s+/g, '')
        .trim();
      const seriesName = normalizedLabel ? `${normalizedLabel}利率(%)` : `${baseLabel}利率(%)`;
      if (iso && rateVal != null) {
        rateSeries.push({ name: seriesName, data: [[iso, rateVal]] });
      }
      const entry = diagnostics.items[diagnostics.items.length - 1];
      if (entry) {
        entry.extra = {
          ...(entry.extra || {}),
          field: `rate:${seriesName}`,
          value: rateVal,
          header: entry.column ?? null,
        };
      }
      if (summaryFields.rate) {
        summary[summaryFields.rate] = rateVal;
      }
    }

    if (summaryFields.net && summary[summaryFields.net] == null) {
      const expiryVal = summaryFields.expiry ? summary[summaryFields.expiry] : null;
      const amountVal = summaryFields.amount ? summary[summaryFields.amount] : null;
      if (
        typeof amountVal === 'number' &&
        Number.isFinite(amountVal) &&
        typeof expiryVal === 'number' &&
        Number.isFinite(expiryVal)
      ) {
        const netFallback = amountVal - expiryVal;
        if (Number.isFinite(netFallback)) {
          summary[summaryFields.net] = netFallback;
        }
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

  const summarySource = (omPart && omPart.summary) || {};
  const summary = {};
  Object.values(SUMMARY_PREFIX_MAP).forEach((prefix) => {
    summary[`${prefix}_expiry_yi`] = summarySource[`${prefix}_expiry_yi`] ?? null;
    summary[`${prefix}_amt_yi`] = summarySource[`${prefix}_amt_yi`] ?? null;
    summary[`${prefix}_net_yi`] = summarySource[`${prefix}_net_yi`] ?? null;
    summary[`${prefix}_rate_pct`] = summarySource[`${prefix}_rate_pct`] ?? null;
  });

  const OM_ORDER = [
    '逆回购7D利率(%)',
    '逆回购14D利率(%)',
    'MLF利率(%)',
    '国库定存利率(%)',
    'SLF利率(%)',
    'SLO利率(%)',
    '正回购利率(%)',
  ];

  const series = [];
  const indexMap = new Map();
  const pushSerie = (serie) => {
    if (!serie || !serie.name) return;
    const name = String(serie.name);
    const data = Array.isArray(serie.data) ? serie.data : [];
    const payload = {
      name,
      data,
    };
    if (serie.unit) {
      payload.unit = serie.unit;
    }
    if (indexMap.has(name)) {
      const idx = indexMap.get(name);
      series[idx] = payload;
    } else {
      series.push(payload);
      indexMap.set(name, series.length - 1);
    }
  };

  const omSeries = Array.isArray(omPart?.rateSeries) ? omPart.rateSeries : [];
  const omMap = new Map();
  omSeries.forEach((serie) => {
    if (!serie || !serie.name) return;
    omMap.set(serie.name, serie);
  });

  OM_ORDER.forEach((name) => {
    if (omMap.has(name)) {
      pushSerie(omMap.get(name));
      omMap.delete(name);
    } else {
      pushSerie({ name, data: [] });
    }
  });

  omMap.forEach((serie) => {
    pushSerie(serie);
  });

  const shiborSeries = Array.isArray(shiborPart?.series) ? shiborPart.series : [];
  shiborSeries.forEach((serie) => {
    pushSerie(serie);
  });

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
