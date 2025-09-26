import { renderTemplate } from "./template.js";

export async function renderNews(mount) {
  return renderTemplate(mount, { title: "财经资讯", sheet: "news" });
}
