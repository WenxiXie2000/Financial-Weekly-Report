/**
 * 周报总结视图：整合所有模块内容并提供PDF导出功能
 */

import { renderOpenMarket } from './open-market.js';
import { renderBondYield } from './bond-yield.js';
import { renderCnyFx } from './cny-fx.js';
import { renderEquityCn } from './equity-cn.js';
import { renderEquityGlobal } from './equity-global.js';
import { renderGroupListed } from './group-listed.js';
import { renderNews } from './news.js';

/**
 * 渲染周报总结视图
 * @param {HTMLElement} mount - 挂载点
 */
export async function renderWeeklySummary(mount) {
  mount.innerHTML = `
    <div class="weekly-summary-view">
      <div class="view-header">
        <h2><i class="bi bi-journal-text"></i> 周报总结</h2>
        <button id="export-pdf-btn" class="btn-export-pdf">
          <i class="bi bi-file-earmark-pdf"></i> 导出为 PDF
        </button>
      </div>
      
      <div id="summary-content">
        <!-- 国内股市 -->
        <section class="summary-section" id="summary-equity-cn">
          <h3><i class="bi bi-bar-chart-line"></i> 国内股市</h3>
          <div class="section-content" id="equity-cn-content"></div>
        </section>
        
        <!-- 全球股市 -->
        <section class="summary-section" id="summary-equity-global">
          <h3><i class="bi bi-globe-asia-australia"></i> 全球股市</h3>
          <div class="section-content" id="equity-global-content"></div>
        </section>
        
        <!-- 人民币汇率 -->
        <section class="summary-section" id="summary-cny-fx">
          <h3><i class="bi bi-currency-exchange"></i> 人民币汇率</h3>
          <div class="section-content" id="cny-fx-content"></div>
        </section>
        
        <!-- 公开市场 -->
        <section class="summary-section" id="summary-open-market">
          <h3><i class="bi bi-bank"></i> 公开市场</h3>
          <div class="section-content" id="open-market-content"></div>
        </section>
        
        <!-- 债券利率 -->
        <section class="summary-section" id="summary-bond-yield">
          <h3><i class="bi bi-percent"></i> 债券利率</h3>
          <div class="section-content" id="bond-yield-content"></div>
        </section>
        
        <!-- 集团上市公司 -->
        <section class="summary-section" id="summary-group-listed">
          <h3><i class="bi bi-building"></i> 集团上市公司</h3>
          <div class="section-content" id="group-listed-content"></div>
        </section>
        
        <!-- 财经资讯 -->
        <section class="summary-section" id="summary-news">
          <h3><i class="bi bi-newspaper"></i> 财经资讯</h3>
          <div class="section-content" id="news-content"></div>
        </section>
      </div>
    </div>
  `;
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .weekly-summary-view {
      padding: 20px;
    }
    
    .view-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--color-border);
    }
    
    .view-header h2 {
      margin: 0;
      color: var(--color-primary);
    }
    
    .btn-export-pdf {
      background-color: var(--color-primary);
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn-export-pdf:hover {
      background-color: var(--color-primary-dark);
    }
    
    .summary-section {
      margin-bottom: 32px;
      padding: 16px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background-color: var(--color-background-card);
    }
    
    .summary-section h3 {
      margin-top: 0;
      margin-bottom: 16px;
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .section-content {
      min-height: 100px;
    }
    
    @media print {
      .btn-export-pdf {
        display: none;
      }
      
      .weekly-summary-view {
        padding: 0;
      }
    }
  `;
  mount.appendChild(style);
  
  // 渲染各部分内容
  await renderSectionContent('equity-cn-content', renderEquityCn);
  await renderSectionContent('equity-global-content', renderEquityGlobal);
  await renderSectionContent('cny-fx-content', renderCnyFx);
  await renderSectionContent('open-market-content', renderOpenMarket);
  await renderSectionContent('bond-yield-content', renderBondYield);
  await renderSectionContent('group-listed-content', renderGroupListed);
  await renderSectionContent('news-content', renderNews);
  
  // 绑定导出按钮事件
  const exportBtn = mount.querySelector('#export-pdf-btn');
  exportBtn.addEventListener('click', exportToPdf);
}

/**
 * 渲染特定区域的内容
 * @param {string} elementId - 元素ID
 * @param {Function} renderFn - 渲染函数
 */
async function renderSectionContent(elementId, renderFn) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  try {
    // 创建临时元素用于渲染
    const tempElement = document.createElement('div');
    await renderFn(tempElement);
    element.appendChild(tempElement);
  } catch (error) {
    console.error(`渲染 ${elementId} 失败:`, error);
    element.innerHTML = `<p class="error">内容加载失败: ${error.message}</p>`;
  }
}

/**
 * 导出为PDF
 */
function exportToPdf() {
  // 显示提示信息
  alert('由于技术限制，目前请使用浏览器的打印功能并选择"另存为PDF"来导出周报。');
  
  // 可以在这里添加更多PDF导出逻辑，例如使用jsPDF等库
  // 这里暂时使用浏览器打印功能作为替代方案
  window.print();
}