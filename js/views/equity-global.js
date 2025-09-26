import { renderTemplate } from "./template.js";

export async function renderEquityGlobal(mount) {
  return renderTemplate(mount, { title: "全球股市", sheet: "equity_global" });
}
