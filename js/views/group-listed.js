import { renderTemplate } from "./template.js";

export async function renderGroupListed(mount) {
  return renderTemplate(mount, {
    title: "集团上市公司",
    sheet: "group_listed",
  });
}
