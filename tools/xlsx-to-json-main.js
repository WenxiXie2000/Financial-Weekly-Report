import { SHEET_PROFILES } from '../js/sheet-profiles.js';
import { convertSheets } from '../js/x2j/core.js';
import { getConversionAnchor } from './xlsx-to-json-utils.js';
import { buildDiagnosticsMap } from './xlsx-to-json-mapping.js';

const ANCHOR = getConversionAnchor();
const PROFILES = SHEET_PROFILES || {};

function createResultCard({ title, fileName, data, diagnostics }) {
  const container = document.createElement('article');
  container.className = 'result-item';

  const header = document.createElement('div');
  header.className = 'result-item__header';
  const displayTitle = title || fileName;
  const seriesCount = Array.isArray(data?.series) ? data.series.length : 0;
  const summaryCount = data?.summary ? Object.keys(data.summary).length : 0;
  const sources = Array.isArray(data?.meta?.sourceSheets)
    ? data.meta.sourceSheets.join('、')
    : data?.meta?.sourceSheet || '';
  const metaItems = [
    `输出文件：<code>${fileName}</code>`,
    `系列数量：${seriesCount}`,
    `摘要指标：${summaryCount}`,
  ];
  if (sources) {
    metaItems.push(`来源表：${sources}`);
  }
  header.innerHTML = `
    <div>
      <h3 style="margin:0;">${displayTitle}</h3>
      <div class="result-item__meta">
        ${metaItems.map((item) => `<span>${item}</span>`).join('')}
      </div>
    </div>
  `;

  const actionGroup = document.createElement('div');
  const previewButton = document.createElement('button');
  previewButton.className = 'btn btn-secondary';
  previewButton.type = 'button';
  previewButton.innerHTML = '<i class="bi bi-eye"></i>预览 JSON';

  const downloadButton = document.createElement('button');
  downloadButton.className = 'btn';
  downloadButton.type = 'button';
  downloadButton.innerHTML = '<i class="bi bi-download"></i>下载 JSON';

  actionGroup.append(previewButton, downloadButton);
  header.append(actionGroup);
  container.append(header);

  if (data && data.note) {
    const note = document.createElement('div');
    note.className = 'alert';
    note.textContent = data.note;
    container.append(note);
  }

  if (Array.isArray(diagnostics) && diagnostics.length) {
    const totalIssues = diagnostics.reduce((sum, diag) => {
      if (!diag || !Array.isArray(diag.items)) return sum;
      return sum + diag.items.filter((item) => item && item.matched === false).length;
    }, 0);
    const totalEntries = diagnostics.reduce((sum, diag) => {
      if (!diag || !Array.isArray(diag.items)) return sum;
      return sum + diag.items.length;
    }, 0);

    const panel = document.createElement('details');
    panel.className = 'diagnostics-panel';
    panel.open = totalIssues > 0 && totalIssues <= 6;

    const summary = document.createElement('summary');
    summary.textContent = totalIssues
      ? `诊断提醒：${totalIssues} 项待确认`
      : `诊断记录：${totalEntries} 项`;
    panel.append(summary);

    const list = document.createElement('div');
    list.className = 'diagnostics-list';

    diagnostics.forEach((diag) => {
      if (!diag || !Array.isArray(diag.items) || !diag.items.length) return;

      const sheetBlock = document.createElement('div');
      sheetBlock.className = 'diagnostics-sheet';

      const sheetHeader = document.createElement('div');
      sheetHeader.className = 'diagnostics-entry';
      sheetHeader.innerHTML = `<strong>${diag.sheet || '未命名工作表'}</strong>`;
      sheetBlock.append(sheetHeader);

      diag.items.slice(0, 6).forEach((item) => {
        if (!item) return;
        const row = document.createElement('div');
        row.className = 'diagnostics-entry';

        const status = document.createElement('span');
        status.className = item.matched ? 'diagnostics-chip' : 'diagnostics-chip warn';
        status.textContent = item.matched ? '已匹配' : '待确认';
        row.append(status);

        const label = document.createElement('span');
        label.textContent = item.label || item.category || '未命名字段';
        row.append(label);

        if (item.column) {
          const column = document.createElement('span');
          column.innerHTML = `列：<code>${item.column}</code>`;
          row.append(column);
        } else if (typeof item.index === 'number' && item.index >= 0) {
          const column = document.createElement('span');
          column.textContent = `第 ${item.index + 1} 列`;
          row.append(column);
        }

        if (item.note) {
          const note = document.createElement('span');
          note.textContent = item.note;
          row.append(note);
        }

        sheetBlock.append(row);
      });

      if (diag.items.length > 6) {
        const more = document.createElement('div');
        more.className = 'diagnostics-entry diagnostics-more';
        more.textContent = `……还有 ${diag.items.length - 6} 条记录`;
        sheetBlock.append(more);
      }

      list.append(sheetBlock);
    });

    panel.append(list);
    container.append(panel);
  }

  const preview = document.createElement('textarea');
  preview.className = 'preview';
  preview.setAttribute('readonly', 'readonly');
  preview.style.display = 'none';
  preview.value = JSON.stringify(data ?? {}, null, 2);
  container.append(preview);

  previewButton.addEventListener('click', () => {
    const visible = preview.style.display === 'block';
    preview.style.display = visible ? 'none' : 'block';
    previewButton.innerHTML = visible
      ? '<i class="bi bi-eye"></i>预览 JSON'
      : '<i class="bi bi-eye-slash"></i>收起预览';
  });

  downloadButton.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  return container;
}

function renderResults(results) {
  const resultArea = document.getElementById('result-area');
  if (!resultArea) return;

  resultArea.innerHTML = '';

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'alert';
    empty.textContent = '未找到可解析的工作表，请确认 Excel 文件的 Sheet 名称。';
    resultArea.append(empty);
    return;
  }

  results.forEach((item) => {
    const card = createResultCard(item);
    resultArea.append(card);
  });
}

function collectSheetEntries(workbook) {
  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets?.[sheetName];
    if (!worksheet) return [sheetName, []];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    return [sheetName, rows];
  });
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    console.error('[tool] 未加载 SheetJS XLSX 库');
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetEntries = collectSheetEntries(workbook);

  const coreResult = convertSheets(sheetEntries, {
    anchor: ANCHOR,
    profiles: PROFILES,
  });

  const outputsByFile =
    coreResult.files instanceof Map
      ? coreResult.files
      : new Map(Object.entries(coreResult.files || {}));

  const diagnosticsByFile = buildDiagnosticsMap(coreResult);

  const aggregated = Array.from(outputsByFile.entries()).map(([fileName, data]) => {
    const sources = Array.isArray(data?.meta?.sourceSheets) ? data.meta.sourceSheets : [];
    const title = sources.length ? sources.join(' + ') : data?.meta?.sourceSheet || fileName;
    const diagnostics = diagnosticsByFile.get(fileName) || [];
    return { title, fileName, data, diagnostics };
  });

  aggregated.sort((a, b) => a.fileName.localeCompare(b.fileName));

  renderResults(aggregated);
}

const inputEl = document.getElementById('xlsx-input');
if (inputEl) {
  inputEl.addEventListener('change', handleFile);
}
