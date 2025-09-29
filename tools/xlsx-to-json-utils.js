const STORAGE_KEY = "__conversionAnchor";

export function getAnchorFromUrl() {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("anchor");
    if (!raw) return null;
    const candidate = new Date(`${raw}T00:00:00`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  } catch (error) {
    console.warn("[tool][anchor] URL 解析失败", error);
    return null;
  }
}

export function getConversionAnchor() {
  if (typeof window === "undefined") {
    return new Date();
  }
  const preset = window[STORAGE_KEY];
  if (preset instanceof Date && !Number.isNaN(preset.getTime())) {
    return preset;
  }
  const fromUrl = getAnchorFromUrl();
  const anchor = fromUrl || new Date();
  anchor.setHours(0, 0, 0, 0);
  window[STORAGE_KEY] = anchor;
  return anchor;
}

export function cloneDiagnostics(diag) {
  if (!diag || !Array.isArray(diag.items)) return null;
  const cloned = {
    sheet: diag.sheet || "",
    dateCol: Object.prototype.hasOwnProperty.call(diag, "dateCol")
      ? diag.dateCol ?? null
      : undefined,
    range: Object.prototype.hasOwnProperty.call(diag, "range")
      ? diag.range ?? null
      : undefined,
    items: diag.items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if (Array.isArray(item.closest)) {
        next.closest = [...item.closest];
      }
      if (item.extra && typeof item.extra === "object") {
        next.extra = { ...item.extra };
      }
      return next;
    }),
  };

  if (cloned.dateCol === undefined) {
    delete cloned.dateCol;
  }
  if (cloned.range === undefined) {
    delete cloned.range;
  }

  return cloned;
}
