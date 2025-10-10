import assert from 'node:assert/strict';
import { SHEET_PROFILES } from '../../js/x2j/profiles.js';
import parseCnyFx from '../../js/x2j/parsers/cny-fx.js';

const testAnchor = new Date('2025-09-29T00:00:00Z');

const profile = SHEET_PROFILES['人民币汇率'];
assert.ok(profile, 'sheet profile for 人民币汇率 is missing');

const header = [
  '日期',
  '人民币兑美元汇率（汇率）',
  '人民币兑美元涨跌幅（%）',
  '人民币兑美元央行中间价',
  '人民币兑美元央行中间价调整情况',
  '离岸人民币兑美元汇率',
  '离岸人民币兑美元涨跌幅（%）',
  '人民币兑欧元汇率',
  '人民币兑欧元涨跌幅（%）',
  '人民币兑欧元央行中间价',
  '人民币兑欧元央行中间价调整情况',
  '人民币兑100日元汇率',
  '人民币兑100日元涨跌幅（%）',
  '人民币兑100日元央行中间价',
  '人民币兑100日元央行中间价调整情况',
  '人民币兑澳元汇率',
  '人民币兑澳元涨跌幅（%）',
  '人民币兑澳元央行中间价',
  '人民币兑澳元央行中间价调整情况',
];

const makeRow = (
  date,
  [usd, usdChg, usdMid, usdMidChg],
  [cnh, cnhChg],
  [eur, eurChg, eurMid, eurMidChg],
  [jpy, jpyChg, jpyMid, jpyMidChg],
  [aud, audChg, audMid, audMidChg]
) => [
  date,
  usd,
  usdChg,
  usdMid,
  usdMidChg,
  cnh,
  cnhChg,
  eur,
  eurChg,
  eurMid,
  eurMidChg,
  jpy,
  jpyChg,
  jpyMid,
  jpyMidChg,
  aud,
  audChg,
  audMid,
  audMidChg,
];

const rows = [
  header,
  makeRow(
    '2025-09-22',
    [7.1201, '0.0800%', 7.1001, '0.0200%'],
    [7.132, '0.0700%'],
    [7.8605, '-0.0500%', 7.842, '-0.0300%'],
    [5.2101, '0.0100%', 5.19, '0.0050%'],
    [4.6123, '0.0200%', 4.59, '0.0100%']
  ),
  makeRow(
    '2025-09-23',
    [7.1185, '-0.0500%', 7.102, '-0.0100%'],
    [7.1255, '-0.0400%'],
    [7.8503, '0.0200%', 7.8325, '0.0100%'],
    [5.2052, '-0.0150%', 5.185, '-0.0080%'],
    [4.6082, '-0.0300%', 4.585, '-0.0150%']
  ),
  makeRow(
    '2025-09-24',
    [7.115, '-0.0300%', 7.099, '-0.0050%'],
    [7.1208, '-0.0200%'],
    [7.8481, '0.0150%', 7.83, '0.0080%'],
    [5.202, '0.0120%', 5.1825, '0.0060%'],
    [4.605, '0.0250%', 4.582, '0.0120%']
  ),
  makeRow(
    '2025-09-25',
    [7.1102, '-0.0200%', 7.095, '-0.0040%'],
    [7.118, '-0.0150%'],
    [7.8425, '-0.0100%', 7.825, '-0.0060%'],
    [5.1988, '0.0080%', 5.179, '0.0040%'],
    [4.601, '0.0180%', 4.578, '0.0090%']
  ),
  makeRow(
    '2025-09-26',
    [7.1055, '-0.0180%', 7.092, '-0.0030%'],
    [7.1122, '-0.0120%'],
    [7.838, '-0.0150%', 7.82, '-0.0090%'],
    [5.195, '0.0070%', 5.175, '0.0030%'],
    [4.5985, '0.0160%', 4.5755, '0.0070%']
  ),
];

const result = parseCnyFx(rows, profile, { anchor: testAnchor });

assert.equal(result.series.length >= 6, true, 'series should include currency metrics');
const seriesNames = result.series.map((item) => item.name);
assert.ok(seriesNames.includes('人民币兑美元 汇率'), 'missing USD rate series');
assert.ok(seriesNames.includes('人民币兑美元 涨跌幅(%)'), 'missing USD change series');
assert.ok(seriesNames.includes('人民币兑欧元 央行中间价'), 'missing EUR mid series');
assert.ok(seriesNames.includes('人民币兑澳元 央行中间价调整(%)'), 'missing AUD mid change series');

const usdRateSeries = result.series.find((item) => item.name === '人民币兑美元 汇率');
assert.equal(usdRateSeries.data.length, 5, 'USD rate series should have 5 points');
assert.deepEqual(usdRateSeries.data[0], ['2025-09-22', 7.1201]);

assert.equal(result.kpis.usdcny_mid, '7.0920', 'USD mid KPI');
assert.equal(result.kpis.usdcny_mid_chg, '-0.0030%', 'USD mid change KPI');
assert.equal(result.kpis.cnhusd_mid, null, 'CNH mid KPI should be null');
assert.equal(result.export_info.rows, 5, 'export rows count mismatch');
assert.ok(Array.isArray(result.table) && result.table.length === 5, 'table should keep 5 rows');
assert.ok(
  result.diagnostics.some((d) => d.label === '人民币兑美元汇率' && d.matched),
  'diagnostics should mark USD rate matched'
);

console.log('convertCnyFx self-check passed');
