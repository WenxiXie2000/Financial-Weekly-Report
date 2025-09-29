# 数据准备与导入指南

本文档说明如何将《周报数据库valuesOnly.xlsx》中的数据转换为站点使用的 JSON 文件，并维护 `data/values-only/` 目录下的数据资源。

## 目录结构

```
周报html版/
├── data/
│   └── values-only/
│       ├── overview.json        # 可选：站点总览页使用
│       ├── equity_cn.json       # 国内股市
│       ├── equity_global.json   # 全球股市
│       ├── cny_fx.json          # 人民币汇率
│       ├── open_market.json     # 公开市场
│       ├── bond_yield.json      # 债券利率
│       ├── group_listed.json    # 集团上市公司
│       └── news.json            # 财经资讯
└── tools/
  └── convert.html             # 浏览器转换工具
```

> **注意：** 所有文件均需使用 UTF-8（无 BOM）与 LF 换行，文件名全部小写并使用下划线，便于在 Linux (UOS) 环境部署。

## Excel 工作表与 JSON 文件映射

| Excel Sheet 名称 | 输出 JSON 文件 |
| ---------------- | --------------- |
| 国内股市         | `equity_cn.json` |
| 全球股市         | `equity_global.json` |
| 人民币汇率       | `cny_fx.json` |
| Shibor利率       | `open_market.json` |
| 公开市场货币     | `open_market.json` |
| 债券利率         | `bond_yield.json` |
| 集团上市公司     | `group_listed.json` |
| 财经资讯         | `news.json` |

- `overview.json` 并非来自 Excel，可根据业务需要手工维护，用于首页总览展示。
- 若 Excel 工作表名称发生变更，请同步更新 `js/data-adapter.js` 与 `js/x2j/profiles.js` 中的映射表，并在转换工具验证输出。

## Excel 表格格式要求

为保证自动解析准确，建议每个 Sheet 按如下结构编排：

1. **顶部为关键指标（Summary）**：
   - 使用两列表示键与值，例如：`上证指数 | 3072.34 (+0.72%)`
   - 可包含单位、更新日期等信息。
2. **留一行空白后，为序列数据表（Series）**：
   - 第一行作为表头，必须包含“日期/Date”与“数值/Value”等字段。
   - 可选列：“系列/Series”用于区分多条曲线；未提供时默认聚合为单一系列。
3. **财经资讯 Sheet**：
   - 建议提供 `标题、来源、时间、链接、摘要` 等列，列名可以为中文或英文关键字。

转换工具会自动识别：

- 表头中包含 `日期 / date / 时间 / time` 字样的列；
- 表头中包含 `数值 / value / price` 等字样的列；
- 如存在 `系列 / series / 名称 / name` 列，将按系列名分组输出多条曲线。

## 使用浏览器转换工具

1. 启动本地静态服务器（如 VS Code Live Server）并访问 `tools/convert.html`。
2. 点击“选择 Excel 文件”，上传最新版《周报数据库valuesOnly.xlsx》。
3. 点击“批量导出 JSON”，工具会在浏览器内解析所有映射 Sheet，生成 `values-only.zip` 并自动下载。
4. 解压 `values-only.zip`，手动核对每个文件内容（可使用 VS Code 或 JSON 查看器）。
5. 将解压后的 JSON 文件拷贝到 `data/values-only/` 目录覆盖原文件。

> **提示：** 工具仅在浏览器本地处理 Excel，不会上传到服务器。如控制台出现解析提醒，可在 Excel 中调整列名后重新导出。

## JSON 数据结构说明

所有模块均遵循统一结构：

```json
{
  "meta": {
    "title": "字符串，可选",
    "unit": "字符串，数值单位",
    "timezone": "Asia/Shanghai",
    "updatedAt": "YYYY-MM-DD 或时间戳",
    "sourceSheet": "Excel 原始 Sheet 名，可选"
  },
  "summary": {
    "KPI 名称": "展示值或对象",
    "示例": "3072.34 (+0.72%)"
  },
  "series": [
    {
      "name": "系列名称",
      "data": [["2025-09-19", "3050.12"], ["2025-09-22", "3072.34"]]
    }
  ]
}
```

- `summary` 可为简单的键值对，或包含 `value/delta/trend` 等字段的对象，前端会自动兼容。
- `news.json` 额外包含 `articles` 数组：

```json
{
  "articles": [
    {
      "title": "标题",
      "source": "来源",
      "time": "2025-09-24 08:30",
      "link": "https://example.com",
      "summary": "简要描述"
    }
  ],
  "series": []
}
```

## 更新流程建议

1. **同步 Excel 数据**：确保 Excel 中数值、日期格式一致且已转为值（无公式）。
2. **执行转换**：使用工具逐个导出 JSON。
3. **校验结果**：
   - 在浏览器中打开 `index.html`，切换各个导航模块确认数据加载与图表渲染正常。
   - 检查 Console，如有格式问题（缺失字段、类型错误）会提示。
4. **版本管理**：将更新后的 JSON 文件纳入 Git 版本控制，方便追踪历史与回滚。

## 常见问题

- **图表为空或报错**：检查 JSON 中 `series` 是否为二维数组，且日期、数值均为字符串。若需要保留数值类型，可在导出后手动调整。
- **主题切换后颜色不更新**：确认 `css/style.css` 中的 CSS 变量未被删除，且 JSON 文件成功加载。
- **新建模块**：如需拓展新的 Sheet/页面，需同步修改：
  1. `js/data-adapter.js` 中的 `SHEET_TO_FILE` 与 `DATASET_TO_FILE`；
  2. `js/app.js` 中的 `PAGE_CONFIGS`；
  3. 更新转换工具内的映射表。

如有疑问，可在提交合并前通过 Live Server 进行一次全站走查，确保“零构建”本地预览体验保持顺畅。
