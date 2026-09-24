# Proposal

## Why

预览图里的文字目前只能靠"按住左键划选 + Ctrl+C"复制：`pages/previewPage.html` 已经放行了原生文字选中，但鼠标默认是抓取手型、单击文字没有任何反馈，用户看到图里一段文字想拿走时，第一反应是点一下，结果什么都没发生。图上的节点名、连线标签、markdown 正文往往正是用户想复制到文档或聊天里的内容，现在必须精确拖选一段文字才能拿到，多行标签还很难拖准。

## What Changes

- 预览中**单击 SVG 文字即复制该 `<text>` 的全部内容**到系统剪贴板：
  - 多行标签（d2 把每行渲染成一个 `<tspan>`）按行拼接，行间用换行符分隔；
  - markdown 富文本节点被 d2 拆成多个兄弟 `<text>`（粗体/斜体/普通各一片），单击只复制点中的那一片，与"复制整行"语义一致；
- 复制成功/失败给出**就地视觉反馈**：被复制的文字短暂高亮，悬停文字时光标变为 `copy` 提示可点；
- **保留既有交互不变**：单击框体/空白仍是拖动平移；在有选区时单击不覆盖用户已划选的内容；单击 d2 自带的 `.appendix-icon` 角标仍是 board 跳转；双击选词不受影响（会在第一击时顺手复制整行，属可接受副作用）。
- 剪贴板写入只走 webview 前端（`navigator.clipboard.writeText`，失败退化为 `document.execCommand('copy')`），**不新增扩展端消息通道**，因此 `src/browserWindow.ts` 等扩展代码不变。

## Capabilities

### New Capabilities

- `preview-interaction`: 预览面板内鼠标交互的既有约定与新增能力——拖动平移、缩放、文字选中、角标跳转、场景切换，以及本次新增的"单击文字复制"；包含各交互之间的优先级与冲突消解规则（谁先响应一次鼠标按下/单击）。

### Modified Capabilities

<!-- 无既有 spec，本次为该项目的第一个 capability -->

## Impact

- **代码**：仅 `pages/previewPage.html`（不走 webpack，改完重开预览即生效，无需 `yarn run package` / 重装 vsix）。
- **扩展端**：无改动。不新增 `webView.postMessage` 命令，`src/browserWindow.ts`、`src/docToPreviewGenerator.ts`、`src/tasks.ts` 保持原样。
- **依赖**：无新增依赖；仅使用 webview 已有的 Clipboard API（VS Code webview 宿主已为 iframe 声明 `clipboard-write` 权限）。
- **平台**：依赖 d2 输出 SVG 的既有结构（`<text>` / `<tspan>`），d2 升级若改变文字渲染结构需要重新验证；`--sketch` 模式文字仍是 `<text>`，同样适用。
- **文档**：`docs/board-navigation.md` 的预览实现要点一节需要补一条交互说明（该文档是预览交互研究的汇总处）。
