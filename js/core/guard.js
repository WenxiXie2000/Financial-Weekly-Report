/**
 * 轻量守卫工具：用于在运行时记录潜在数据异常。
 * ensure(condition, message, extra) 仅在断言失败时输出 debug 日志，不会抛错。
 */
export function ensure(condition, message = 'assertion failed', extra) {
  const ok = Boolean(condition);
  if (!ok && typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[ensure]', message, extra);
  }
  return ok;
}
