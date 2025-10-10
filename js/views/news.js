/**
 * 财经资讯视图：复用 template 渲染新闻列表。
 * - 数据取自 news.json（articles/items），模板负责列表与链接。
 */
import { renderTemplate } from './template.js';

/**
 * 渲染资讯模块。
 * @param {HTMLElement} mount
 * @returns {Promise<void>}
 */
export async function renderNews(mount) {
  return renderTemplate(mount, { title: '财经资讯', sheet: 'news' });
}
