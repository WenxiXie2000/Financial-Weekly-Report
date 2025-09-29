import { findColIndex, toDateSafe } from '../utils.js';
import {
  fmtISO,
  parsePercentNumber,
  deriveRange,
  createSheetDiagnostics,
  trackColumn,
} from './common.js';

const DEFAULT_SHEET_NAME = 'Shibor利率';

export function parseShibor(rows, profile = {}, { sheetName = DEFAULT_SHEET_NAME } = {}) {
  const headerRowIndex = Number.isInteger(profile?.headerRow) ? Math.max(0, profile.headerRow) : 0;
  const header = rows[headerRowIndex] || [];
  const body = rows
    .slice(headerRowIndex + 1)
    .filter(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')
    );

  const groups = Array.isArray(profile?.groups) ? profile.groups : [];
  const diagnostics = createSheetDiagnostics(sheetName);
  diagnostics.range = profile?.rangeLabel || null;
  const series = [];

  const normalizeRate = (value) => {
    const parsed = parsePercentNumber(value);
    if (parsed == null || Number.isNaN(parsed)) return null;
    return Number(parsed.toFixed(4));
  };

  groups.forEach((group, groupIndex) => {
    const groupKey = group?.key || `group_${groupIndex}`;
    const dateIdx = trackColumn(diagnostics, header, group?.dateCol ?? '', {
      category: 'date',
      label: `${group?.label || groupKey} 日期列`,
      allowMissing: true,
      extra: { group: groupKey, range: group?.range || null },
    });
    const dateEntry = diagnostics.items[diagnostics.items.length - 1] || null;

    if (dateIdx < 0) {
      if (dateEntry) {
        dateEntry.note = dateEntry.note || '未找到日期列';
      }
      return;
    }

    const datedRows = body
      .map((row) => {
        const date = toDateSafe(row?.[dateIdx]);
        if (!date) return null;
        return { row, date, iso: fmtISO(date) };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    if (dateEntry) {
      dateEntry.extra = {
        ...(dateEntry.extra || {}),
        points: datedRows.length,
      };
    }
    if (datedRows.length === 1) {
      if (dateEntry) {
        dateEntry.extra = {
          ...(dateEntry.extra || {}),
          dateRange: [datedRows[0].iso, datedRows[0].iso],
        };
      }
    } else if (datedRows.length >= 2) {
      if (dateEntry) {
        dateEntry.extra = {
          ...(dateEntry.extra || {}),
          dateRange: [datedRows[0].iso, datedRows[datedRows.length - 1].iso],
        };
      }
    }

    if (!datedRows.length) {
      return;
    }

    let cutoff = null;
    if (typeof group?.range === 'string' && group.range.startsWith('lastNDays:')) {
      const n = Number(group.range.split(':')[1] || '0');
      if (Number.isFinite(n) && n > 0) {
        const latest = datedRows[datedRows.length - 1].date;
        cutoff = new Date(latest.getTime());
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - (n - 1));
      }
    }

    (Array.isArray(group?.items) ? group.items : []).forEach((item) => {
      if (!item) {
        return;
      }

      const colIdx = trackColumn(diagnostics, header, item?.col ?? '', {
        category: 'rate',
        label: item?.label || item?.key || '',
        extra: { group: groupKey, key: item?.key || '' },
      });
      const itemEntry = diagnostics.items[diagnostics.items.length - 1] || null;

      if (colIdx < 0) {
        if (itemEntry) {
          itemEntry.note = itemEntry.note || '未找到数据列';
        }
        return;
      }

      const data = [];
      datedRows.forEach(({ row, iso, date }) => {
        if (cutoff && date < cutoff) {
          return;
        }
        const raw = row[colIdx];
        const value = normalizeRate(raw);
        if (value == null) {
          return;
        }
        data.push([iso, value]);
      });

      if (!data.length) {
        return;
      }

      if (itemEntry) {
        itemEntry.extra = {
          ...(itemEntry.extra || {}),
          points: data.length,
        };
      }
      const range = deriveRange([{ data }]);
      if (Array.isArray(range) && range.length === 2) {
        if (itemEntry) {
          itemEntry.extra = {
            ...(itemEntry.extra || {}),
            dateRange: range,
          };
        }
      }

      series.push({
        name: item.label || item.key || '',
        data,
        unit: '%',
      });
    });
  });

  const totalPoints = series.reduce(
    (acc, serie) => acc + (Array.isArray(serie.data) ? serie.data.length : 0),
    0
  );
  const overallRange = deriveRange(series);

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
