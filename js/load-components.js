const componentCache = new Map();

const SCRIPT_TYPES_TO_SKIP = new Set(["text/x-template", "text/plain"]);

function ensureContainer(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`[component-loader] 未找到容器 #${containerId}`);
  }
  return container;
}

function activateScripts(root) {
  const scripts = root.querySelectorAll("script");
  scripts.forEach((script) => {
    if (SCRIPT_TYPES_TO_SKIP.has(script.type)) {
      return;
    }
    const fresh = document.createElement("script");
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
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`组件加载失败：${path}（HTTP ${response.status}）`);
  }
  const html = await response.text();
  componentCache.set(path, html);
  return html;
}

/**
 * 动态加载 HTML 片段到指定容器
 * @param {string} containerId - 容器 ID
 * @param {string} path - 组件相对路径
 * @param {{beforeInsert?: (container: HTMLElement) => void, afterInsert?: (container: HTMLElement) => void}} [options]
 */
export async function loadComponent(containerId, path, options = {}) {
  const container = ensureContainer(containerId);
  if (!container) return null;

  try {
    if (typeof options.beforeInsert === "function") {
      options.beforeInsert(container);
    }

    const html = await fetchComponent(path);
    container.innerHTML = html;
    activateScripts(container);

    if (typeof options.afterInsert === "function") {
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

export async function loadComponents(definitions = []) {
  const tasks = definitions.map((item) =>
    loadComponent(item.containerId, item.path, item.options)
  );
  return Promise.all(tasks);
}

if (typeof window !== "undefined") {
  window.__loadComponent = loadComponent;
  window.__loadComponents = loadComponents;
}
