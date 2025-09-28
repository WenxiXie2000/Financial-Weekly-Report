import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { prevCompletedWeekRange, mondayOf, fridayOf } from "../../js/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.resolve(__dirname, "../../index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("(function () {");
if (start === -1) {
  throw new Error("parser IIFE not found in index.html");
}
const end = html.indexOf("})();", start);
if (end === -1) {
  throw new Error("IIFE terminator not found in index.html");
}
const snippet = html.slice(start, end + 5);

const sandbox = {
  window: {},
  console,
  prevCompletedWeekRange,
  mondayOf,
  fridayOf,
  anchor: new Date("2025-09-28T00:00:00Z"),
};

vm.createContext(sandbox);
vm.runInContext(snippet, sandbox);

const parseMinimal = sandbox.window.__parseOpenMarketShiborMinimal;
assert.equal(
  typeof parseMinimal,
  "function",
  "__parseOpenMarketShiborMinimal should be defined"
);

const openRows = [
  [
    "日期",
    "逆回购7D投放量",
    "逆回购7D利率",
    "逆回购14D投放量",
    "逆回购14D利率",
    "MLF投放量",
    "MLF利率",
    "国库定存投放量",
    "国库定存利率",
    "正回购投放量",
    "正回购利率",
  ],
  ["2025-09-12", 300, "1.780%", 0, "-", 800, "2.500%", null, null, null, null],
  [
    "2025-09-19",
    520,
    "1.800%",
    null,
    null,
    1000,
    "2.500%",
    null,
    null,
    null,
    null,
  ],
];

const shiborRows = [
  [
    "SHIBOR隔夜日期（90）",
    "SHIBOR隔夜利率",
    "SHIBOR1周利率",
    "SHIBOR2周利率",
    "SHIBOR3月日期（180）",
    "SHIBOR3月利率",
    "SHIBOR6月利率",
    "SHIBOR9月利率",
    "SHIBOR1年日期（365）",
    "SHIBOR一年利率",
  ],
  [
    "2025-06-30",
    "1.500%",
    "1.650%",
    "1.700%",
    "2025-06-30",
    "2.100%",
    "2.200%",
    "2.250%",
    "2025-06-30",
    "2.400%",
  ],
  [
    "2025-09-26",
    "1.820%",
    "1.900%",
    "1.950%",
    "2025-09-26",
    "2.220%",
    "2.310%",
    "2.350%",
    "2025-09-26",
    "2.520%",
  ],
];

const anchorDate = new Date("2025-09-28T00:00:00Z");
const result = parseMinimal(openRows, shiborRows, anchorDate);

assert.equal(result.filename, "open_market.json");
const summary = result.json?.summary ?? {};
assert.equal(summary.r7d_amt_yi, 520, "逆回购7D投放量未正确解析");
assert.equal(summary.mlf_amt_yi, 1000, "MLF投放量未正确解析");
assert.equal(summary.repo_amt_yi, null, "正回购投放量应为 null");

const series = Array.isArray(result.json?.series) ? result.json.series : [];
assert.equal(series.length, 14, "series 应包含 14 个条目");
const rate7d = series.find((item) => item.name === "逆回购7D利率(%)");
assert.ok(rate7d, "缺少逆回购7D利率系列");
assert.deepEqual(rate7d.data, [["2025-09-19", 1.8]]);
const shiborOn = series.find((item) => item.name === "SHIBOR 隔夜(%)");
assert.ok(shiborOn?.data?.length, "缺少 SHIBOR 隔夜数据");
assert.deepEqual(shiborOn.data.at(-1), ["2025-09-26", 1.82]);

assert.equal(
  result.json?.export_info?.range,
  "prevCompletedWeek",
  "导出范围不是 prevCompletedWeek"
);
assert.equal(
  result.json?.export_info?.source_sheet,
  "公开市场货币 + Shibor利率",
  "导出来源不正确"
);
assert.ok(
  Array.isArray(result.json?.export_info?.diagnostics?.om),
  "diagnostics.om 必须为数组"
);
assert.ok(Array.isArray(result.json?.table), "table 必须是数组");

console.log("convert-open-market minimal parser self-check passed");
