# OpenStep2DWG

纯前端 STEP → DWG 工程图工作台。导入 STEP，在浏览器内生成三视图，调整 A4 排版并导出 CAD 图纸。

![OpenStep2DWG 工作台](docs/workbench.png)

左侧选择模型方向和视图组合；中间拖动视图、缩放画布；「图纸设置」调整比例、尺寸标注和标题栏。「导出图纸」生成可编辑的 DWG / DXF 或 SVG / PNG。

## 功能

- STEP / STP 本地导入；精确隐藏线投影，正面 / 背面 / 前侧或第一角法。
- 0° / 90° / 180° / 270° 模型旋转；完整几何或通用板面薄层简化。
- A4 横向画布，毫米坐标，自动比例、视图拖动与对齐、撤销和重做。
- 外形尺寸、图框、图号、版本、日期；JSON 保存投影几何和全部排版参数。
- DWG / DXF：AutoCAD 2000，原生直线、圆、圆弧、样条和尺寸标注。
- SVG 矢量图；PNG 150 / 300 / 600 DPI；下载和浏览器支持的「另存为」。
- 导出 DWG 后在 Worker 内回读，检查文件头及实体数量。转换可随时取消。

## 使用

1. 点击「导入 STEP 文件」或把文件拖入画布，自动开始转换。
2. 更换视图组合或旋转方向后，点击「生成工程图」。
3. 滚轮缩放画布，空白处拖动平移；拖动一个视图调整位置，或输入毫米坐标。
4. 在「图纸设置」调整比例和标题栏，点击「导出图纸」。

![导出图纸](docs/export.png)

「保存项目」包含已计算的投影、方向、比例、坐标和标题栏。再次打开 JSON 即可排版和导出；原始 STEP 不嵌入 JSON，重新计算投影时需重新选择源文件。

快捷键：`Ctrl/⌘ Z` 撤销，`Ctrl/⌘ Shift Z` 重做，`Ctrl/⌘ S` 保存项目。选中视图后用方向键移动，按住 Shift 每次移动 5 mm。

## 本地运行

需要 Node.js 24 或更新版本。仓库包含编译好的 DWG WebAssembly，普通前端开发无需安装 Rust。

```sh
npm ci
npm run build
npm run dev
```

打开 <http://127.0.0.1:4178>。开发服务器仅提供静态文件；页面不调用任何转换服务。修改源文件后重新运行 `npm run build` 并刷新页面。

## 纯前端实现

```text
本地 STEP → OpenCascade.js / WASM（精确 HLR）
         → 三视图几何 JSON → A4 排版 → DXF
         → acadrust / WASM → DWG → 回读校验 → 下载
```

两种内核均运行在独立 Worker 中；源文件不上传。取消操作直接终止 Worker 并释放其内存。同一会话最多缓存两组投影，更改图框或排版不重复计算 STEP。

- [OpenCascade.js](https://github.com/donalffons/opencascade.js)：锁定 `2.0.0-beta.b5ff984`，通过 npm 完整性校验取得几何内核。
- [acadrust](https://github.com/hakanaktt/acadrust)：锁定 `0.5.5`，Rust 包装器源码在 [engine/src/lib.rs](engine/src/lib.rs)。
- [WASM 编译脚本](scripts/build-engine.sh)：安装 Rust 后执行 `bash scripts/build-engine.sh`，可替换 `engine/pkg/` 下的内核。
- [第三方声明](THIRD_PARTY_NOTICES.md)与[许可证文本](docs/licenses/)。

## 当前边界

- 输出是 **二维工程 DWG**，不包含三维 ACIS 实体；预览显示将导出的二维图纸，当前没有自由旋转的三维预览或任意 DWG 文件查看器。
- 图纸按毫米绘制，几何按图纸比例缩放；尺寸标注使用比例补偿显示实际毫米值。
- 直线、圆弧和可转换的 NURBS 保留原生 CAD 实体。不能精确转换的少数曲线会按 0.01 mm 公差离散，并在「模型信息」和转换结果中报告数量。SVG / PNG 中的样条按相同公差绘制。
- 精确投影较耗时。复杂开发板 STEP 在桌面浏览器中可能需要数分钟；当前单文件上限为 150 MB，实际可处理大小仍取决于几何复杂度和浏览器内存。
- 首次转换需要下载约 48 MiB 的几何内核，DWG 内核约 4.3 MiB；静态资源可由浏览器缓存。
- 自动尺寸是投影视图的整体包络尺寸，不自动推断公差、加工基准或装配要求。薄层简化适合主要板面平行于 XY 平面的模型，需检查结果。
- DWG 内部回读不能代替所有 CAD 软件的兼容性测试；独立验证方法与记录见 [验证说明](docs/VALIDATION.md)。

## 验证与发布

```sh
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

本地端到端测试默认使用已安装的 Chrome；CI 使用 Playwright Chromium。`STEP_TEST_FILE=/path/to/model.step npm run test:e2e -- --grep 'real STEP regression'` 可运行本地真实模型回归。测试模型不进入静态站点。

GitHub Actions 在 PR、main 和版本 tag 上执行测试；`v*` tag 或手动运行发布工作流时，将纯静态 `dist/` 部署到 GitHub Pages，并为 tag 创建打包附件。仓库 Settings → Pages 的 Source 需设为 **GitHub Actions**。

示例 `DEMO-BOARD.step` 为本项目程序生成的通用开发板几何，可运行 `node scripts/create-demo.mjs` 重建。它不包含客户 HDK 或产品模型。

本项目应用代码使用 MIT；依赖保留各自许可证。
