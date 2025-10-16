/**
 * 轻量守卫工具：用于在运行时记录潜在数据异常。
 * ensure(condition, message, extra) 仅在断言失败时输出 debug 日志，不会抛错。
 */
/**
 * 校验条件并在失败时输出调试信息。
 * @param {unknown} condition - 需要判断的条件，truthy 视为通过。
 * @param {string} [message='assertion failed'] - 调试日志消息。
 * @param {unknown} [extra] - 附加上下文数据，会原样打印。
 * @returns {boolean} 条件是否通过。
 */
export function ensure(condition, message = 'assertion failed', extra) {
  const ok = Boolean(condition);
  if (!ok && typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[ensure]', message, extra);
  }
  return ok;
}
