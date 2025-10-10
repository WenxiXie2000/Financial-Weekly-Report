import assert from 'node:assert/strict';
import parseGroupListed from '../../js/x2j/parsers/group-listed.js';
import { SHEET_PROFILES } from '../../js/x2j/profiles.js';

const pad2 = (value) => String(value).padStart(2, '0');

const profile = SHEET_PROFILES['国能上市公司'];
assert.ok(profile, 'sheet profile for 国能上市公司 is missing');

const companies = [
  { key: 'GDDL', name: '国电电力' },
  { key: 'ZGSH', name: '中国神华' },
  { key: 'LYDL', name: '龙源电力' },
  { key: 'CYDL', name: '长源电力' },
  { key: 'LYJS', name: '龙源技术' },
  { key: 'YLT', name: '英力特' },
];

const header = ['日期'];
companies.forEach((company) => {
  const name = company.name;
  header.push(`${name}收盘价`);
  header.push(`${name}涨跌幅（%）`);
  header.push(`${name}成交金额（亿元）`);
  header.push(`${name}成交金额变化（%）`);
  header.push(`${name}主力资金流向（亿元）`);
  header.push(`${name}市盈率（倍）`);
  header.push(`${name}市净率（倍）`);
  header.push(`${name}每日偏离值（%）`);
  header.push(`${name}换手率比值（%）`);
});

const startDate = new Date('2025-09-22T00:00:00Z');
const rows = [header];

for (let day = 0; day < 5; day += 1) {
  const date = new Date(startDate.getTime() + day * 86400000);
  const iso = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  const row = [iso];
  companies.forEach((company, index) => {
    const baseClose = 10 + index * 2 + day * 0.11;
    row.push(baseClose.toFixed(2));

    const chg = 0.1 * (day + 1) + index * 0.05;
    row.push(`${chg.toFixed(2)}%`);

    const amount = 100 + index * 12 + day;
    row.push(amount.toFixed(1));

    const amountChg = 0.6 * (day + 1) + index * 0.12;
    row.push(`${amountChg.toFixed(2)}%`);

    const mainflow = (index % 2 === 0 ? 45 : -32) + day * 1.5;
    row.push(mainflow.toFixed(1));

    const pe = 15 + index * 1.8 + day * 0.2;
    row.push(pe.toFixed(2));

    const pb = 1.2 + index * 0.15 + day * 0.05;
    row.push(pb.toFixed(2));

    const bias = 0.2 * (day + 1) + index * 0.04;
    row.push(`${bias.toFixed(2)}%`);

    const tratio = 1 + index * 0.1 + day * 0.3;
    row.push(`${tratio.toFixed(2)}%`);
  });
  rows.push(row);
}

const result = parseGroupListed(rows, profile, {
  anchor: new Date('2025-09-29T00:00:00Z'),
  sheetName: '国能上市公司',
});

assert.equal(result.series.length, companies.length * 9, 'each company should produce nine series');

const gddlClose = result.series.find((s) => s.name === '国电电力 收盘价');
assert.ok(gddlClose, 'missing 国电电力 收盘价 series');
assert.equal(gddlClose.data.length, 5, '收盘 series should follow week length');
assert.deepEqual(
  gddlClose.data[0],
  ['2025-09-22', Number((10 + 0 * 2 + 0 * 0.11).toFixed(2))],
  'first close point mismatch'
);

const zgshChg = result.series.find((s) => s.name === '中国神华 涨跌幅(%)');
assert.ok(zgshChg, 'missing 中国神华 涨跌幅 series');
assert.equal(zgshChg.data[1][1], Number((0.1 * 2 + 1 * 0.05).toFixed(2)), '涨跌幅 parsing error');

const cydlFlow = result.series.find((s) => s.name === '长源电力 主力资金流向(亿)');
assert.ok(cydlFlow, 'missing 长源电力 主力资金流向 series');
assert.ok(
  cydlFlow.data.some(([, v]) => v < 0),
  '主力资金流向 should preserve negative numbers'
);

assert.equal(result.table.length, 5, 'table should retain filtered rows');
assert.ok(
  Object.prototype.hasOwnProperty.call(result.table[0], '国电电力收盘价'),
  'table should keep original column headers'
);

assert.equal(result.export_info.rows, 5, 'export rows mismatch');
assert.deepEqual(
  result.export_info.range_window,
  ['2025-09-22', '2025-09-26'],
  'range window should cover the week'
);

const diagnostics = result.export_info?.diagnostics;
assert.ok(diagnostics, 'diagnostics missing from export_info');
const unmatched = Array.isArray(diagnostics.hits)
  ? diagnostics.hits.filter((item) => !item.matched)
  : [];
assert.equal(unmatched.length, 0, 'all metrics should match columns');

console.log('convertGroupListed self-check passed');
