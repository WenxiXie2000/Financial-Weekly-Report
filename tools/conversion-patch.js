// ===== 1) 绑定现有按钮和文件选择（替换成你页面上的真实选择器）=====
const btnConvert = document.querySelector("#btn-convert"); // 你的“开始转换”按钮
const inpFile = document.querySelector("#xlsxFile"); // <input type="file" id="xlsxFile" accept=".xlsx,.xls">
const logEl = document.querySelector("#convertLog"); // 可选：日志容器 <div id="convertLog"></div>

function logInfo(msg, cls = "") {
  console[cls === "err" ? "error" : cls === "warn" ? "warn" : "log"](
    "[convert]",
    msg
  );
  if (!logEl) return;
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}
function toastErr(msg) {
  try {
    window.ElMessage?.error(msg);
  } catch {}
}

if (!btnConvert || !inpFile) {
  logInfo("找不到转换按钮或文件选择器，请检查选择器。", "err");
}

// ===== 2) 通用小工具（缺失值、表头标准化、时间等）=====
function normalizeHeaderLabel(input) {
  const s = String(input ?? "").trim();
  let t = s.replace(/\s+/g, "");
  t = t.replace(/[（(][^）)]*[）)]\s*$/, "");
  return t;
}
function findColIndex(header, matcher) {
  let idx = header.findIndex((h) =>
    matcher instanceof RegExp ? matcher.test(String(h)) : String(h) === matcher
  );
  if (idx >= 0) return idx;
  const norm = header.map(normalizeHeaderLabel);
  if (matcher instanceof RegExp) return norm.findIndex((h) => matcher.test(h));
  const want = normalizeHeaderLabel(matcher);
  return norm.findIndex((h) => h === want);
}
function toDateSafe(x) {
  if (!x) return null;
  const d = new Date(
    typeof x === "number"
      ? (x - 25569) * 86400000
      : String(x).replace(/-/g, "/")
  );
  return Number.isNaN(d) ? null : d;
}
function isWeekday(d) {
  const w = d.getDay();
  return w >= 1 && w <= 5;
}
function mondayOf(d) {
  const t = new Date(d);
  const w = t.getDay() || 7;
  t.setDate(t.getDate() - (w - 1));
  t.setHours(0, 0, 0, 0);
  return t;
}
function fridayOf(d) {
  const m = mondayOf(d);
  const f = new Date(m);
  f.setDate(m.getDate() + 4);
  f.setHours(23, 59, 59, 999);
  return f;
}
function isMissingRaw(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  const s = String(v).trim();
  if (!s) return true;
  const set = new Set([
    "-",
    "--",
    "---",
    "—",
    "——",
    "— —",
    "–",
    "N/A",
    "NA",
    "NaN",
    "NULL",
    "null",
    "无",
  ]);
  if (set.has(s)) return true;
  const t = s.endsWith("%") ? s.slice(0, -1).trim() : s;
  if (!t) return true;
  if (set.has(t)) return true;
  return false;
}
function missingToNull(v) {
  return isMissingRaw(v) ? null : v;
}
function toNumberOrNull(v) {
  v = missingToNull(v);
  if (v === null) return null;
  let s = String(v).trim();
  if (s.endsWith("%")) s = s.slice(0, -1).trim();
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
function toPctString4OrNull(v) {
  v = missingToNull(v);
  if (v === null) return null;
  let s = String(v).trim();
  if (s.endsWith("%")) s = s.slice(0, -1).trim();
  const n = Number(s);
  return Number.isNaN(n) ? null : `${n.toFixed(4)}%`;
}

// ===== 3) 确保全局有 SHEET_PROFILES 和 window.parsers =====
// - SHEET_PROFILES：你已定义好的每张 sheet 的配置（我们前面一起写的那份）
// - window.parsers：把每个 sheet 的解析逻辑注册为函数，名字=Excel里的中文Sheet名
//   例：window.parsers['国内股市'] = (rows, ctx, u) => ({ filename:'equity_cn.json', json });
window.parsers = window.parsers || {};
// TODO: 如果某些解析函数还没注册，先补上空壳，避免运行期报错：
const requiredSheets = [
  "国内股市",
  "全球股市",
  "人民币汇率",
  "公开市场货币",
  "Shibor利率",
  "债券利率",
  "中票利率",
  "国能上市公司",
  "财经资讯",
];
for (const sn of requiredSheets) {
  if (!window.parsers[sn]) {
    window.parsers[sn] = (rows, ctx) => {
      logInfo(
        `(占位) 未实现解析：${sn}。请补齐 window.parsers['${sn}'] 实现。`,
        "warn"
      );
      return null;
    };
  }
}

// ===== 4) 绑定点击：读取→解析→打包下载 =====
btnConvert?.addEventListener("click", async () => {
  try {
    if (!window.XLSX) {
      alert("XLSX 未加载");
      return;
    }
    if (typeof window.__parseCnyFxMinimal !== "function") {
      alert("人民币汇率解析器未就绪");
      return;
    }

    const f = inpFile?.files?.[0];
    if (!f) {
      alert("请选择 Excel 文件");
      return;
    }

    logInfo(`开始读取：${f.name}`);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    logInfo(`读取工作表：${wb.SheetNames.join(", ")}`);

    const sheetName = wb.SheetNames.find((n) => n === "人民币汇率");
    if (!sheetName) {
      alert("工作簿中找不到 “人民币汇率” 这张表");
      return;
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
    });

    const res = window.__parseCnyFxMinimal(rows);
    if (!res || !res.filename || !res.json) {
      alert("人民币汇率解析失败");
      return;
    }

    if (!window.JSZip) {
      const blobSingle = new Blob([JSON.stringify(res.json, null, 2)], {
        type: "application/json",
      });
      const aSingle = document.createElement("a");
      aSingle.href = URL.createObjectURL(blobSingle);
      aSingle.download = res.filename;
      aSingle.click();
      URL.revokeObjectURL(aSingle.href);
      alert(`已下载 ${res.filename}`);
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder("data/values-only");
    folder.file(res.filename, JSON.stringify(res.json, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "values-only.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    alert("已下载 values-only.zip（内含 cny_fx.json）");
  } catch (e) {
    console.error(e);
    alert("转换失败，请查看控制台日志");
  }
});
