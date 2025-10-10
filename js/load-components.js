/**
 * 静态组件加载器：负责在运行时将 header/sidebar/footer 等 HTML 片段注入页面。
 * - 支持缓存与重复使用，减少网络请求。
 * - 激活片段内 script，兼容 iconfont / 主题切换等行为。
 * - 被 app.js 在 bootstrap 阶段调用，确保业务视图渲染前完成布局骨架。
 */
const componentCache = new Map();

const SCRIPT_TYPES_TO_SKIP = new Set(['text/x-template', 'text/plain']);

function ensureContainer(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`[component-loader] 未找到容器 #${containerId}`);
  }
  return container;
}

function activateScripts(root) {
  const scripts = root.querySelectorAll('script');
  scripts.forEach((script) => {
    if (SCRIPT_TYPES_TO_SKIP.has(script.type)) {
      return;
    }
    const fresh = document.createElement('script');
    [...script.attributes].forEach((attr) => {
      fresh.setAttribute(attr.name, attr.value);
    });

    if (script.src) {
      fresh.src = script.src;
    } else {
      fresh.textContent = script.textContent;
    }
    script.replaceWith(fresh);
  });
}

async function fetchComponent(path) {
  if (componentCache.has(path)) {
    return componentCache.get(path);
  }
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`组件加载失败：${path}（HTTP ${response.status}）`);
  }
  const html = await response.text();
  componentCache.set(path, html);
  return html;
}

/**
 * 动态加载 HTML 片段到指定容器。
 * @param {string} containerId - 容器 ID，例如 header-container。
 * @param {string} path - 组件相对路径（相对于当前页面）。
 * @param {{beforeInsert?: (container: HTMLElement) => void, afterInsert?: (container: HTMLElement) => void}} [options]
 *   - beforeInsert：写入前钩子，可用于清空占位样式。
 *   - afterInsert：写入后钩子，可用于绑定事件。
 * @returns {Promise<HTMLElement|null>} - 写入成功返回容器，失败时返回 null 并渲染错误盒子。
 */
export async function loadComponent(containerId, path, options = {}) {
  const container = ensureContainer(containerId);
  if (!container) return null;

  try {
    if (typeof options.beforeInsert === 'function') {
      options.beforeInsert(container);
    }

    const html = await fetchComponent(path);
    container.innerHTML = html;
    activateScripts(container);

    if (typeof options.afterInsert === 'function') {
      options.afterInsert(container);
    }

    return container;
  } catch (error) {
    console.error(`[component-loader] ${error.message}`);
    container.innerHTML = `
      <div class="error-box">
        <strong>组件加载失败</strong>
        <span>${path}</span>
        <span>${error.message}</span>
      </div>`;
    return null;
  }
}

/**
 * 批量加载组件，常用于一次性初始化 header/sidebar/footer。
 * @param {{containerId: string, path: string, options?: Parameters<typeof loadComponent>[2]}[]} definitions
 * @returns {Promise<(HTMLElement|null)[]>}
 */
export async function loadComponents(definitions = []) {
  const tasks = definitions.map((item) => loadComponent(item.containerId, item.path, item.options));
  return Promise.all(tasks);
}

if (typeof window !== 'undefined') {
  window.__loadComponent = loadComponent;
  window.__loadComponents = loadComponents;
}
