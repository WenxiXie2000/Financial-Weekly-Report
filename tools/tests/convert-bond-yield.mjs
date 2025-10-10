import assert from 'node:assert/strict';
import parseBondYield from '../../js/x2j/parsers/bond-yield.js';
import { SHEET_PROFILES } from '../../js/x2j/profiles.js';

const profile = SHEET_PROFILES['债券利率'];
assert.ok(profile, 'sheet profile for 债券利率 is missing');

const fieldSuffix = {
  issuer: '公司简称',
  size: '发行规模（亿元）',
  term: '发行期限(年)',
  coupon: '票面利率（%）',
};

const header = ['日期'];
const descriptors = [];

profile.bondGroups.forEach((group, groupIndex) => {
  const [rankStart, rankEnd] =
    Array.isArray(group.rankRange) && group.rankRange.length === 2 ? group.rankRange : [1, 5];
  for (let rank = rankStart; rank <= rankEnd; rank += 1) {
    Object.entries(fieldSuffix).forEach(([field, suffix]) => {
      const label = `${group.label}${rank}${suffix}`;
      header.push(label);
      descriptors.push({ groupKey: group.key, groupIndex, rank, field });
    });
  }
});

const createRow = (isoDate, valueResolver) => {
  const row = [isoDate];
  descriptors.forEach((desc) => {
    const value = valueResolver(desc);
    row.push(value == null ? null : value);
  });
  return row;
};

const rows = [header];

rows.push(
  createRow('2025-09-23', ({ groupKey, rank, field }) => {
    if (groupKey === 'aaa_3y' && field === 'issuer') {
      return `AAA3Y-${rank}-企业A`;
    }
    if (groupKey === 'aaa_3y' && field === 'size') {
      return 100 + rank;
    }
    if (groupKey === 'aaa_3y' && field === 'term') {
      return `${3 + rank}Y`;
    }
    if (groupKey === 'aaa_3y' && field === 'coupon') {
      return `${3 + rank * 0.05}%`;
    }

    if (groupKey === 'cp_short' && field === 'issuer') {
      return `CP短融${rank}`;
    }
    if (groupKey === 'cp_short' && field === 'size') {
      return (50 + rank * 2).toFixed(1);
    }
    if (groupKey === 'cp_short' && field === 'term') {
      return `${90 + rank * 5}D`;
    }
    if (groupKey === 'cp_short' && field === 'coupon') {
      return `${2.5 + rank * 0.07}%`;
    }

    return null;
  })
);

rows.push(
  createRow('2025-09-26', ({ groupKey, rank, field }) => {
    if (groupKey === 'aaa_3y') {
      if (field === 'issuer') return `AAA3Y-${rank}-企业B`;
      if (field === 'size') return 120 + rank * 3;
      if (field === 'term') return `${5 + rank}Y`;
      if (field === 'coupon') return `${3.1 + rank * 0.08}%`;
    }

    if (groupKey === 'cp_short') {
      if (field === 'issuer') return `短融${rank}号（示例）`;
      if (field === 'size') return 60 + rank * 1.5;
      if (field === 'term') return `${80 + rank * 3}D`;
      if (field === 'coupon') return `${2.7 + rank * 0.05}%`;
    }

    return null;
  })
);

const result = parseBondYield(rows, profile, {
  anchor: new Date('2025-09-29T00:00:00Z'),
  sheetName: '债券利率',
});

assert.ok(result, 'parser should return payload');
assert.ok(result.top5_latest, 'top5_latest is missing');

const groupsCount = profile.bondGroups.length;
assert.equal(
  Object.keys(result.top5_latest).length,
  groupsCount,
  'top5_latest should track every configured bond group'
);

const aaa3y = result.top5_latest.aaa_3y;
assert.ok(aaa3y, 'AAA公司债3年 group missing');
assert.equal(aaa3y.rows.length, 5, 'AAA公司债3年 should keep rank range');

const aaaRank2 = aaa3y.rows.find((item) => item.rank === 2);
assert.ok(aaaRank2, 'rank 2 entry missing');
assert.equal(aaaRank2.issuer, 'AAA3Y-2-企业B', 'issuer should come from representative row');
assert.equal(aaaRank2.size_yi, 126, 'size should parse as number');
assert.equal(aaaRank2.term, '7Y', 'term should remain string');
assert.equal(aaaRank2.coupon_pct, '3.2600%', 'coupon should format to four decimals');

const cpShort = result.top5_latest.cp_short;
assert.ok(cpShort, '短融 group missing');
assert.equal(cpShort.rows[0].issuer, '短融1号（示例）', 'should match ASCII/全角 parentheses');

assert.equal(result.export_info.rows, 2, 'export rows should match filtered entries');
assert.deepEqual(
  result.export_info.range_window,
  ['2025-09-22', '2025-09-26'],
  'range window should reflect previous week'
);

const dateLabel = aaa3y.date;
assert.equal(
  dateLabel,
  '25-09-22～25-09-26',
  'top5 date label should trim century and join with tilde'
);

console.log('convertBondYield self-check passed');
