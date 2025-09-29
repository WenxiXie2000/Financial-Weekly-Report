/**
 * @typedef {[string, (number|null)]} TimeSeriesPoint
 * Date-value pair where the first entry is an ISO date string.
 */

/**
 * @typedef {Object} NamedSeries
 * @property {string} name
 * @property {Array<TimeSeriesPoint>} data
 * @property {string} [unit]
 */

/**
 * @typedef {Object} GenericMeta
 * @property {string} timezone
 * @property {string} sourceSheet
 * @property {string} generatedAt
 * @property {Array<string>} sourceSheets
 * @property {Record<string, string>} [unit]
 * @property {string} [rangeStrategy]
 * @property {string} [note]
 */

/**
 * @typedef {Object} CnyFxDiagnosticEntry
 * @property {string} category
 * @property {string} label
 * @property {string} metric
 * @property {string} matcher
 * @property {boolean} matched
 * @property {string|null} column
 * @property {Array<string>} closest
 * @property {number} points
 * @property {Array<string>} dateRange
 */

/**
 * @typedef {Object} CnyFxExportDiagnostics
 * @property {string} sheet
 * @property {string|null} dateCol
 * @property {string} range
 * @property {Array<CnyFxDiagnosticEntry>} items
 */

/**
 * @typedef {Object} CnyFxExportInfo
 * @property {string} source_sheet
 * @property {string} range
 * @property {number} rows
 * @property {Array<string>} range_window
 * @property {string} last_updated
 * @property {CnyFxExportDiagnostics} diagnostics
 */

/**
 * @typedef {Object} CnyFxJson
 * @property {GenericMeta} meta
 * @property {Record<string, unknown>} summary
 * @property {Array<NamedSeries>} series
 * @property {Array<Record<string, unknown>>} table
 * @property {Record<string, (string|null)>} kpis
 * @property {CnyFxExportInfo} export_info
 * @property {Array<CnyFxDiagnosticEntry>} diagnostics
 */

/**
 * @typedef {Object} GroupListedJson
 * @property {GenericMeta} meta
 * @property {Record<string, unknown>} summary
 * @property {Array<NamedSeries>} series
 * @property {Array<Record<string, unknown>>} table
 * @property {{ source_sheet: string, range: string, rows: number, range_window: Array<string>, last_updated: string, diagnostics: Record<string, unknown> }} export_info
 * @property {Array<CnyFxDiagnosticEntry>} diagnostics
 */

/**
 * @typedef {Object} OpenMarketSummary
 * @property {(number|null)} r7d_amt_yi
 * @property {(number|null)} r14d_amt_yi
 * @property {(number|null)} mlf_amt_yi
 * @property {(number|null)} tcd_amt_yi
 * @property {(number|null)} slf_amt_yi
 * @property {(number|null)} slo_amt_yi
 * @property {(number|null)} repo_amt_yi
 */

/**
 * @typedef {Object} OpenMarketExportInfo
 * @property {string} source_sheet
 * @property {string} range
 * @property {Record<string, unknown>} diagnostics
 * @property {string} last_updated
 * @property {Array<string>} [range_window]
 */

/**
 * @typedef {Object} OpenMarketJson
 * @property {OpenMarketSummary} summary
 * @property {Array<NamedSeries>} series
 * @property {Array<Record<string, unknown>>} table
 * @property {OpenMarketExportInfo} export_info
 */

/**
 * @typedef {Object} OpenMarketMonetaryFragment
 * @property {OpenMarketSummary} summary
 * @property {Array<Record<string, unknown>>} diagnostics
 * @property {Array<NamedSeries>} rateSeries
 * @property {Array<Record<string, unknown>>} table
 * @property {Array<string>} rangeWindow
 */

/**
 * @typedef {Object} BondYieldBoardRow
 * @property {number} rank
 * @property {string|null} issuer
 * @property {(number|null)} size_yi
 * @property {string|null} term
 * @property {string|null} coupon_pct
 */

/**
 * @typedef {Object} BondYieldBoardEntry
 * @property {string} date
 * @property {Array<BondYieldBoardRow>} rows
 */

/**
 * @typedef {Object} BondYieldJson
 * @property {GenericMeta} meta
 * @property {Array<NamedSeries>} series
 * @property {Record<string, unknown>} summary
 * @property {Record<string, BondYieldBoardEntry>} board
 * @property {{ rows: number, last_updated: string, range?: Array<string> }} export_info
 */

/**
 * @typedef {Object} ProfileJson
 * @property {GenericMeta} meta
 * @property {Record<string, unknown>} summary
 * @property {Array<NamedSeries>} series
 * @property {Array<Record<string, unknown>>} [table]
 * @property {Record<string, unknown>} [export_info]
 * @property {Record<string, unknown>} [board]
 */

/**
 * @typedef {Object} ShiborJson
 * @property {GenericMeta} meta
 * @property {Record<string, unknown>} summary
 * @property {Array<NamedSeries & { unit?: string }>} series
 * @property {{ source_sheet: string, rows: number, last_updated: string, diagnostics: Record<string, unknown>, range?: Array<string> }} export_info
 */

/**
 * @typedef {Object} SheetParseDetail
 * @property {string} sheetName
 * @property {string} normalizedSheetName
 * @property {string|null} outputFile
 * @property {"cny_fx"|"group_listed"|"open_market_monetary"|"open_market_shibor"|"profile"|"unknown"} kind
 * @property {unknown} payload
 */

/**
 * @typedef {Object} ConvertSheetsResult
 * @property {Map<string, unknown>} files
 * @property {Array<SheetParseDetail>} details
 */

/**
 * @typedef {Object} RunArrayBufferResult
 * @property {Map<string, unknown>} files
 * @property {Array<SheetParseDetail>} details
 * @property {Array<string>} sheetNames
 * @property {Array<[string, Array<Array<unknown>>]>} rows
 * @property {unknown} workbook
 */

export {};
