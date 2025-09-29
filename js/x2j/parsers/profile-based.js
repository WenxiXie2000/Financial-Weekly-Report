import {
  findColIndex,
  missingToNull,
  toNumberOrNull,
  toPctString4OrNull,
  toDateSafe,
  isWeekday,
  prevCompletedWeekRange,
} from '../utils.js';
import {
  formatDate,
  deriveRange,
  normalizeDateValue,
  formatPercent4,
  toISODateSafe,
  createSheetDiagnostics,
  trackColumn,
} from './common.js';

function pickHeaderRow(rows, headerRowIndex = 0) {
  const idx = Math.max(0, Number(headerRowIndex) || 0);
  return (rows[idx] || []).map((x) => String(x || '').trim());
}

function getPrevWeekWorkdayRange(now = new Date()) {
  const baseNow =
    now instanceof Date && !Number.isNaN(now.getTime())
      ? new Date(now.getTime())
      : new Date(now || Date.now());
  baseNow.setHours(0, 0, 0, 0);
  const { mon, fri } = prevCompletedWeekRange(baseNow);
  return { start: mon, end: fri };
}

export function parseByProfile(rows, profile = {}, { sheetName = '', anchor = new Date() } = {}) {
  const diagnostics = createSheetDiagnostics(sheetName);
  diagnostics.range = profile?.rangeLabel || profile?.range || null;

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      meta: {
        timezone: 'Asia/Shanghai',
        sourceSheet: sheetName,
        generatedAt: new Date().toISOString(),
        note: '空数据表',
      },
      summary: {},
      series: [],
      diagnostics: diagnostics.items,
    };
  }

  const headerRowIndex = Number.isInteger(profile.headerRow) ? Math.max(0, profile.headerRow) : 0;
  const header = pickHeaderRow(rows, headerRowIndex);
  const track = (matcher, options = {}) => {
    if (matcher == null) return -1;
    return trackColumn(diagnostics, header, matcher, options);
  };
  const dateIdx = track(profile.dateCol, {
    category: 'date',
    label: '日期列',
  });
  if (dateIdx >= 0 && !diagnostics.dateCol) {
    diagnostics.dateCol = header[dateIdx] || null;
  }
  if (Array.isArray(profile.bondGroups) && profile.bondGroups.length) {
    const body = rows.slice(headerRowIndex + 1);
    let range = null;
    if (profile.range === 'prevWeekOnly' || profile.range === 'prevWeekWorkdays') {
      range = getPrevWeekWorkdayRange(anchor);
    }
    const inRange = (value) => {
      if (!range) return true;
      if (!value) return false;
      const parsed = new Date(String(value).replace(/-/g, '/'));
      return !Number.isNaN(parsed.getTime()) && parsed >= range.start && parsed <= range.end;
    };

    const expandMatcher = (regexTpl, rank) => {
      if (regexTpl instanceof RegExp) {
        return new RegExp(regexTpl.source.replace('{R}', String(rank)), regexTpl.flags);
      }
      const pattern = String(regexTpl || '').replace('{R}', String(rank));
      return new RegExp(pattern);
    };
    if (dateIdx < 0) {
      throw new Error(`${sheetName || '表'}：未找到日期列`);
    }

    const groupDefs = profile.bondGroups
      .map((group) => {
        if (!group || !Array.isArray(group.rankRange) || group.rankRange.length < 2) {
          return null;
        }
        const [rankStart, rankEnd] = group.rankRange;
        const rankDefs = [];
        for (let rank = rankStart; rank <= rankEnd; rank += 1) {
          const issuerIdx = group?.cols?.issuer
            ? track(expandMatcher(group.cols.issuer, rank), {
                category: 'bond',
                label: `${group?.label || group.key || '组'} R${rank} 发行人`,
                extra: { group: group?.key, rank, field: 'issuer' },
              })
            : -1;
          const sizeIdx = group?.cols?.size
            ? track(expandMatcher(group.cols.size, rank), {
                category: 'bond',
                label: `${group?.label || group.key || '组'} R${rank} 发行规模`,
                extra: { group: group?.key, rank, field: 'size' },
              })
            : -1;
          const termIdx = group?.cols?.term
            ? track(expandMatcher(group.cols.term, rank), {
                category: 'bond',
                label: `${group?.label || group.key || '组'} R${rank} 期限`,
                extra: { group: group?.key, rank, field: 'term' },
              })
            : -1;
          const couponIdx = group?.cols?.coupon
            ? track(expandMatcher(group.cols.coupon, rank), {
                category: 'bond',
                label: `${group?.label || group.key || '组'} R${rank} 票面利率`,
                extra: { group: group?.key, rank, field: 'coupon' },
              })
            : -1;

          if (issuerIdx < 0 && sizeIdx < 0 && termIdx < 0 && couponIdx < 0) {
            continue;
          }

          rankDefs.push({
            rank,
            issuerIdx,
            sizeIdx,
            termIdx,
            couponIdx,
          });
        }

        if (!rankDefs.length) {
          return null;
        }

        return {
          key: group.key,
          label: group.label || group.key || String(group.key ?? '组'),
          ranks: rankDefs,
        };
      })
      .filter(Boolean);

    const seriesMap = new Map();
    const sumSizeMap = new Map();
    const latestBoard = {};

    for (const row of body) {
      const tRaw = row[dateIdx];
      if (!tRaw) continue;
      const isoDate = toISODateSafe(tRaw);
      if (!isoDate || !inRange(isoDate)) continue;

      if (typeof profile.rowFilter === 'function' && !profile.rowFilter({ date: isoDate })) {
        continue;
      }

      for (const def of groupDefs) {
        const ranks = [];

        def.ranks.forEach((rankDef) => {
          const { rank, issuerIdx, sizeIdx, termIdx, couponIdx } = rankDef;

          const issuerRaw = issuerIdx >= 0 ? row[issuerIdx] : null;
          const sizeRaw = sizeIdx >= 0 ? row[sizeIdx] : null;
          const termRaw = termIdx >= 0 ? row[termIdx] : null;
          const couponRaw = couponIdx >= 0 ? row[couponIdx] : null;

          const issuerClean = missingToNull(issuerRaw);
          const sizeNum = toNumberOrNull(sizeRaw);
          const termClean = missingToNull(termRaw);
          const couponNum = toNumberOrNull(couponRaw);

          if (issuerClean == null && sizeNum == null && termClean == null && couponNum == null) {
            return;
          }

          ranks.push({
            rank,
            issuer: issuerClean == null ? null : String(issuerClean).trim() || null,
            size: Number.isFinite(sizeNum) ? sizeNum : null,
            term: termClean == null ? null : String(termClean).trim() || null,
            coupon: Number.isFinite(couponNum) ? couponNum : null,
            couponRaw,
          });
        });

        if (!ranks.length) continue;

        const sumSize = ranks.reduce(
          (acc, item) => acc + (Number.isFinite(item.size) ? item.size : 0),
          0
        );
        if (!sumSizeMap.has(def.key)) {
          sumSizeMap.set(def.key, []);
        }
        sumSizeMap.get(def.key).push([isoDate, String(sumSize)]);

        const coupons = ranks.map((item) => item.coupon).filter((val) => Number.isFinite(val));
        if (coupons.length) {
          const avg = coupons.reduce((acc, val) => acc + val, 0) / coupons.length;
          if (!seriesMap.has(def.key)) {
            seriesMap.set(def.key, { label: def.label, data: [] });
          }
          seriesMap.get(def.key).data.push([isoDate, avg.toFixed(4)]);
        }

        const latest = latestBoard[def.key];
        const currentDate = new Date(isoDate.replace(/-/g, '/'));
        if (!Number.isNaN(currentDate.getTime())) {
          if (!latest || new Date(latest.__date.replace(/-/g, '/')) < currentDate) {
            latestBoard[def.key] = {
              __date: isoDate,
              rows: ranks.map((item) => {
                const couponSource = item.couponRaw ?? item.coupon;
                return {
                  rank: item.rank,
                  issuer: missingToNull(item.issuer) ?? null,
                  size_yi: toNumberOrNull(item.size),
                  term: missingToNull(item.term) ?? null,
                  coupon_pct: toPctString4OrNull(couponSource),
                };
              }),
            };
          }
        }
      }
    }

    const seriesEntries = Array.from(seriesMap.entries()).map(([key, payload]) => {
      const sorted = payload.data.sort((a, b) => new Date(a[0]) - new Date(b[0]));
      return {
        key,
        label: payload.label,
        data: sorted,
      };
    });

    const series = seriesEntries.map((entry) => ({
      name: `${entry.label} 票面利率(均值)`,
      data: entry.data,
    }));

    const summary = {};
    sumSizeMap.forEach((arr, key) => {
      if (!Array.isArray(arr) || !arr.length) return;
      arr.sort((a, b) => new Date(a[0]) - new Date(b[0]));
      const last = arr[arr.length - 1][1];
      summary[`${key}_sum_size`] = last;
    });

    series.forEach((serie) => {
      if (!Array.isArray(serie.data) || !serie.data.length) return;
      const baseName = serie.name.replace(/\s*票面利率\(均值\)\s*$/, '').trim();
      if (!baseName) return;
      const summaryKeyBase = baseName.replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, '');
      const lastVal = serie.data[serie.data.length - 1][1];
      if (lastVal == null || lastVal === '') return;
      const num = Number(lastVal);
      summary[`${summaryKeyBase}_avg_coupon`] = Number.isFinite(num)
        ? `${num.toFixed(4)}%`
        : String(lastVal);
    });

    const board = {};
    Object.entries(latestBoard).forEach(([key, value]) => {
      if (!value || !value.rows) return;
      board[key] = {
        date: value.__date,
        rows: [...value.rows].sort((a, b) => a.rank - b.rank),
      };
    });

    const exportInfo = {
      rows: body.length,
      last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    const rangePair = deriveRange(series);
    if (rangePair) {
      exportInfo.range = rangePair;
    }

    const meta = {
      timezone: 'Asia/Shanghai',
      sourceSheet: sheetName,
      generatedAt: new Date().toISOString(),
      unit: profile.unit || {},
      sourceSheets: [sheetName],
    };

    exportInfo.diagnostics = diagnostics;

    return {
      meta,
      series,
      summary,
      board,
      export_info: exportInfo,
      diagnostics: diagnostics.items,
    };
  }

  if (Array.isArray(profile.seriesByDateKey) && profile.seriesByDateKey.length) {
    const dateIdxMap = Object.entries(profile.dateCols || {}).reduce((acc, [key, matcher]) => {
      const idx = track(matcher, {
        category: 'date',
        label: `${key} 日期列`,
        extra: { dateKey: key },
      });
      if (idx >= 0) {
        acc[key] = idx;
        if (!diagnostics.dateCol) {
          diagnostics.dateCol = header[idx] || null;
        }
      }
      return acc;
    }, {});

    const seriesDefs = profile.seriesByDateKey
      .map((conf) => {
        const dateIdx = conf.dateKey ? dateIdxMap[conf.dateKey] ?? -1 : -1;
        const valIdx = track(conf.close, {
          category: 'series',
          label: `${conf.label || conf.summaryKey || conf.dateKey || '系列'} 收盘`,
          extra: { key: conf.summaryKey || conf.label || conf.dateKey },
        });
        if (dateIdx < 0 || valIdx < 0) return null;
        return {
          label: conf.label,
          summaryKey: conf.summaryKey,
          dateIdx,
          valIdx,
        };
      })
      .filter(Boolean);

    if (!seriesDefs.length) {
      const meta = {
        timezone: 'Asia/Shanghai',
        sourceSheet: sheetName,
        generatedAt: new Date().toISOString(),
        unit: profile.unit || {},
        sourceSheets: [sheetName],
        note: '未匹配到有效的系列配置',
      };
      return {
        meta,
        summary: {},
        series: [],
        export_info: {
          rows: 0,
          last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
          diagnostics,
        },
        diagnostics: diagnostics.items,
      };
    }

    const formatSummaryKey = (label) => {
      const slug = label.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      return (slug || label.replace(/\s+/g, '').toLowerCase()) + '_rate';
    };

    const bodyRows = rows.slice(headerRowIndex + 1);
    const enriched = bodyRows
      .map((row) => {
        if (!Array.isArray(row)) return null;
        const entries = seriesDefs.map((def) => {
          const info = normalizeDateValue(row[def.dateIdx]);
          const date = info.date || toDateSafe(info.display);
          const raw = row[def.valIdx];
          return { def, info, date, raw };
        });
        const fallback = entries.find((entry) => entry.info.display) || null;
        if (!fallback) return null;
        return { row, entries, fallback };
      })
      .filter(Boolean);

    const allDates = enriched
      .map((entry) => entry.fallback.date || toDateSafe(entry.fallback.info.display))
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));

    const rangeStrategy = profile.range || profile.rangeDefault;
    let range = null;
    if (rangeStrategy === 'prevWeekWorkdays' || rangeStrategy === 'prevWeekOnly') {
      if (allDates.length) {
        const latest = allDates.reduce((prev, cur) => (cur > prev ? cur : prev));
        const anchorDate = new Date(latest.getTime());
        const day = anchorDate.getDay() || 7;
        anchorDate.setHours(0, 0, 0, 0);
        const monday = new Date(anchorDate.getTime());
        monday.setDate(anchorDate.getDate() - (day - 1));
        const friday = new Date(monday.getTime());
        friday.setDate(monday.getDate() + 4);
        friday.setHours(23, 59, 59, 999);
        range = { start: monday, end: friday };
      } else {
        range = getPrevWeekWorkdayRange(anchor);
      }
    } else if (typeof rangeStrategy === 'string' && rangeStrategy.startsWith('lastNDays:')) {
      const n = Number(rangeStrategy.split(':')[1] || '7');
      if (allDates.length) {
        const latest = allDates.reduce((prev, cur) => (cur > prev ? cur : prev));
        const end = new Date(latest.getTime());
        end.setHours(23, 59, 59, 999);
        const start = new Date(latest.getTime());
        start.setDate(start.getDate() - Math.max(0, n - 1));
        start.setHours(0, 0, 0, 0);
        range = { start, end };
      }
    } else if (rangeStrategy && typeof rangeStrategy === 'object') {
      const start = rangeStrategy.start ? toDateSafe(rangeStrategy.start) : null;
      const end = rangeStrategy.end ? toDateSafe(rangeStrategy.end) : null;
      if (start || end) {
        range = { start, end };
      }
    }

    const inRange = (value) => {
      if (!range) return true;
      if (!value) return false;
      const date = value instanceof Date ? value : toDateSafe(value);
      if (!date || Number.isNaN(date.getTime())) return false;
      if (range.start && date < range.start) return false;
      if (range.end && date > range.end) return false;
      if (rangeStrategy === 'prevWeekWorkdays' && !isWeekday(date)) return false;
      return true;
    };

    const buckets = new Map();
    const latestByLabel = new Map();
    const usedRows = [];

    const toSortedPairs = (pairs) =>
      pairs
        .slice()
        .sort(
          (a, b) => (toDateSafe(a[0]) || new Date(a[0])) - (toDateSafe(b[0]) || new Date(b[0]))
        );

    enriched.forEach((entry) => {
      const fallbackInfo = entry.fallback.info;
      const fallbackDate = entry.fallback.date || toDateSafe(fallbackInfo.display) || null;
      const fallbackInRange = inRange(fallbackDate || fallbackInfo.display);
      const seriesInRange = entry.entries.some((item) => inRange(item.date || item.info.display));
      if (range && !fallbackInRange && !seriesInRange) {
        return;
      }

      let recorded = false;

      entry.entries.forEach(({ def, info, date, raw }) => {
        if (raw == null || raw === '') return;

        const displayDate = info.display || fallbackInfo.display;
        if (!displayDate) return;

        const dateValue = date || fallbackDate || toDateSafe(displayDate);
        if (range && !inRange(dateValue || displayDate)) {
          if (!fallbackInRange) return;
        }

        const textValue = typeof raw === 'number' ? String(raw) : String(raw).trim();
        if (!textValue) return;

        if (!buckets.has(def.label)) {
          buckets.set(def.label, []);
        }
        buckets.get(def.label).push([displayDate, textValue]);

        const summaryDate = dateValue || toDateSafe(displayDate) || null;
        latestByLabel.set(def.label, {
          text: textValue,
          value: raw,
          date: summaryDate,
        });

        recorded = true;
      });

      if (recorded) {
        usedRows.push(entry);
      }
    });

    const defByLabel = new Map(seriesDefs.map((item) => [item.label, item]));
    const series = Array.from(buckets.entries())
      .map(([label, data]) => ({
        name: label,
        data: toSortedPairs(data),
      }))
      .filter((serie) => Array.isArray(serie.data) && serie.data.length);

    const summary = {};
    series.forEach((serie) => {
      const def = defByLabel.get(serie.name);
      const summaryKey = def?.summaryKey || formatSummaryKey(serie.name);
      const latest = latestByLabel.get(serie.name);
      if (latest) {
        summary[summaryKey] =
          formatPercent4(latest.text) ||
          (typeof latest.value === 'number' ? String(latest.value) : latest.text);
      } else if (serie.data.length) {
        const last = serie.data[serie.data.length - 1][1];
        summary[summaryKey] = formatPercent4(last) || last;
      }
    });

    const exportInfo = {
      rows: usedRows.length,
      last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    const overallRange = deriveRange(series);
    if (overallRange) {
      exportInfo.range = overallRange;
    }
    exportInfo.diagnostics = diagnostics;

    const meta = {
      timezone: 'Asia/Shanghai',
      sourceSheet: sheetName,
      generatedAt: new Date().toISOString(),
      unit: profile.unit || {},
      sourceSheets: [sheetName],
    };

    if (range) {
      meta.rangeStart = range.start ? formatDate(range.start) : '';
      meta.rangeEnd = range.end ? formatDate(range.end) : '';
      if (meta.rangeStart && meta.rangeEnd) {
        const suffix = rangeStrategy === 'prevWeekWorkdays' ? '（上一周工作日）' : '';
        meta.rangeLabel = `${meta.rangeStart} ~ ${meta.rangeEnd}${suffix}`;
      }
    }

    return {
      meta,
      series,
      summary,
      export_info: exportInfo,
      diagnostics: diagnostics.items,
    };
  }
  const allowNullPoints = profile.allowNullPoints !== false;
  const seriesConfigs = Array.isArray(profile.series) ? profile.series : [];
  const seriesCols = seriesConfigs
    .map((conf) => {
      const label = conf?.label || conf?.name || conf?.key;
      if (!label) return null;
      const baseKey = conf?.key || label;
      const closeIdx =
        conf.close != null
          ? track(conf.close, {
              category: 'series',
              label: `${label} 收盘`,
              extra: { key: baseKey, field: 'close' },
            })
          : -1;
      const chgIdx =
        conf.chgPct != null
          ? track(conf.chgPct, {
              category: 'series',
              label: `${label} 涨跌幅(%)`,
              extra: { key: baseKey, field: 'chgPct' },
            })
          : conf.chg != null
          ? track(conf.chg, {
              category: 'series',
              label: `${label} 涨跌幅`,
              extra: { key: baseKey, field: 'chg' },
            })
          : -1;
      const dateIdxOverride =
        conf.dateCol != null
          ? track(conf.dateCol, {
              category: 'date',
              label: `${label} 日期`,
              extra: { key: baseKey, field: 'date' },
            })
          : -1;
      return {
        label,
        closeIdx,
        chgIdx,
        dateIdx: dateIdxOverride,
      };
    })
    .filter((item) => item && (item.closeIdx >= 0 || item.chgIdx >= 0));

  const kpiCols = (profile.kpis || [])
    .map((kpi) => ({
      key: kpi.key,
      idx: track(kpi.col, {
        category: 'kpi',
        label: `KPI ${kpi.key}`,
        extra: { field: kpi.key },
      }),
      type: kpi.type || 'text',
      allowBlank: Boolean(kpi.allowBlank),
    }))
    .filter((item) => item.key && item.idx >= 0);

  const eventsDefs = (profile.events || [])
    .map((evt) => ({
      region: evt.region || 'default',
      indices: (Array.isArray(evt.cols) ? evt.cols : [])
        .map((matcher, idx) =>
          track(matcher, {
            category: 'event',
            label: `${evt.region || 'default'} 事件列`,
            extra: { region: evt.region || 'default', index: idx },
          })
        )
        .filter((idx) => idx >= 0),
    }))
    .filter((evt) => evt.indices.length);

  const bodyRows = rows.slice(headerRowIndex + 1);
  const nonEmptyRows = bodyRows.filter(
    (row) => Array.isArray(row) && row.some((cell) => cell != null && String(cell).trim() !== '')
  );

  const candidateDates = (() => {
    const collected = [];
    nonEmptyRows.forEach((row) => {
      if (dateIdx >= 0) {
        const info = normalizeDateValue(row[dateIdx]);
        if (info.date) collected.push(info.date);
      }
      seriesCols.forEach((sc) => {
        const idx = sc.dateIdx >= 0 ? sc.dateIdx : dateIdx;
        if (idx >= 0) {
          const info = normalizeDateValue(row[idx]);
          if (info.date) collected.push(info.date);
        }
      });
    });
    return collected;
  })();

  const rangeStrategy = profile.range || profile.rangeDefault;
  const resolveRange = (strategy) => {
    if (!strategy || strategy === 'all') return null;
    if (typeof strategy === 'object') {
      const start = strategy.start ? toDateSafe(strategy.start) : null;
      const end = strategy.end ? toDateSafe(strategy.end) : null;
      if (!start && !end) return null;
      return { start, end };
    }
    const dates = candidateDates
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);
    if (!dates.length) return null;
    if (strategy === 'prevWeekWorkdays' || strategy === 'prevWeekOnly') {
      const latest = dates[dates.length - 1];
      const anchorDate = new Date(latest.getTime());
      const day = anchorDate.getDay() || 7;
      anchorDate.setHours(0, 0, 0, 0);
      const monday = new Date(anchorDate.getTime());
      monday.setDate(anchorDate.getDate() - (day - 1));
      const friday = new Date(monday.getTime());
      friday.setDate(monday.getDate() + 4);
      friday.setHours(23, 59, 59, 999);
      return { start: monday, end: friday };
    }
    if (typeof strategy === 'string' && strategy.startsWith('lastNDays:')) {
      const n = Number(strategy.split(':')[1] || '90');
      const latest = dates[dates.length - 1];
      const end = new Date(latest.getTime());
      end.setHours(23, 59, 59, 999);
      const start = new Date(latest.getTime());
      start.setDate(start.getDate() - Math.max(0, n - 1));
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    return null;
  };
  const range = resolveRange(rangeStrategy);

  const inRange = (value) => {
    if (!range) return true;
    if (!value) return false;
    const date = value instanceof Date ? value : toDateSafe(value);
    if (!date || Number.isNaN(date.getTime())) return false;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    if (rangeStrategy === 'prevWeekWorkdays' && !isWeekday(date)) return false;
    return true;
  };

  const seriesMap = new Map();
  const chgMap = new Map();
  const eventsMap = new Map();
  const kpiLastValue = new Map();

  nonEmptyRows.forEach((row) => {
    const resolveDateInfo = (idx) => {
      if (typeof idx !== 'number' || idx < 0) {
        return { date: null, display: '' };
      }
      return normalizeDateValue(row[idx]);
    };

    let fallbackInfo = resolveDateInfo(dateIdx);
    if (!fallbackInfo.display) {
      for (const sc of seriesCols) {
        const info = resolveDateInfo(sc.dateIdx >= 0 ? sc.dateIdx : dateIdx);
        if (info.display) {
          fallbackInfo = info;
          break;
        }
      }
    }

    const hasSeriesDate = seriesCols.some((sc) => {
      const info = resolveDateInfo(sc.dateIdx >= 0 ? sc.dateIdx : dateIdx);
      return Boolean(info.display);
    });

    if (!fallbackInfo.display && !hasSeriesDate) {
      return;
    }
    if (!fallbackInfo.display && hasSeriesDate) {
      const sc = seriesCols.find((item) => {
        const info = resolveDateInfo(item.dateIdx >= 0 ? item.dateIdx : dateIdx);
        return Boolean(info.display);
      });
      if (sc) {
        fallbackInfo = resolveDateInfo(sc.dateIdx >= 0 ? sc.dateIdx : dateIdx);
      }
    }

    const rowObj = { date: fallbackInfo.display || '' };
    seriesCols.forEach((sc) => {
      if (sc.closeIdx >= 0) {
        rowObj[`${sc.label}_close`] = row[sc.closeIdx];
      }
      if (sc.chgIdx >= 0) {
        rowObj[`${sc.label}_chgPct`] = row[sc.chgIdx];
      }
    });

    if (typeof profile.rowFilter === 'function' && !profile.rowFilter(rowObj)) {
      return;
    }

    const compareDate =
      fallbackInfo.date || (fallbackInfo.display ? toDateSafe(fallbackInfo.display) : null);
    const fallbackInRange = inRange(compareDate || fallbackInfo.display || null);
    const seriesInRange = seriesCols.some((sc) => {
      const info = resolveDateInfo(sc.dateIdx >= 0 ? sc.dateIdx : dateIdx);
      if (!info.display) return false;
      return inRange(info.date || info.display);
    });

    if (range && !fallbackInRange && !seriesInRange) {
      return;
    }

    const shouldProcessKpi = !range || fallbackInRange;

    kpiCols.forEach((kpi) => {
      if (kpi.idx < 0 || !shouldProcessKpi) return;
      const raw = row[kpi.idx];

      const normalizedValue = kpi.type === 'pct' ? toPctString4OrNull(raw) : missingToNull(raw);

      if (normalizedValue == null) {
        if (kpi.allowBlank) {
          const record = { value: null, date: compareDate || null };
          const existing = kpiLastValue.get(kpi.key);
          if (!existing || !existing.date || !record.date || record.date >= existing.date) {
            kpiLastValue.set(kpi.key, record);
          }
        }
        return;
      }

      const value = kpi.type === 'pct' ? normalizedValue : String(normalizedValue).trim() || null;
      if (value == null && !kpi.allowBlank) {
        return;
      }

      const record = { value, date: compareDate || null };
      const existing = kpiLastValue.get(kpi.key);
      if (!existing || !existing.date || !record.date || record.date >= existing.date) {
        kpiLastValue.set(kpi.key, record);
      }
    });

    seriesCols.forEach((sc) => {
      const info = resolveDateInfo(sc.dateIdx >= 0 ? sc.dateIdx : dateIdx);
      const dateText = info.display || fallbackInfo.display;
      if (!dateText) return;

      const dateValue = info.date || compareDate || toDateSafe(dateText);
      if (range && !inRange(dateValue || dateText)) {
        return;
      }

      if (sc.closeIdx >= 0) {
        const raw = row[sc.closeIdx];
        const isMidBond = sheetName === '中票利率';
        const value = isMidBond ? toNumberOrNull(raw) : raw;
        const isMissing = isMidBond ? value == null : raw == null || raw === '';

        if (isMissing) {
          if (allowNullPoints) {
            if (!seriesMap.has(sc.label)) {
              seriesMap.set(sc.label, { name: sc.label, data: [] });
            }
            seriesMap.get(sc.label).data.push([dateText, null]);
          }
        } else {
          if (!seriesMap.has(sc.label)) {
            seriesMap.set(sc.label, { name: sc.label, data: [] });
          }
          const storedValue = isMidBond ? value : String(raw);
          seriesMap.get(sc.label).data.push([dateText, storedValue]);
        }
      }

      if (sc.chgIdx >= 0) {
        const value2 = row[sc.chgIdx];
        const pct = formatPercent4(value2);
        if (pct) {
          if (!chgMap.has(sc.label)) {
            chgMap.set(sc.label, []);
          }
          chgMap.get(sc.label).push([dateText, pct]);
        }
      }
    });

    eventsDefs.forEach((evt) => {
      if (!shouldProcessKpi) return;
      const values = evt.indices
        .map((idx) => row[idx])
        .filter((cell) => cell != null && String(cell).trim() !== '');
      if (!values.length) return;
      if (!eventsMap.has(evt.region)) {
        eventsMap.set(evt.region, []);
      }
      eventsMap.get(evt.region).push({
        date: fallbackInfo.display || '',
        items: values.map((value) => String(value).trim()),
      });
    });
  });

  const sortPairsByDate = (pairs) =>
    pairs.sort((a, b) => {
      const da = toDateSafe(a[0]) || new Date(a[0]);
      const db = toDateSafe(b[0]) || new Date(b[0]);
      return da - db;
    });

  seriesMap.forEach((serie) => {
    serie.data = sortPairsByDate(serie.data);
  });
  chgMap.forEach((pairs, label) => {
    chgMap.set(label, sortPairsByDate(pairs));
  });

  const summary = {};
  seriesCols.forEach((sc) => {
    const closeSerie = seriesMap.get(sc.label);
    if (!closeSerie || !closeSerie.data.length) return;
    const lastClose = closeSerie.data[closeSerie.data.length - 1][1];
    if (lastClose == null || lastClose === '') return;
    const changeSerie = chgMap.get(sc.label);
    const lastChange =
      changeSerie && changeSerie.length ? changeSerie[changeSerie.length - 1][1] : null;
    summary[sc.label] = lastChange ? `${lastClose} (${lastChange})` : String(lastClose);
  });

  kpiLastValue.forEach((detail, key) => {
    summary[key] = detail?.value ?? summary[key];
  });

  const changeSeries = Array.from(chgMap.entries()).map(([label, data]) => ({
    name: `${label} 涨跌幅`,
    data,
    unit: '%',
  }));

  const events = {};
  eventsMap.forEach((entries, region) => {
    events[region] = entries;
  });

  const meta = {
    timezone: 'Asia/Shanghai',
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    unit: profile.unit || {},
    sourceSheets: [sheetName],
  };

  if (range) {
    meta.rangeStart = range.start ? formatDate(range.start) : '';
    meta.rangeEnd = range.end ? formatDate(range.end) : '';
    if (meta.rangeStart && meta.rangeEnd) {
      const suffix = rangeStrategy === 'prevWeekWorkdays' ? '（上一周工作日）' : '';
      meta.rangeLabel = `${meta.rangeStart} ~ ${meta.rangeEnd}${suffix}`;
    }
  }

  if (!seriesMap.size && !Object.keys(summary).length) {
    meta.note = meta.note || '未匹配到有效的系列数据';
  }

  const result = {
    meta,
    summary,
    series: Array.from(seriesMap.values()),
  };

  const exportInfo = {
    rows: nonEmptyRows.length,
    last_updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  const overallRange = deriveRange(result.series);
  if (overallRange) {
    exportInfo.range = overallRange;
  }
  exportInfo.diagnostics = diagnostics;
  result.export_info = exportInfo;

  if (changeSeries.length) {
    result.changeSeries = changeSeries;
  }
  if (Object.keys(events).length) {
    result.events = events;
  }

  result.diagnostics = diagnostics.items;

  return result;
}

export default parseByProfile;
