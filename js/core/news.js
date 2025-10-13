/**
 * 财经资讯视图的通用数据处理函数。
 */

export function parseDateTimestamp(value) {
  if (!value) return null;
  const dt = new Date(value);
  const time = dt.getTime();
  if (Number.isNaN(time)) return null;
  return time;
}

export function displayDate(value) {
  if (!value) return '--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseFilterBoundary(value, boundary) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  if (boundary === 'start') {
    dt.setHours(0, 0, 0, 0);
  } else {
    dt.setHours(23, 59, 59, 999);
  }
  return dt.getTime();
}

export function buildExcerpt(content) {
  if (!content) return '暂无摘要';
  const normalized = String(content).trim();
  if (!normalized) return '暂无摘要';
  if (normalized.length <= 110) return normalized;
  return `${normalized.slice(0, 110)}...`;
}

export function normalizeItems(dataset) {
  const primary = Array.isArray(dataset?.items)
    ? dataset.items
    : Array.isArray(dataset?.articles)
    ? dataset.articles
    : [];
  const fallback =
    primary.length || typeof window === 'undefined'
      ? []
      : Array.isArray(window.NEWS_DATA?.items)
      ? window.NEWS_DATA.items
      : [];
  const source = primary.length ? primary : fallback;
  return (Array.isArray(source) ? source : []).map((item, index) => {
    const date = item?.date || item?.time || '';
    const timestamp = parseDateTimestamp(date);
    const rawSource = item?.source;
    const normalizedSource = ['Macro', 'Group', 'Fund'].includes(rawSource) ? rawSource : 'Macro';
    const priority = Number(item?.priority);
    return {
      id: item?.id || `news-${index}`,
      title: item?.title || '(无标题)',
      date,
      timestamp,
      source: normalizedSource,
      priority: Number.isNaN(priority) ? 0 : priority,
      content: item?.content || item?.summary || '',
      tags: Array.isArray(item?.tags) ? item.tags.filter((tag) => !!tag) : [],
      url: item?.url || item?.link || '',
    };
  });
}

export function filterAndSortItems(items, filters) {
  const { startDate, endDate, sort } = filters;
  const startTs = parseFilterBoundary(startDate, 'start');
  const endTs = parseFilterBoundary(endDate, 'end');
  const filtered = items.filter((item) => {
    const ts = item.timestamp;
    if (startTs != null && (ts == null || ts < startTs)) return false;
    if (endTs != null && (ts == null || ts > endTs)) return false;
    return true;
  });

  const comparatorMap = {
    newest: (a, b) => {
      const dtA = a.timestamp ?? -Infinity;
      const dtB = b.timestamp ?? -Infinity;
      if (dtB !== dtA) return dtB - dtA;
      return (b.priority ?? 0) - (a.priority ?? 0);
    },
    oldest: (a, b) => {
      const dtA = a.timestamp ?? Infinity;
      const dtB = b.timestamp ?? Infinity;
      if (dtA !== dtB) return dtA - dtB;
      return (a.priority ?? 0) - (b.priority ?? 0);
    },
    priority: (a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pb !== pa) return pb - pa;
      const dtA = a.timestamp ?? -Infinity;
      const dtB = b.timestamp ?? -Infinity;
      return dtB - dtA;
    },
  };

  const comparator = comparatorMap[sort] || comparatorMap.newest;
  return filtered.slice().sort(comparator);
}

export function groupItems(items) {
  const grouped = {
    Macro: [],
    Group: [],
    Fund: [],
  };
  items.forEach((item) => {
    const list = grouped[item.source] || grouped.Macro;
    list.push(item);
  });
  return grouped;
}
