import parseShibor from '../js/x2j/parsers/shibor.js';
import { buildOpenMarketDataset } from '../js/x2j/parsers/open-market.js';
import { SHEET_PROFILES } from '../js/x2j/profiles.js';

const openRows = [
  [
    '日期',
    '逆回购7D投放量',
    '逆回购7D利率',
    '逆回购14D投放量',
    '逆回购14D利率',
    'MLF投放量',
    'MLF利率',
    '国库定存投放量',
    '国库定存利率',
    '正回购投放量',
    '正回购利率',
  ],
  ['2025-09-12', 300, '1.780%', 0, '-', 800, '2.500%', null, null, null, null],
  ['2025-09-19', 280, '1.790%', null, null, 600, '2.480%', null, null, null, null],
  ['2025-09-26', 520, '1.820%', null, null, 1000, '2.500%', null, null, null, null],
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

const shiborProfile = SHEET_PROFILES['Shibor利率'];
const omProfile = SHEET_PROFILES['公开市场货币'];

import parseOpenMarket from '../js/x2j/parsers/open-market.js';

// parseOpenMarket default export contains parseOpenMarketMonetary but easier to import directly
import { parseOpenMarketMonetary } from '../js/x2j/parsers/open-market.js';

const omResult = parseOpenMarketMonetary(openRows, omProfile, {
  anchor: new Date('2025-09-28T00:00:00Z'),
  sheetName: '公开市场货币',
});
const shiborResult = parseShibor(shiborRows, shiborProfile, {
  sheetName: 'Shibor利率',
});

const dataset = buildOpenMarketDataset(omResult, shiborResult);
console.log('series length', dataset.series.length);
console.log(dataset.series.map((s) => ({ name: s.name, points: s.data.length })));
