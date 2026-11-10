# 预览浮窗：自建单面板 + webview 内页签，不复用 VS Code 内置「移到新窗口」

多个 d2 图的预览要共用一个 OS 窗口（内含页签）。VS Code 的内置「Move into New Window」每个 WebviewPanel 分离后独占一个窗口，且扩展没有任何 API 能把面板移进一个已存在的分离窗口（microsoft/vscode#213516）。因此预览浮窗不依赖内置分离功能，而是扩展自建：一个单例 WebviewPanel，页签条画在 webview 里，扩展端按文档缓存渲染结果，面板整体被用户用内置功能分离时天然就是"唯一那个窗口"。

## Considered Options

- 复用内置分离 + 挂靠已有窗口：不可行，无 API（#213516）。
- 复用内置分离 + 用户手动拖 tab 进窗口：依赖 VS Code 版本行为，无法由扩展保证，放弃。
- 自建浮窗（选定）：入口为 d2 编辑器标题栏的「D2」按钮（`$(open-preview)` 图标，`editor/title` 的 `navigation` 组，不被折叠进溢出菜单），从源码直达；与主窗口预览面板（`D2.ShowPreviewWindow` 那套）完全分离，互不影响。

## Consequences

- 面板首次创建后立即执行内置命令 `workbench.action.moveEditorToNewWindow`，把它移进独立 OS 窗口（弹窗形态）；随后再执行 `workbench.action.enableCompactAuxiliaryWindow` 开 compact 模式，隐藏浮窗顶部 VS Code 原生页签条/状态栏（否则与 webview 内自绘页签条形成两套页签）。两条命令都作用于活动编辑器/活动浮窗，因此只在面板创建紧跟着 reveal 时执行一次。老版本 VS Code 缺命令时逐步降级：无 move 命令面板留在编辑区；无 compact 命令浮窗保持普通模式。
- 无法从扩展侧检测用户是否把面板又拖回主窗口（分离后 viewColumn 不变），此场景下再点按钮不会重新弹窗；关掉弹窗重开会再次弹出（并重新执行 compact）。
- 编辑器标题栏按钮必须带 icon 才会显示为按钮（无 icon 折叠进 … 菜单），想要文字 "D2" 只能用画着 D2 文字的 SVG 图标（浅/深主题各一份，`resources/d2-*.svg`）。

- 浮窗同一时刻只渲染一个页签的图；页签切换靠扩展端重发缓存的 SVG，zoom/pan 按页签缓存在 webview 端。
- 浮窗关闭即清空（不记页签集合）；下次点按钮只开当前文档。
- 浮窗与主窗口预览是两套独立体系：`D2P.outputDoc` 模型未动，刷新（updateOnSave/autoUpdate）各自独立路由。
