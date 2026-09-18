# AGENTS.md — D2 VS Code 插件（个人 fork）开发指南

[d2lang/d2-vscode](https://github.com/d2lang/d2-vscode) 的个人 fork，开发分支 **`feat-0.9.0-260917`**。插件不内嵌 d2，运行时通过 `D2.execPath`（默认 PATH 上的 `d2`）调用 CLI。

**插件 ID 是 `wentong.d2`（publisher 已从 Terrastruct 改为 wentong）**，与官方 `terrastruct.d2` 区分开：ID 相同会被 VS Code 视为官方插件的本地副本，检查更新/修复时被市场版本覆盖（2026-09-18 实际发生过）。命令名（`D2.*`）与设置项来自 `contributes` 声明，与 ID 无关，换 ID 后使用无差异。不要改回 Terrastruct。

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
- 预览内支持 board 跳转：单板渲染时 d2 给 `.link: layers.xxx` 节点生成 `root.*` 路由链接，`browserWindow.ts` 识别后用对应 `--target` 重新编译（board 路径大小写敏感，不能用 toLowerCase）；跳转只认 d2 自带的 `.appendix-icon` 角标（渲染在 `<a>` 外面、无 DOM 嵌套关系，webview 按几何重叠面积关联到 `<a>`）。返回是浏览器式历史栈：`D2P.boardHistory`，角标跳转压栈、返回按钮弹栈（`navigateBack` 消息），新开预览窗口时清空并重置回主板。坑：`#toolbar` 必须 `box-sizing: border-box`，否则 width:100% + padding 使工具栏溢出视口，绝对定位在其右缘的返回按钮被推出屏幕外。
- TALA 已内置开源；sketch 手写体只覆盖英文，中文用黑体是预期行为。

更多细节见 tech-doc 仓库 `工具/D2/修改 D2 VSCode 插件.md`（水印等章节已过时，以本文件为准）。
