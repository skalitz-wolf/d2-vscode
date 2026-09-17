# AGENTS.md — D2 VS Code 插件（个人 fork）开发指南

[d2lang/d2-vscode](https://github.com/d2lang/d2-vscode) 的个人 fork，开发分支 **`fix-优化-260813`**。插件不内嵌 d2，运行时通过 `D2.execPath`（默认 PATH 上的 `d2`）调用 CLI。

## 规则

- **不要主动升级 `package.json` 的 `version`**，用户明确要求才改；重装用 `--force` 覆盖。版本号只能 3 段（vsce 拒绝 4 段，如 `0.8.8.1`）。
- 注释写高价值中文注释（设计意图、边界条件），不写逐行解释。
- 水印功能已整体删除（2026-09-17），不要恢复；导出命令是四个顶层命令 `D2.CompileToPng/Pdf/Pptx/Gif`。

## 修改 → 打包 → 安装

```bash
cd "D:/Users/wentong/IdeaProjects/d2-vscode"
yarn install --frozen-lockfile   # node_modules/ 存在则跳过
yarn run package                 # webpack production → dist/extension.js
yarn run pkg                     # vsce → d2.vsix（文件名固定，不带版本号）
code --install-extension d2.vsix --force
```

装完在 VS Code 里 Reload Window 生效。`pages/previewPage.html` 不走 webpack，改它只需重开预览，不用打包。

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/extension.ts` | 注册命令、监听文档事件 |
| `src/tasks.ts` | 调 d2 CLI：`compile()`（stdin→SVG）、`compileBinary()`（stdin→位图）、`format()` |
| `src/docToPreviewGenerator.ts` / `src/browserWindow.ts` | 预览面板中间层 / WebviewPanel 包装 |
| `pages/previewPage.html` | 预览页交互（拖拽、缩放、Fit），JS 用 `var` 是历史风格 |

## d2 CLI 要点（v0.9.0 实测）

- 传参 `--target= --layout/--theme/--sketch/-`；`--target=`（空值）固定只渲染主 board，多板文件（layers/scenarios）也能预览/导出（单板无副作用）；文件里 `vars.d2-config` 声明了 `theme-id`/`layout-engine` 时不传对应参数（文件优先）。
- 位图导出必须传中文字体：CJK 字体回退有 bug（Windows 落到 `malgun.ttf` 报错），`resolveExportFont` 默认自动传 `simhei.ttf`，用户可用 `D2.exportFontPath` 覆盖。d2 只认 `.ttf`（雅黑 `.ttc` 不行）；`Deng*.ttf` 有标签高度量成 0 的 bug，别用。
- 含 `layers`/`scenarios` 的文件默认要输出多个 SVG 写不进 stdout，`--target=` 已解决（只渲染主板）；渲染指定层用 `d2 file.d2 --target=layers.x.* out`。
- 预览内支持 board 跳转：单板渲染时 d2 给 `.link: layers.xxx` 节点生成 `root.*` 路由链接，`browserWindow.ts` 识别后用对应 `--target` 重新编译（board 路径大小写敏感，不能用 toLowerCase）；当前 board 记在 `D2P.currentTarget`，编辑自动刷新沿用不跳回主板；webview 右上角"返回主板"按钮由 render 消息的 `board` 字段控制显隐。
- TALA 已内置开源；sketch 手写体只覆盖英文，中文用黑体是预期行为。

更多细节见 tech-doc 仓库 `工具/D2/修改 D2 VSCode 插件.md`（水印等章节已过时，以本文件为准）。
