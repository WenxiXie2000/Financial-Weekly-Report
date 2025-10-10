const IS_TOOLS_PAGE = typeof location !== 'undefined' && location.pathname.includes('/tools/');

if (IS_TOOLS_PAGE) {
  console.info('[app] skip init on tools page');
}

export {};

import { loadComponents } from './load-components.js';
import { getMount, setMountContent } from './dom.js';
import { renderPlaceholder, renderError } from './views/template.js';
import { renderOpenMarket } from './views/open-market.js';
import { renderBondYield } from './views/bond-yield.js';
import { renderCnyFx } from './views/cny-fx.js';
import { renderEquityCn } from './views/equity-cn.js';
import { renderEquityGlobal } from './views/equity-global.js';
import { renderGroupListed } from './views/group-listed.js';
import { renderNews } from './views/news.js';

const DEFAULT_VIEW = 'overview';

const RENDERERS = {
  'open-market': renderOpenMarket,
  'bond-yield': renderBondYield,
  'cny-fx': renderCnyFx,
  'equity-cn': renderEquityCn,
  'equity-global': renderEquityGlobal,
  'group-listed': renderGroupListed,
  news: renderNews,
};

const STORAGE_KEY = 'theme';
const SIDEBAR_STORAGE_KEY = 'sidebar:collapsed';
const SIDEBAR_BREAKPOINT = 1200;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

let dateTimerId = null;
let themeToggleInitialized = false;

function getSidebarPreference() {
  try {
    const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value === '1' || value === '0' ? value : null;
  } catch (err) {
    console.warn('无法读取侧边栏状态', err);
    return null;
  }
}

function setSidebarPreference(value) {
  try {
    if (value === '1' || value === '0') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('无法保存侧边栏状态', err);
  }
}

function triggerLayoutResize() {
  window.setTimeout(() => {
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (err) {
      console.warn('触发 resize 事件失败', err);
    }
  }, 0);
}

