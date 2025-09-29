// ===== 1) 绑定现有按钮和文件选择（替换成你页面上的真实选择器）=====
const btnConvert = document.querySelector('#btn-convert'); // 你的“开始转换”按钮
const inpFile = document.querySelector('#xlsxFile'); // <input type="file" id="xlsxFile" accept=".xlsx,.xls">
const logEl = document.querySelector('#convertLog'); // 可选：日志容器 <div id="convertLog"></div>

function getAnchorFromUrl() {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('anchor');
    if (!raw) return null;
    const candidate = new Date(`${raw}T00:00:00`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  } catch (err) {
    console.warn('[convert][anchor] 解析失败', err);
    return null;
  }
}

const conversionAnchor = (() => {
  const preset = window.__conversionAnchor;
  if (preset instanceof Date && !Number.isNaN(preset.getTime())) {
    return preset;
  }
  const fromUrl = getAnchorFromUrl();
  const now = fromUrl || new Date();
  now.setHours(0, 0, 0, 0);
  window.__conversionAnchor = now;
  return now;
})();

function logInfo(msg, cls = '') {
  console[cls === 'err' ? 'error' : cls === 'warn' ? 'warn' : 'log']('[convert]', msg);
  if (!logEl) return;
  const d = document.createElement('div');
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
  logInfo('找不到转换按钮或文件选择器，请检查选择器。', 'err');
}

// ===== 2) 通用小工具（缺失值、表头标准化、时间等）=====
const utils = window.x2jUtils || window.xlsx2jsonUtils || {};
const {
  normalizeHeaderLabel,
  findColIndex,
  toDateSafe,
  isWeekday,
  missingToNull,
  toNumberOrNull,
  toPctString4OrNull,
} = utils;

if (typeof normalizeHeaderLabel !== 'function' || typeof findColIndex !== 'function') {
  console.error('[convert] x2j utils 未加载，无法继续');
}

// ===== 3) 确保全局有 SHEET_PROFILES 和 window.parsers =====
// - SHEET_PROFILES：你已定义好的每张 sheet 的配置（我们前面一起写的那份）
// - window.parsers：把每个 sheet 的解析逻辑注册为函数，名字=Excel里的中文Sheet名
//   例：window.parsers['国内股市'] = (rows, ctx, u) => ({ filename:'equity_cn.json', json });
window.parsers = window.parsers || {};
// TODO: 如果某些解析函数还没注册，先补上空壳，避免运行期报错：
const requiredSheets = [
  '国内股市',
  '全球股市',
  '人民币汇率',
  '公开市场货币',
  'Shibor利率',
  '债券利率',
  '中票利率',
  '国能上市公司',
  '财经资讯',
];
for (const sn of requiredSheets) {
  if (!window.parsers[sn]) {
    window.parsers[sn] = (rows, ctx) => {
      logInfo(`(占位) 未实现解析：${sn}。请补齐 window.parsers['${sn}'] 实现。`, 'warn');
      return null;
    };
  }
}

// ===== 4) 绑定点击：读取→解析→打包下载 =====
btnConvert?.addEventListener('click', async () => {
  try {
    if (!window.XLSX) {
      alert('XLSX 未加载');
      return;
    }
    if (typeof window.__parseCnyFxMinimal !== 'function') {
      alert('人民币汇率解析器未就绪');
      return;
    }

    const f = inpFile?.files?.[0];
    if (!f) {
      alert('请选择 Excel 文件');
      return;
    }

    logInfo(`开始读取：${f.name}`);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    logInfo(`读取工作表：${wb.SheetNames.join(', ')}`);

    const results = [];

    const fxSheetName = wb.SheetNames.find((n) => n === '人民币汇率');
    if (!fxSheetName) {
      alert('工作簿中找不到 “人民币汇率” 这张表');
      return;
    }

    const fxSheet = wb.Sheets[fxSheetName];
    const fxRows = XLSX.utils.sheet_to_json(fxSheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    const resFx = window.__parseCnyFxMinimal(fxRows, conversionAnchor);
    if (!resFx || !resFx.filename || !resFx.json) {
      alert('人民币汇率解析失败');
      return;
    }
    results.push(resFx);

    if (typeof window.__parseOpenMarketShiborMinimal === 'function') {
      const omSheetName = wb.SheetNames.find((n) => n === '公开市场货币');
      const shiborSheetName = wb.SheetNames.find((n) => n === 'Shibor利率');
      if (omSheetName && shiborSheetName) {
        const omSheet = wb.Sheets[omSheetName];
        const shiborSheet = wb.Sheets[shiborSheetName];
        const omRows = XLSX.utils.sheet_to_json(omSheet, {
          header: 1,
          raw: true,
          defval: null,
        });
        const shiborRows = XLSX.utils.sheet_to_json(shiborSheet, {
          header: 1,
          raw: true,
          defval: null,
        });
        try {
          const resOpen = window.__parseOpenMarketShiborMinimal(
            omRows,
            shiborRows,
            conversionAnchor
          );
          if (resOpen && resOpen.filename && resOpen.json) {
            results.push(resOpen);
            logInfo('已解析 公开市场货币 + Shibor', 'info');
          } else {
            logInfo('公开市场货币 + Shibor 解析返回空结果', 'warn');
          }
        } catch (err) {
          console.error(err);
          logInfo('公开市场货币 + Shibor 解析失败', 'err');
        }
      } else {
        logInfo('未找到公开市场货币或 Shibor利率工作表，跳过最小解析', 'warn');
      }
    } else {
      logInfo('最小解析函数 __parseOpenMarketShiborMinimal 不存在', 'warn');
    }

    if (!results.length) {
      alert('没有可导出的结果');
      return;
    }

    if (!window.JSZip) {
      results.forEach((res) => {
        const blob = new Blob([JSON.stringify(res.json, null, 2)], {
          type: 'application/json',
        });
        const aSingle = document.createElement('a');
        aSingle.href = URL.createObjectURL(blob);
        aSingle.download = res.filename;
        aSingle.click();
        URL.revokeObjectURL(aSingle.href);
      });
      alert(`已下载 ${results.length} 个 JSON 文件`);
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder('data/values-only');
    results.forEach((res) => {
      folder.file(res.filename, JSON.stringify(res.json, null, 2));
    });
    const blob = await zip.generateAsync({ type: 'blob' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'values-only.zip';
    a.click();
    URL.revokeObjectURL(a.href);
    alert(`已下载 values-only.zip（含 ${results.map((item) => item.filename).join(', ')}）`);
  } catch (e) {
    console.error(e);
    alert('转换失败，请查看控制台日志');
  }
});
