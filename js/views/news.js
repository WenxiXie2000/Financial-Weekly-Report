/**
 * 财经资讯视图：展示 Macro / Group / Fund 三类资讯卡片。
 * - 数据源：/data/values-only/news.json，经 data-adapter.loadSheet 兜底 window.NEWS_DATA。
 * - 导出 API：renderNews(mount)；与路由保持一致，在卸载时清理事件与模态。
 */
import { loadSheet } from '../data-adapter.js';
import { COLORS } from '../theme/palette.js';

const STYLE_ID = 'news-inline-styles';
const SOURCE_LABELS = {
  Macro: '宏观',
  Group: '集团',
  Fund: '基金',
};
const SOURCE_TITLES = {
  Macro: '宏观快讯',
  Group: '集团动态',
  Fund: '基金观察',
};
const SOURCE_COLOR_GETTERS = {
  Macro: () => COLORS.primary(),
  Group: () => COLORS.success(),
  Fund: () => COLORS.violet(),
};
const SORT_OPTIONS = [
  { value: 'newest', label: '最新优先' },
  { value: 'oldest', label: '最早优先' },
  { value: 'priority', label: '按优先级' },
];

const EMPTY_GROUP = { Macro: [], Group: [], Fund: [] };

let stylesInjected = false;

function injectStyles() {
  if (typeof document === 'undefined' || stylesInjected) return;
  const style = document.getElementById(STYLE_ID) || document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.news-layout{display:flex;flex-direction:column;gap:24px;padding:0 4px 32px;}
.news-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:8px;}
.news-header h2{margin:0;font-size:24px;font-weight:600;color:var(--text-primary,#0f172a);}
.news-filters{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;}
.news-filter{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted,#64748b);}
.news-filter input,.news-filter select{min-width:156px;padding:6px 10px;border:1px solid var(--border,#e2e8f0);border-radius:8px;background:var(--card,#fff);color:var(--text-primary,#0f172a);font-size:14px;}
.news-sections{display:flex;flex-direction:column;gap:24px;}
.news-section{display:flex;flex-direction:column;gap:14px;}
.news-section-title{font-size:18px;font-weight:600;margin:0;color:var(--text-primary,#0f172a);}
.news-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;}
.news-card{background:var(--card,#fff);border:1px solid var(--border,#e2e8f0);border-radius:16px;box-shadow:0 4px 14px rgba(15,23,42,0.04);padding:18px 18px 16px;display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;}
.news-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(15,23,42,0.12);}
.news-card-header{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--text-muted,#64748b);gap:12px;}
.news-source{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--text-primary,#0f172a);}
.news-source-dot{width:10px;height:10px;border-radius:999px;background:var(--text-muted,#94a3b8);flex-shrink:0;}
.news-date{opacity:.72;}
.news-title{font-size:16px;font-weight:600;color:var(--text-primary,#0f172a);margin:0;line-height:1.45;}
.news-excerpt{font-size:14px;color:var(--text2,#475569);line-height:1.6;margin:0;white-space:pre-line;}
.news-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;}
.news-tag{padding:2px 8px;border-radius:999px;background:rgba(37,99,235,0.08);color:var(--text-primary,#0f172a);font-size:12px;}
.news-empty{padding:28px 16px;border:1px dashed var(--border,#e2e8f0);border-radius:12px;text-align:center;color:var(--text-muted,#64748b);font-size:14px;background:var(--card,#fff);}
.news-modal-open{overflow:hidden;}
.news-modal{position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1100;}
.news-modal-dialog{background:var(--card,#fff);border-radius:16px;max-width:760px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(15,23,42,0.25);padding:28px;display:flex;flex-direction:column;gap:16px;}
.news-modal-close{align-self:flex-end;border:none;background:transparent;font-size:22px;cursor:pointer;color:var(--text-muted,#64748b);}
.news-modal-title{margin:0;font-size:22px;font-weight:600;color:var(--text-primary,#0f172a);}
.news-modal-meta{display:flex;gap:12px;align-items:center;font-size:13px;color:var(--text-muted,#64748b);}
.news-modal-content{font-size:15px;color:var(--text2,#475569);line-height:1.7;white-space:pre-wrap;}
.news-modal-link{margin-top:8px;}
.news-modal-link a{color:${COLORS.primary()};text-decoration:none;font-weight:600;}
.news-modal-link a:hover{text-decoration:underline;}
.news-modal-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
.news-modal-tags .news-tag{background:rgba(37,99,235,0.12);}
@media (max-width:768px){
  .news-layout{padding:0 0 24px;}
  .news-grid{grid-template-columns:1fr;}
  .news-modal{padding:12px;}
  .news-modal-dialog{padding:20px;}
}
`;
  if (!style.parentNode) {
    document.head.appendChild(style);
  }
  stylesInjected = true;
}

function parseDateTimestamp(value) {
  if (!value) return null;
  const dt = new Date(value);
  const time = dt.getTime();
  if (Number.isNaN(time)) return null;
  return time;
}

function displayDate(value) {
  if (!value) return '--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseFilterBoundary(value, boundary) {
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

function buildExcerpt(content) {
  if (!content) return '暂无摘要';
  const normalized = String(content).trim();
  if (!normalized) return '暂无摘要';
  if (normalized.length <= 110) return normalized;
  return `${normalized.slice(0, 110)}...`;
}

function normalizeItems(dataset) {
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

function filterAndSortItems(items, filters) {
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

function groupItems(items) {
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

function createModalController() {
  let overlay = null;
  let escHandler = null;

  const close = () => {
    if (!overlay) return;
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    document.body.classList.remove('news-modal-open');
  };

  const open = (item) => {
    close();
    overlay = document.createElement('div');
    overlay.className = 'news-modal';

    const dialog = document.createElement('div');
    dialog.className = 'news-modal-dialog';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'news-modal-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.innerHTML = '&times;';
    dialog.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.className = 'news-modal-title';
    title.textContent = item.title || '(无标题)';
    dialog.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'news-modal-meta';
    const color = SOURCE_COLOR_GETTERS[item.source]?.() || COLORS.primary();
    const badge = document.createElement('span');
    badge.className = 'news-source';
    badge.innerHTML = `<span class="news-source-dot" style="background:${color}"></span>${
      SOURCE_LABELS[item.source] || item.source
    }`;
    const date = document.createElement('span');
    date.textContent = displayDate(item.date);
    meta.appendChild(badge);
    meta.appendChild(date);
    dialog.appendChild(meta);

    const content = document.createElement('div');
    content.className = 'news-modal-content';
    content.textContent = item.content ? String(item.content) : '暂无正文';
    dialog.appendChild(content);

    if (item.url) {
      const linkWrap = document.createElement('div');
      linkWrap.className = 'news-modal-link';
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '查看原文';
      linkWrap.appendChild(link);
      dialog.appendChild(linkWrap);
    }

    if (Array.isArray(item.tags) && item.tags.length) {
      const tagWrap = document.createElement('div');
      tagWrap.className = 'news-modal-tags';
      item.tags.forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'news-tag';
        span.textContent = tag;
        tagWrap.appendChild(span);
      });
      dialog.appendChild(tagWrap);
    }

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.body.classList.add('news-modal-open');

    const handleOverlayClick = (event) => {
      if (event.target === overlay) {
        close();
      }
    };
    overlay.addEventListener('click', handleOverlayClick);

    closeBtn.addEventListener('click', () => close());

    escHandler = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', escHandler);
  };

  return { open, close };
}

function renderSection(container, title, items, { onCardClick }) {
  const section = document.createElement('section');
  section.className = 'news-section';

  const heading = document.createElement('h3');
  heading.className = 'news-section-title';
  heading.textContent = title;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'news-grid';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'news-empty';
    empty.textContent = '暂无数据';
    grid.appendChild(empty);
  } else {
    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card news-card';

      const header = document.createElement('div');
      header.className = 'news-card-header';

      const sourceEl = document.createElement('div');
      sourceEl.className = 'news-source';
      const color = SOURCE_COLOR_GETTERS[item.source]?.() || COLORS.primary();
      const dot = document.createElement('span');
      dot.className = 'news-source-dot';
      dot.style.background = color;
      sourceEl.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = SOURCE_LABELS[item.source] || item.source;
      sourceEl.appendChild(label);

      const date = document.createElement('span');
      date.className = 'news-date';
      date.textContent = displayDate(item.date);

      header.appendChild(sourceEl);
      header.appendChild(date);

      const titleEl = document.createElement('h4');
      titleEl.className = 'news-title';
      titleEl.textContent = item.title || '(无标题)';

      const excerpt = document.createElement('div');
      excerpt.className = 'news-excerpt';
      excerpt.textContent = buildExcerpt(item.content);

      card.appendChild(header);
      card.appendChild(titleEl);
      card.appendChild(excerpt);

      if (Array.isArray(item.tags) && item.tags.length) {
        const tags = document.createElement('div');
        tags.className = 'news-tags';
        item.tags.forEach((tag) => {
          const span = document.createElement('span');
          span.className = 'news-tag';
          span.textContent = tag;
          tags.appendChild(span);
        });
        card.appendChild(tags);
      }

      card.addEventListener('click', () => {
        onCardClick(item);
      });

      grid.appendChild(card);
    });
  }

  section.appendChild(grid);
  container.appendChild(section);
}

function renderFilters(container, state, apply) {
  const filters = document.createElement('div');
  filters.className = 'news-filters';

  const startWrap = document.createElement('label');
  startWrap.className = 'news-filter';
  startWrap.textContent = '开始日期';
  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.value = state.filters.startDate;
  startWrap.appendChild(startInput);

  const endWrap = document.createElement('label');
  endWrap.className = 'news-filter';
  endWrap.textContent = '结束日期';
  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.value = state.filters.endDate;
  endWrap.appendChild(endInput);

  const sortWrap = document.createElement('label');
  sortWrap.className = 'news-filter';
  sortWrap.textContent = '排序';
  const sortSelect = document.createElement('select');
  SORT_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === state.filters.sort) option.selected = true;
    sortSelect.appendChild(option);
  });
  sortWrap.appendChild(sortSelect);

  filters.appendChild(startWrap);
  filters.appendChild(endWrap);
  filters.appendChild(sortWrap);

  const cleanup = [];

  const bind = (el, event, handler) => {
    el.addEventListener(event, handler);
    cleanup.push(() => el.removeEventListener(event, handler));
  };

  bind(startInput, 'change', () => {
    state.filters.startDate = startInput.value;
    apply();
  });
  bind(endInput, 'change', () => {
    state.filters.endDate = endInput.value;
    apply();
  });
  bind(sortSelect, 'change', () => {
    state.filters.sort = sortSelect.value;
    apply();
  });

  container.appendChild(filters);
  return () => {
    cleanup.forEach((fn) => fn());
  };
}

/**
 * 渲染资讯视图主体。
 * @param {HTMLElement} mount - 视图挂载容器。
 */
export async function renderNews(mount) {
  if (!mount) return;
  injectStyles();

  if (typeof mount.__viewCleanup === 'function') {
    mount.__viewCleanup();
  }

  mount.innerHTML = '';

  let dataset = null;
  try {
    dataset = await loadSheet('news');
  } catch (err) {
    console.error('[news] loadSheet failed', err);
  }

  const items = normalizeItems(dataset);

  const state = {
    allItems: items,
    grouped: EMPTY_GROUP,
    filters: {
      startDate: '',
      endDate: '',
      sort: 'newest',
    },
  };

  const layout = document.createElement('div');
  layout.className = 'news-layout';
  mount.appendChild(layout);

  const header = document.createElement('div');
  header.className = 'news-header';

  const title = document.createElement('h2');
  title.textContent = '财经资讯';
  header.appendChild(title);

  const destroyers = [];

  const applyFilters = () => {
    const filtered = filterAndSortItems(state.allItems, state.filters);
    state.grouped = groupItems(filtered);
    renderSections();
  };

  const filtersCleanup = renderFilters(header, state, applyFilters);
  destroyers.push(filtersCleanup);

  layout.appendChild(header);

  const sections = document.createElement('div');
  sections.className = 'news-sections';
  layout.appendChild(sections);

  const modal = createModalController();

  const renderSections = () => {
    sections.innerHTML = '';
    const grouped = state.grouped;
    const keys = Object.keys(SOURCE_TITLES);
    let hasAny = false;
    keys.forEach((key) => {
      const list = grouped[key] || [];
      if (list.length) hasAny = true;
      renderSection(sections, SOURCE_TITLES[key] || key, list, {
        onCardClick: modal.open,
      });
    });
    if (!hasAny) {
      const empty = document.createElement('div');
      empty.className = 'news-empty';
      empty.textContent = '暂无资讯数据';
      sections.appendChild(empty);
    }
  };

  applyFilters();

  const cleanup = () => {
    destroyers.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('[news] cleanup failed', err);
      }
    });
    destroyers.length = 0;
    modal.close();
  };

  mount.__viewCleanup = cleanup;
}
