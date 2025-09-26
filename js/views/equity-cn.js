import { renderTemplate } from "./template.js";

export async function renderEquityCn(mount) {
  return renderTemplate(mount, { title: "国内股市", sheet: "equity_cn" });
}
