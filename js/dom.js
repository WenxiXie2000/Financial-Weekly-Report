/**
 * DOM 工具模块：集中管理主内容挂载点。
 * - getMount 用于 app.js / 各视图在渲染前确认容器存在。
 * - setMountContent 负责在路由切换时重置内容，防止旧视图残留。
 * - 如需扩展（例如 Skeleton/Loading），请在视图渲染阶段实现，勿修改这里的纯操作职责。
 */

/**
 * 获取主内容挂载节点。
 * @returns {HTMLElement|null} - #main-content 元素，未找到时返回 null。
 */
export function getMount() {
  return document.getElementById('main-content') || document.querySelector('#main-content');
}

/**
 * 设置挂载节点的 innerHTML，常用于清空旧视图。
 * @param {string} [html=''] - 写入的 HTML 字符串。
 * @returns {HTMLElement|null} - 实际写入的 DOM 节点，方便链式调用。
 */
export function setMountContent(html = '') {
  const mount = getMount();
  if (mount) {
    mount.innerHTML = html;
  }
  return mount;
}
