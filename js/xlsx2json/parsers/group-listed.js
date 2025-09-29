import {
  computePrevWeekWorkdays,
  fmtISO,
  parseNumberLike,
  parsePercentNumber,
  deriveRange,
  createSheetDiagnostics,
  trackColumn,
} from "./common.js";

/**
 * @typedef {import("../types.js").GroupListedJson} GroupListedJson
 */

const DEFAULT_SHEET_NAME = "国能上市公司";

export function parseGroupListed(
  rows,
  profile = {},
  { anchor = new Date(), sheetName = DEFAULT_SHEET_NAME } = {}
) {
  const headerRowIndex = Number.isInteger(profile?.headerRow)
    ? Math.max(0, profile.headerRow)
    : 0;
  const header = rows[headerRowIndex] || [];
  const body = rows
    .slice(headerRowIndex + 1)
    .filter(
      (row) =>
        Array.isArray(row) &&
        row.some(
          (cell) =>
            cell !== undefined && cell !== null && String(cell).trim() !== ""
        )
    );

  const diagnostics = createSheetDiagnostics(sheetName);
  diagnostics.range = "prevWeekWorkdays";

  const dateIdx = trackColumn(diagnostics, header, profile?.dateCol ?? "", {
    category: "date",
    label: "日期列",
    allowMissing: false,
  });

  if (dateIdx < 0) {
    throw new Error(`${sheetName}：未找到日期列`);
  }

  let weekRows = computePrevWeekWorkdays(body, dateIdx, anchor)
    .map((item) => ({ ...item, iso: fmtISO(item.date) }))
    .sort((a, b) => a.date - b.date);

  if (typeof profile?.rowFilter === "function") {
    weekRows = weekRows.filter((item) => profile.rowFilter({ date: item.iso }));
  }

  diagnostics.dateCol = header[dateIdx] || null;
  const dateEntry = diagnostics.items[diagnostics.items.length - 1] || null;
  if (dateEntry) {
    dateEntry.extra = {
      ...(dateEntry.extra || {}),
      points: weekRows.length,
      dateRange:
        weekRows.length >= 2
          ? [weekRows[0].iso, weekRows[weekRows.length - 1].iso]
          : [],
    };
  }

  const metricDefs = [
    {
      key: "close",
      suffix: " 收盘",
      label: "收盘",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "chg",
      suffix: " 涨跌幅(%)",
      label: "涨跌幅(%)",
      parser: parsePercentNumber,
      isPct: true,
    },
    {
      key: "amount",
      suffix: " 成交金额(亿)",
      label: "成交金额(亿)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "amount_chg",
      suffix: " 成交金额变化(%)",
      label: "成交金额变化(%)",
      parser: parsePercentNumber,
      isPct: true,
    },
    {
      key: "mainflow",
      suffix: " 主力资金流向(亿)",
      label: "主力资金流向(亿)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "pe",
      suffix: " 市盈率(倍)",
      label: "市盈率(倍)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "pb",
      suffix: " 市净率(倍)",
      label: "市净率(倍)",
      parser: parseNumberLike,
      isPct: false,
    },
    {
      key: "dev",
      suffix: " 每日偏离值",
      label: "每日偏离值",
      parser: (value) => parsePercentNumber(value) ?? parseNumberLike(value),
      isPct: false,
    },
    {
      key: "turn_ratio",
      suffix: " 换手率比值",
      label: "换手率比值",
      parser: (value) => parsePercentNumber(value) ?? parseNumberLike(value),
      isPct: false,
    },
  ];

  const series = [];

  (profile?.stocks || []).forEach((stock) => {
    const name = String(stock || "").trim();
    if (!name) return;

    metricDefs.forEach((metric) => {
      const matcherFactory = profile?.cols?.[metric.key];
      const matcher =
        typeof matcherFactory === "function" ? matcherFactory(name) : null;

      const idx = trackColumn(diagnostics, header, matcher ?? "", {
        category: "series",
        label: `${name} ${metric.label}`,
        note: matcher == null ? "未配置匹配规则" : undefined,
        extra: {
          metric: metric.key,
          stock: name,
        },
      });

      const diagEntry = diagnostics.items[diagnostics.items.length - 1] || null;

      const data = weekRows.map((item) => {
        const value = idx >= 0 ? item.row?.[idx] : null;
        if (value === "" || value == null) {
          return [item.iso, null];
        }

        let parsed = metric.parser(value);
        if (
          metric.isPct &&
          typeof value === "string" &&
          value.endsWith("%") &&
          (parsed == null || Number.isNaN(parsed))
        ) {
          parsed = parseFloat(value.slice(0, -1));
        }
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

      series.push({ name: `${name}${metric.suffix}`, data });
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

  const rangeWindow =
    weekRows.length >= 2
      ? [weekRows[0].iso, weekRows[weekRows.length - 1].iso]
      : [];

  const diagnosticEntries = diagnostics.items.map((item) => {
    const extra = item.extra || {};
    return {
      category: item.category || "series",
      label: item.label,
      matcher: item.matcher,
      matched: Boolean(item.matched),
      column: item.column || null,
      index: typeof item.index === "number" ? item.index : null,
      closest: Array.isArray(item.closest) ? item.closest : [],
      metric: extra.metric || "",
      points: typeof extra.points === "number" ? extra.points : 0,
      dateRange: Array.isArray(extra.dateRange) ? extra.dateRange : [],
    };
  });

  const exportInfo = {
    source_sheet: sheetName,
    range: "prevWeekWorkdays",
    rows: weekRows.length,
    range_window: rangeWindow,
    last_updated: new Date().toISOString().slice(0, 19).replace("T", " "),
    diagnostics,
  };

  const meta = {
    timezone: "Asia/Shanghai",
    sourceSheet: sheetName,
    generatedAt: new Date().toISOString(),
    rangeStrategy: "prevWeekWorkdays",
    sourceSheets: [sheetName],
  };

  return {
    meta,
    summary: {},
    series,
    table,
    export_info: exportInfo,
    diagnostics: diagnosticEntries,
  };
}

export default parseGroupListed;
