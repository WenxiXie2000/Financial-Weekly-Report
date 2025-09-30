import { loadComponents } from './load-components.js';
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
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

let dateTimerId = null;
let themeToggleInitialized = false;

function getMount() {
  const mount = document.getElementById('main-content');
  if (!mount) {
    throw new Error('未找到 #main-content 容器');
  }
  return mount;
}

async function renderPlaceholder(mount, viewId) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-header">页面暂未实现</div><div style="padding:12px 16px">${viewId}</div>`;
  mount.appendChild(card);
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

export async function routeTo(viewId, { push = true } = {}) {
  const mount = getMount();
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

  mount.innerHTML = '';
  mount.scrollTop = 0;

  if (renderer) {
    try {
      await renderer(mount);
    } catch (error) {
      console.error('[app] 渲染失败', error);
      const errBox = document.createElement('div');
      errBox.className = 'error-box';
      errBox.innerHTML = `<strong>渲染失败</strong><span>${error.message}</span>`;
      mount.appendChild(errBox);
    }
  } else {
    await renderPlaceholder(mount, key);
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
  window.addEventListener('hashchange', handleHashChange);

  const initial = window.location.hash.replace('#', '') || DEFAULT_VIEW;
  await routeTo(initial, { push: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

window.routeTo = routeTo;
