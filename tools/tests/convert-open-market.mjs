import assert from 'node:assert/strict';
import { SHEET_PROFILES } from '../../js/x2j/profiles.js';
import {
  parseOpenMarketMonetary,
  buildOpenMarketDataset,
} from '../../js/x2j/parsers/open-market.js';
import parseShibor from '../../js/x2j/parsers/shibor.js';

const openRows = [
  [
    '日期',
    '逆回购到期量',
    '逆回购7D投放量',
    '逆回购7D净投放',
    '逆回购7D利率',
    '逆回购14D投放量',
    '逆回购14D利率',
    'MLF到期量',
    'MLF投放量',
    'MLF净投放',
    'MLF利率',
    '国库定存到期量',
    '国库定存投放量',
    '国库定存净投放',
    '国库定存利率',
    '正回购到期量',
    '正回购投放量',
    '正回购利率',
  ],
  [
    '2025-09-12',
    150,
    300,
    150,
    '1.780%',
    0,
    '-',
    500,
    800,
    300,
    '2.500%',
    100,
    120,
    20,
    '2.800%',
    50,
    80,
    '2.200%',
  ],
  [
    '2025-09-19',
    200,
    280,
    80,
    '1.790%',
    null,
    null,
    400,
    600,
    200,
    '2.480%',
    120,
    150,
    30,
    '2.820%',
    40,
    70,
    '2.210%',
  ],
  [
    '2025-09-26',
    200,
    520,
    320,
    '1.820%',
    null,
    null,
    400,
    1000,
    600,
    '2.500%',
    200,
    230,
    30,
    '2.900%',
    60,
    120,
    '2.250%',
  ],
];

const shiborRows = [
  [
    'SHIBOR隔夜日期（90）',
    'SHIBOR隔夜利率',
    'SHIBOR1周利率',
    'SHIBOR2周利率',
    'SHIBOR3月日期（180）',
    'SHIBOR3月利率',
    'SHIBOR6月利率',
    'SHIBOR9月利率',
    'SHIBOR1年日期（365）',
    'SHIBOR一年利率',
  ],
  [
    '2025-06-30',
    '1.500%',
    '1.650%',
    '1.700%',
    '2025-06-30',
    '2.100%',
    '2.200%',
    '2.250%',
    '2025-06-30',
    '2.400%',
  ],
  [
    '2025-09-26',
    '1.820%',
    '1.900%',
    '1.950%',
    '2025-09-26',
    '2.220%',
    '2.310%',
    '2.350%',
    '2025-09-26',
    '2.520%',
  ],
];

const anchorDate = new Date('2025-09-28T00:00:00Z');
const omProfile = SHEET_PROFILES['公开市场货币'];
const shiborProfile = SHEET_PROFILES['Shibor利率'];

const omResult = parseOpenMarketMonetary(openRows, omProfile, {
  anchor: anchorDate,
  sheetName: '公开市场货币',
});
const shiborResult = parseShibor(shiborRows, shiborProfile, {
  sheetName: 'Shibor利率',
});

const dataset = buildOpenMarketDataset(omResult, shiborResult);

assert.ok(dataset, '组合数据集应存在');
const summary = dataset?.summary ?? {};
assert.equal(summary.r7d_amt_yi, 520, '逆回购7D投放量未正确解析');
assert.equal(summary.mlf_amt_yi, 1000, 'MLF投放量未正确解析');
assert.equal(summary.repo_amt_yi, 120, '正回购投放量未正确解析');
assert.equal(summary.r7d_expiry_yi, 200, '逆回购7D到期量未正确解析');
assert.equal(summary.r7d_net_yi, 320, '逆回购7D净投放未正确解析');
assert.equal(summary.mlf_expiry_yi, 400, 'MLF到期量未正确解析');
assert.equal(summary.mlf_net_yi, 600, 'MLF净投放未正确解析');
assert.equal(summary.repo_net_yi, 60, '正回购净投放未正确解析');
assert.equal(summary.r7d_rate_pct, 1.82, '逆回购7D利率汇总未正确解析');

const series = Array.isArray(dataset?.series) ? dataset.series : [];
assert.equal(series.length, 14, 'series 应包含 14 个条目');
const rate7d = series.find((item) => item.name === '逆回购7D利率(%)');
assert.ok(rate7d, '缺少逆回购7D利率系列');
assert.deepEqual(rate7d.data, [['2025-09-26', 1.82]]);
const shiborOn = series.find((item) => item.name === 'SHIBOR 隔夜(%)');
assert.ok(shiborOn?.data?.length, '缺少 SHIBOR 隔夜数据');
assert.deepEqual(shiborOn.data.at(-1), ['2025-09-26', 1.82]);

assert.equal(dataset?.export_info?.range, 'prevCompletedWeek', '导出范围不是 prevCompletedWeek');
assert.equal(dataset?.export_info?.source_sheet, '公开市场货币 + Shibor利率', '导出来源不正确');
assert.ok(Array.isArray(dataset?.export_info?.diagnostics?.items), 'diagnostics.om 必须为数组');
assert.ok(Array.isArray(dataset?.table), 'table 必须是数组');

console.log('convert-open-market minimal parser self-check passed');
