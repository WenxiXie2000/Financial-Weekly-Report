import { getOutputFile } from "../js/xlsx2json/core.js";
import { cloneDiagnostics } from "./xlsx-to-json-utils.js";

export const OPEN_MARKET_PATTERN = /公开市场/;

export function buildDiagnosticsMap(coreResult) {
  const diagnosticsBySheet = new Map();
  const buckets = new Map();

  const rawDiagnostics = Array.isArray(coreResult?.diagnostics)
    ? coreResult.diagnostics
    : [];

  rawDiagnostics.forEach((diag) => {
    const cloned = cloneDiagnostics(diag);
    if (!cloned) return;
    const key = String(cloned.sheet || "").trim();
    if (!key) return;
    if (diagnosticsBySheet.has(key)) {
      diagnosticsBySheet.get(key).items.push(...cloned.items);
    } else {
      diagnosticsBySheet.set(key, cloned);
    }
  });

  const details = Array.isArray(coreResult?.details) ? coreResult.details : [];

  details.forEach((detail) => {
    if (!detail || !detail.outputFile) return;
    const candidates = [detail.normalizedSheetName, detail.sheetName]
      .map((name) => (name == null ? "" : String(name).trim()))
      .filter(Boolean);
    if (!candidates.length) return;

    const bucket = buckets.get(detail.outputFile) || [];
    let appended = false;

    candidates.forEach((name) => {
      const diag = diagnosticsBySheet.get(name);
      if (diag && !bucket.includes(diag)) {
        bucket.push(diag);
        appended = true;
      }
    });

    if (appended) {
      buckets.set(detail.outputFile, bucket);
    }
  });

  diagnosticsBySheet.forEach((diag, sheetName) => {
    let fileName = getOutputFile(sheetName);
    if (!fileName && OPEN_MARKET_PATTERN.test(sheetName)) {
      fileName = "open_market.json";
    }
    if (!fileName) return;
    const bucket = buckets.get(fileName) || [];
    if (!bucket.includes(diag)) {
      bucket.push(diag);
      buckets.set(fileName, bucket);
    }
  });

  return buckets;
}
