# 金融市场周报站点

基于静态 HTML / CSS / JavaScript 搭建的“金融市场周报”展示站点，包含行情、汇率、债券、公开市场等视图，并附带 Excel→JSON 的浏览器转换工具帮助维护数据。

## 快速预览

1. 启动任意静态服务器（VS Code Live Server、`python -m http.server`、`npx serve` 等）。
2. 在浏览器访问 `index.html`，即可浏览站点全部模块。
3. 如需切换数据，请先更新 `data/values-only/*.json` 再刷新页面。

> 站点为零构建静态项目，无需安装额外依赖；只要保证浏览器可访问本地静态资源即可。

## 数据更新流程

- 打开 `tools/convert.html`，上传最新版《周报数据库valuesOnly.xlsx》，并点击 **批量导出 JSON**。
- 下载得到的 `values-only.zip`，解压后核对文件内容。
- 将各个 JSON 覆盖复制到 `data/values-only/` 目录。
- 若要了解表格要求与数据结构细节，请参考 `docs/DATA_README.md`。

## 目录速览

```
├── components/      # Header / Sidebar / Footer 等页面片段
├── css/             # 全站样式（含主题变量与组件样式）
├── data/values-only # 页面加载的 JSON 数据源
├── js/              # 站点主逻辑与数据适配器
│   ├── views/       # 各业务视图渲染逻辑
│   └── x2j/         # Excel→JSON 转换核心模块
├── tools/
│   ├── convert.html # 浏览器端转换入口
│   └── tests/       # Sheet 专用转换测试脚本（Node + ECMAScript 模块）
└── docs/            # 额外的数据维护说明
```

## 测试与校验

- 在浏览器打开 `tools/convert.html` 可快速验证 Excel 是否能成功解析。
- `tools/tests/*.mjs` 提供针对部分 Sheet 的 Node 脚本，便于在命令行环境复核解析结果（需 Node ≥ 18）。
- 更新数据后，建议使用浏览器 DevTools 查看 Console 是否存在解析报错。

## 贡献说明

提交文档或数据变更前，请确保：

- `data/values-only/` 中的 JSON 通过转换工具生成或经过人工核对。
- 如需新增 Sheet，请同步更新 `js/data-adapter.js` 与 `js/x2j/profiles.js` 的映射表。
- 文档改动与数据脚本保持一致，避免引用已移除的工具或文件。
