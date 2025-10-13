/**
 * 空态渲染工具：将目标容器清空并填充统一的文案节点。
 * 使用方式：renderEmptyState(target, '暂无数据', { className: 'empty-state' });
 */
export function renderEmptyState(target, message = '暂无数据', options = {}) {
  if (!target) return null;

  const { className = 'empty-state', tagName = 'div', style } = options;

  target.innerHTML = '';
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  if (style) {
    node.style.cssText = style;
  }
  node.textContent = message;
  target.appendChild(node);
  return node;
}
