/**
 * 公开市场视图数据工具：数值解析、序列筛选与常用格式化。
 */
import { fmtDateLabel } from './dates.js';

export function parseNumeric(raw) {
  if (raw == null || raw === '' || raw === '--') return null;
  if (typeof raw === 'number') {
    return Number.isNaN(raw) ? null : raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.replace(/[%\s]/g, '');
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isNaN(num) ? null : num;
  }
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

export function toSeriesMap(seriesArr) {
  const map = new Map();
  if (Array.isArray(seriesArr)) {
    for (const item of seriesArr) {
      if (!item || typeof item.name === 'undefined') continue;
      const key = String(item.name);
      const data = Array.isArray(item.data) ? item.data : [];
      map.set(key, data);
    }
  }
  return map;
}

export function pickSeries(seriesMap, name, options = {}) {
  if (!name) return [];
  const arr = (seriesMap instanceof Map ? seriesMap.get(name) : null) || [];
  const clean = [];
  for (const entry of arr) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, raw] = entry;
    if (date == null) continue;
    const num = parseNumeric(raw);
    if (num == null && num !== 0) continue;
    clean.push([String(date), num]);
  }
  if (clean.length === 0) return [];

  let windowDays = null;
  let lastN = null;
  if (typeof options === 'number') {
    lastN = options;
  } else if (options && typeof options === 'object') {
    if (Number.isFinite(options.windowDays)) {
      windowDays = options.windowDays;
    }
    if (Number.isFinite(options.lastN)) {
      lastN = options.lastN;
    }
  }

  let filtered = clean;
  if (windowDays && windowDays > 0 && clean.length) {
    const latestRaw = clean[clean.length - 1][0];
    const latestDate = new Date(latestRaw.replace(/-/g, '/'));
    if (!Number.isNaN(latestDate.getTime())) {
      const cutoff = new Date(latestDate.getTime() - (windowDays - 1) * 86400000);
      cutoff.setHours(0, 0, 0, 0);
      filtered = clean.filter(([dateStr]) => {
        if (!dateStr) return false;
        const parsed = new Date(String(dateStr).replace(/-/g, '/'));
        if (Number.isNaN(parsed.getTime())) return false;
        parsed.setHours(0, 0, 0, 0);
        return parsed >= cutoff;
      });
    }
  }

  if (lastN && lastN > 0) {
    return filtered.slice(-lastN);
  }

  return filtered;
}

export function windowForShibor(name) {
  if (!name) return null;
  if (/隔夜|1周|2周/.test(name)) return 90;
  if (/3月|6月|9月/.test(name)) return 180;
  if (/1年/.test(name)) return 365;
  return null;
}

export function pickShibor(seriesSource, name) {
  if (!name) return [];
  let rawSeries = [];
  if (seriesSource instanceof Map) {
    rawSeries = seriesSource.get(name) || [];
  } else if (Array.isArray(seriesSource)) {
    const found = seriesSource.find((item) => item && item.name === name);
    rawSeries = found && Array.isArray(found.data) ? found.data : [];
  }

  const clean = [];
  for (const entry of rawSeries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, raw] = entry;
    if (date == null) continue;
    const num = parseNumeric(raw);
    if (num == null && num !== 0) continue;
    clean.push([String(date), num]);
  }

  if (!clean.length) return [];
  const win = windowForShibor(name);
  return Number.isFinite(win) && win > 0 ? clean.slice(-win) : clean;
}

export function findLatestPoint(seriesMap, name) {
  if (!name) return null;
  const arr = (seriesMap instanceof Map ? seriesMap.get(name) : null) || [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const entry = arr[i];
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, raw] = entry;
    if (date == null) continue;
    const num = parseNumeric(raw);
    if (num == null && num !== 0) continue;
    return { date: String(date), value: num };
  }
  return null;
}

export function formatMarketNumber(num) {
  if (num == null || num === '' || Number.isNaN(Number(num))) return '--';
  const value = Number(num);
  const abs = Math.abs(value);
  if (abs >= 1e8) return (value / 1e8).toFixed(1);
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return value.toLocaleString();
}

export function formatLatestLabel(latest) {
  if (!latest?.date) return '';
  return fmtDateLabel(latest.date);
}
