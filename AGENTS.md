# AGENTS.md — D2 VS Code 插件开发指南

[d2lang/d2-vscode](https://github.com/d2lang/d2-vscode) 的个人 fork。插件不内嵌 d2，运行时通过 `D2.execPath`（默认 PATH 上的 `d2`）调用 CLI。

## 规则

- **插件 ID 固定 `mine.d2`**（publisher=mine、name=d2），不要改回 Terrastruct（原因见 `docs/packaging.md`）。
- **不要主动升级 `package.json` 的 `version`**，用户明确要求才改；重装用 `--force` 覆盖。版本号只能 3 段（vsce 拒绝 4 段）。
- 注释写高价值中文注释（设计意图、边界条件），不写逐行解释。
- 水印功能已整体删除（2026-09-17），不要恢复。
- 导出命令都是顶层：`D2.CompileToPng/Pdf/Pptx/Gif`（位图，走 `compileBinary()`）与 `D2.CompileToSvg` 之外还有 `D2.CompileToSvgs`（目录渲染，2026-09-18 新增）——多板文件在 d2 同目录建同名文件夹（`x.d2` → `x/`，含 index.svg + 每 board 一个 SVG），单板文件退化为单个 SVG；输入都走 stdin，未保存的内容也能导出。
- **TALA 已随 d2 内置**（v0.9.0 起开源，实测 `d2 layout` 列出 `tala (bundled)`，不需要单独装 `d2plugin-tala` 就能 `--layout=tala`），所以 `layoutPicker` 固定列出 tala，不要再加"装了插件才显示"的探测。

## 修改 → 打包 → 安装

`yarn run dev` 一条命令完成打包 + 安装；改动细节（产物命名、装到哪个编辑器、niu、哪些文件必须重新打包）见 **`docs/packaging.md`**。

**最容易踩的一条**：`pages/previewPage.html` 虽然不走 webpack，但扩展运行时从**安装目录**读取它（`extContext.extensionPath`），所以改完**必须重新打包安装**，重开预览面板不会生效。

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/extension.ts` | 注册命令、监听文档事件 |
| `src/tasks.ts` | 调 d2 CLI：`compile()`（stdin→SVG）、`compileBinary()`（stdin→位图）、`format()` |
| `src/docToPreviewGenerator.ts` / `src/browserWindow.ts` | 预览面板中间层 / WebviewPanel 包装 |
| `src/boardParser.ts` | 解析 d2 源码顶层 layers/scenarios 一级键名（深度扫描，容错），供场景栏使用 |
| `pages/previewPage.html` | 预览页交互（拖拽、缩放、Fit），JS 用 `var` 是历史风格 |

## 深度研究文档

board 导航相关（layers/scenarios 语义、`.link` 与 href 格式规则、`@` 导入语法、场景栏预览实现、SVG 内场景栏可行性、复测方法）见 **`docs/board-navigation.md`**——动手改跳转/场景栏/导入相关功能前先读它，里面有全部已验证结论，避免重做 CLI 实验。

sketch 与字体相关（sketch 为何没有中文手写体、`--font-*` 重置其余槽位的陷阱、simhei 默认值在 sketch 下为何有害、合并字体方案、字体回退报错辨析、复测方法）见 **`docs/sketch-cjk-fonts.md`**——动手改导出字体/`exportFontPath`/sketch 相关功能前先读它。

术语正名（board / layer / scenario / board path 等）见根目录 **`GLOSSARY.md`**。

更多细节见 tech-doc 仓库 `工具/D2/修改 D2 VSCode 插件.md`（水印等章节已过时，以本文件为准）。

## Agent skills

### Issue 追踪

Issues 与 spec 以 markdown 文件存在本仓库 `.scratch/<feature-slug>/`（上游 GitHub Issues 已关闭，不用 `gh`）。见 `docs/agents/issue-tracker.md`。

### Triage 标签

五个默认 triage 角色，取值与角色名相同，落在 issue 文件顶部的 `Status:` 行。见 `docs/agents/triage-labels.md`。

### 领域文档

single-context：根目录一个 `GLOSSARY.md`，ADR 落 `docs/adr/`。见 `docs/agents/domain.md`。
