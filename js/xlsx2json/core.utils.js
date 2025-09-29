export function cloneDataset(data) {
  return data == null ? null : JSON.parse(JSON.stringify(data));
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function cloneDiagnostics(diag, fallbackSheet) {
  if (!diag || !Array.isArray(diag.items)) return null;
  const sheetName = diag.sheet || (fallbackSheet != null ? String(fallbackSheet) : '');
  const cloned = {
    sheet: sheetName,
    items: diag.items.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const clonedEntry = { ...item };
      if (Array.isArray(item.closest)) {
        clonedEntry.closest = [...item.closest];
      }
      if (item.extra && typeof item.extra === 'object') {
        clonedEntry.extra = { ...item.extra };
      }
      return clonedEntry;
    }),
  };
  if (Object.prototype.hasOwnProperty.call(diag, 'dateCol')) {
    cloned.dateCol = diag.dateCol ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(diag, 'range')) {
    cloned.range = diag.range ?? null;
  }
  return cloned;
}

export function dedupeSortedPairs(pairs) {
  const result = [];
  for (const point of pairs) {
    if (!Array.isArray(point) || point.length === 0) continue;
    const key = point[0];
    if (result.length && result[result.length - 1][0] === key) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }
  return result;
}

export function mergeSeries(targetList = [], incomingList = []) {
  const map = new Map();
  targetList.forEach((serie) => {
    if (!serie || !serie.name) return;
    const clone = {
      ...serie,
      data: ensureArray(serie.data).map((item) => (Array.isArray(item) ? [...item] : item)),
    };
    map.set(serie.name, clone);
  });

  incomingList.forEach((serie) => {
    if (!serie || !serie.name) return;
    const existing = map.get(serie.name);
    const incomingData = ensureArray(serie.data).map((item) =>
      Array.isArray(item) ? [...item] : item
    );
    if (existing) {
      const merged = ensureArray(existing.data)
        .concat(incomingData)
        .filter((item) => Array.isArray(item) && item.length >= 2)
        .sort((a, b) => new Date(a[0]) - new Date(b[0]));
      existing.data = dedupeSortedPairs(merged);
    } else {
      map.set(serie.name, {
        ...serie,
        data: incomingData,
      });
    }
  });

  return Array.from(map.values());
}