function syncSidebarActive(viewId) {
  const menu = document.getElementById('sidebar-menu');
  if (!menu) return;

  menu.querySelectorAll('a[data-view]').forEach((link) => {
    const active = link.dataset.view === viewId;
    link.classList.toggle('is-active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function mountSidebarRuntime() {
  const sidebar = document.getElementById('app-sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');

  if (!sidebar || !toggleBtn) {
    return;
  }

  const mediaQuerySupported = typeof window.matchMedia === 'function';
  const mediaQuery = mediaQuerySupported
    ? window.matchMedia(`(max-width: ${SIDEBAR_BREAKPOINT}px)`)
    : null;

  const getIsNarrow = () => {
    if (mediaQuery) {
      return mediaQuery.matches;
    }
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    return width <= SIDEBAR_BREAKPOINT;
  };

  const apply = (collapsed, { manual = false } = {}) => {
    const isCollapsed = Boolean(collapsed);
    const isNarrow = getIsNarrow();
    sidebar.classList.toggle('is-collapsed', isCollapsed);
    sidebar.classList.toggle('is-manual-expanded', !isCollapsed && manual && isNarrow);
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    triggerLayoutResize();
  };

  const saved = getSidebarPreference();
  if (saved != null) {
    apply(saved === '1', { manual: true });
  } else {
    apply(getIsNarrow(), { manual: false });
  }

  if (!toggleBtn.dataset.sidebarBound) {
    toggleBtn.dataset.sidebarBound = 'true';
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextCollapsed = !sidebar.classList.contains('is-collapsed');
      apply(nextCollapsed, { manual: true });
      setSidebarPreference(nextCollapsed ? '1' : '0');
    });
  }

  const handleResponsiveChange = (matches) => {
    const preference = getSidebarPreference();
    if (preference == null) {
      apply(matches, { manual: false });
    } else {
      apply(preference === '1', { manual: true });
    }
  };

  if (mediaQuery) {
    const listener = (event) => {
      handleResponsiveChange(event?.matches ?? getIsNarrow());
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(listener);
    }
  } else {
    const resizeHandler = () => {
      handleResponsiveChange(getIsNarrow());
    };
    window.addEventListener('resize', resizeHandler);
  }

  if (!sidebar.__collapseObserver) {
    const observer = new MutationObserver(() => {
      const preference = getSidebarPreference();
      if (preference != null) {
        apply(preference === '1', { manual: true });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    sidebar.__collapseObserver = observer;
  }
}

export async function routeTo(viewId, { push = true } = {}) {
  const mount = getMount();
  if (!mount) {
    console.error('[app] 未找到主内容挂载点 #main-content');
    return;
  }
  const key = viewId && typeof viewId === 'string' ? viewId : DEFAULT_VIEW;
  const renderer = RENDERERS[key];

  if (push) {
    const hash = `#${key}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      return;
    }
  }

  if (typeof mount.__viewCleanup === 'function') {
    try {
      mount.__viewCleanup();
    } catch (err) {
      console.warn('[app] 视图清理失败', err);
    } finally {
      mount.__viewCleanup = null;
    }
  }

  setMountContent('');
  mount.scrollTop = 0;

  if (renderer) {
    try {
      await renderer(mount);
    } catch (error) {
      console.error(`[app] 渲染失败: ${key}`, error);
      renderError(mount, error);
    }
  } else {
    renderPlaceholder(mount, `页面暂未实现：${key}`);
  }

  syncSidebarActive(key);
}

function handleHashChange() {
  const viewId = window.location.hash.replace('#', '') || DEFAULT_VIEW;
  routeTo(viewId, { push: false });
}

export function updateCurrentDate(targetEl = document.getElementById('current-date')) {
  if (!targetEl) return;

  const render = () => {
    const now = new Date();
    const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')} 星期${WEEKDAYS[now.getDay()]}`;
    targetEl.textContent = dateString;
  };

  render();

  if (dateTimerId) {
    clearInterval(dateTimerId);
  }

  dateTimerId = window.setInterval(render, 60 * 1000);
}

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('无法读取主题设置', err);
    return null;
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const normalized = theme === 'dark' ? 'dark' : 'light';
  const isDark = normalized === 'dark';

  root.setAttribute('data-theme', normalized);
  document.body.classList.toggle('dark', isDark);

  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch (err) {
    console.warn('无法保存主题设置', err);
  }

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(isDark));
    btn.setAttribute('data-theme', normalized);
  }
}

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const stored = readStoredTheme();
  if (stored) {
    applyTheme(stored);
  } else {
    const hasDark = document.body.classList.contains('dark');
    const rootTheme = document.documentElement.getAttribute('data-theme');
    applyTheme(rootTheme === 'dark' || hasDark ? 'dark' : 'light');
  }

  if (!btn || themeToggleInitialized) return;

  themeToggleInitialized = true;

  btn.addEventListener('click', () => {
    const nowDark = document.body.classList.contains('dark');
    applyTheme(nowDark ? 'light' : 'dark');
  });
}

function mountHeaderRuntime() {
  updateCurrentDate(document.getElementById('current-date'));

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const isDark =
      document.body.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  setupThemeToggle();
}

async function bootstrap() {
  await loadComponents([
    { containerId: 'header-container', path: './components/header.html' },
    { containerId: 'sidebar-container', path: './components/sidebar.html' },
    { containerId: 'footer-container', path: './components/footer.html' },
  ]);

  mountHeaderRuntime();
  mountSidebarRuntime();
  window.addEventListener('hashchange', handleHashChange);

  const initial = window.location.hash.replace('#', '') || DEFAULT_VIEW;
  await routeTo(initial, { push: false });
}

if (!IS_TOOLS_PAGE) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandledrejection]', event?.reason ?? event);
  });

  window.routeTo = routeTo;
}
