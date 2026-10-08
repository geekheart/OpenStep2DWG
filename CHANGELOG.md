# Changelog

## V1.0.1 — 2026-10-08

- 统一 MIT 许可；补充完整英文 README 与双语入口。
- 增加中英文界面、可切换的 Worker 提示及 GitHub 图标按钮；保留模型和排版状态。
- Add Chinese/English localization, a complete English README and an accessible GitHub link.
- Keep geometry, CAD data and undo history unchanged when switching languages.
- [完整中英文发布说明 / Full bilingual release notes](docs/releases/V1.0.1.md)。

## V1.0.0 — 2026-09-22

- 首个公开版本：浏览器内导入 STEP、生成三视图并导出二维 DWG。
- A4 毫米画布、四向旋转、视图拖动与对齐、原生尺寸标注和标题栏。
- JSON 项目保存与恢复；DWG / DXF / SVG / PNG 下载。
- 已解析模型复用、压缩内核下载与本地投影缓存。
- 连续投影出现空视图时，在独立内核中自动恢复失败方向。
- 精简页面文字，补充操作截图、部署文档及 GitHub Pages / Release 自动发布。
- 完成浏览器回归、三份真实模型验证和 ODA 独立 DWG 回读，详见 [验证记录](docs/VALIDATION.md)。

## 0.1.0（本地开发）

- Browser-only STEP import and exact hidden-line projection using OpenCascade.js.
- Browser-only AutoCAD 2000 DWG encoding and roundtrip checks using acadrust.
- A4 drafting, orthographic views, orientation controls, dimensions and title block.
- View dragging, canvas zoom/pan, alignment, undo/redo and JSON projects.
- DWG / DXF / SVG / PNG exports, generated example, automated tests and Pages workflow.
