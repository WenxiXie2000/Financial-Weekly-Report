import { loadSheet } from "../data-adapter.js";

// 中文标题映射（如后续新增组，在此补一行即可）
const GROUP_LABELS = {
  aaa_3y: "AAA公司债3年",
  aaa_5y: "AAA公司债5年",
  aaa_mt_5y: "AAA中票5年",
  aaa_priv_5y: "AAA私募债5年",
  cp_short: "短融",
  scp_270d: "270D超短融",
  scp_180d: "180D超短融",
};

export async function renderBondYield(mount) {
  const data = await loadSheet("bond_yield");

  const h = document.createElement("h2");
  h.textContent = "债券利率（周度 Top5）";
  mount.appendChild(h);

  const top = data?.top5_latest || {};

  // 无数据兜底
  if (!top || !Object.keys(top).length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.style.padding = "12px 16px";
    empty.textContent = "暂无 Top5 数据";
    mount.appendChild(empty);
    return;
  }

  // 逐组渲染 Top5 小表
  Object.entries(top).forEach(([g, block]) => {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("div");
    title.className = "card-header";
    title.textContent = `${GROUP_LABELS[g] || g}（${block?.date || "--"}）`;
    card.appendChild(title);

    const wrap = document.createElement("div");
    wrap.style.padding = "12px 16px";

    const tbl = document.createElement("table");
    tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:14px;";

    tbl.innerHTML = `
      <thead>
        <tr>
          <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">名次</th>
          <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">公司简称</th>
          <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border)">发行规模(亿)</th>
          <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">发行期限</th>
          <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border)">票面利率(%)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tb = tbl.querySelector("tbody");
    const rows = Array.isArray(block?.rows) ? block.rows : [];

    // 渲染 1~5 名；缺值显示 --
    rows.forEach((r) => {
      const tr = document.createElement("tr");

      const sizeDisp =
        r.size_yi == null
          ? "--"
          : Number(r.size_yi).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });

      tr.innerHTML = `
        <td style="padding:6px;border-bottom:1px solid var(--border)">${
          r.rank ?? "--"
        }</td>
        <td style="padding:6px;border-bottom:1px solid var(--border)">${
          r.issuer ?? "--"
        }</td>
        <td style="padding:6px;border-bottom:1px solid var(--border);text-align:right">${sizeDisp}</td>
        <td style="padding:6px;border-bottom:1px solid var(--border)">${
          r.term ?? "--"
        }</td>
        <td style="padding:6px;border-bottom:1px solid var(--border);text-align:right">${
          r.coupon_pct ?? "--"
        }</td>
      `;
      tb.appendChild(tr);
    });

    wrap.appendChild(tbl);
    card.appendChild(wrap);
    mount.appendChild(card);
  });
}
