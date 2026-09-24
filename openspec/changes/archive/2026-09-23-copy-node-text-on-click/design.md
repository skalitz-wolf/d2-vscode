# Design

## Context

- 预览页 `pages/previewPage.html` 是纯前端单文件（不走 webpack，改完重开预览即生效），所有鼠标交互都在这一个文件里：`init()` 里注册 `mousedown`，window 级 `mousemove`/`mouseup` 完成平移，window 级 `click` 处理角标跳转。
- 已有交互分层（见 `docs/board-navigation.md` §4）：`mousedown` 时按 `event.target.closest(...)` 分流——角标 `.appendix-icon` 放行、文字 `text` 放行（原生划选）、其余 `preventDefault()` 并进入平移。
- d2 v0.9.0 的文字渲染结构（CLI 实测）：
  - 单行标签 → 一个 `<text>`，纯文本子节点；
  - 多行标签（`"a\nb\nc"`）→ 一个 `<text>`，每行一个 `<tspan>`（`dy` 递增）；
  - markdown 富文本 → `<g class="md md-native">` 下**并列多个** `<text>`（粗体/斜体/普通各一片）；
  - `--sketch` 模式文字仍是 `<text>`。
- 关键陷阱：`element.textContent` 对 `<tspan>` 是**无分隔符拼接**（`alpha`+`beta`+`gamma` → `alphabetagamma`），不能直接用。
- VS Code 1.138 的 webview 宿主为内层 iframe 声明了 `allow="... clipboard-read; clipboard-write;"`（仅在 `allowScripts` 为真时追加，本插件已开 `enableScripts: true`），因此 `navigator.clipboard.writeText` 可用。

## Goals / Non-Goals

**Goals:**

- 单击 SVG 文字即复制该 `<text>` 的全部内容，多行按行拼接。
- 与既有交互（平移、划选、角标跳转、缩放）零冲突，且不改动扩展端代码。
- 复制有就地反馈，失败有兜底路径。

**Non-Goals:**

- 复制节点路径（`<g class>` 的 base64 可解出 `container.inner`）——留作将来「跳转源码定义」的钩子，本次不做。
- 复制整个节点标签（跨多个并列 `<text>` 聚合）——用户已明确选择"命中哪一片就复制哪一片"。
- 自定义右键菜单、全图复制、多段选择复制。
- 在扩展端增加剪贴板消息通道。

## Decisions

### 1. 用 `click` 事件驱动复制，而不是自己配对 `mousedown`/`mouseup`

浏览器只在「按下与松开落在同一元素」时才派发 `click`，拖选、拖拽平移都天然不会触发。自己配对需要额外维护按下坐标、位移阈值，是重复实现浏览器已有的语义。

- 备选：`mouseup` + 位移阈值判定。放弃——多写状态且阈值需调参。
- 备选：`mousedown` 立即复制。放弃——会与划选、平移抢跑。

### 2. 以「选区是否折叠」作为单击/划选的唯一判据

```
window.getSelection()
  |-- 非折叠（用户刚划选过） --> 不复制，保留选区
  |-- 折叠（纯单击）         --> 复制
```

这条规则同时覆盖了「划选后在同一元素上松开」的情况——那种情况 `click` 会派发且选区非空，必须放行。

### 3. 文本提取：优先遍历行元素，按行 `\n` 连接

```
if (el.querySelector('tspan'))  → 取每个行元素文本，用 \n join
else                            → 取 textContent
```

判据是「有无行元素」而不是「有没有换行」，因为 d2 只对真正的多行标签生成行元素；单行超长标签（d2 不自动换行）仍是一个文本节点，直接取全文即为"整行"。

### 4. 剪贴板写入三级退化，但只在前端

| 顺序 | 手段 | 理由 |
|---|---|---|
| 1 | `navigator.clipboard.writeText()` | webview 已声明 `clipboard-write`，零扩展端代码 |
| 2 | `document.execCommand('copy')` + 隐藏 textarea | API 被拒/不可用时的兜底（VS Code 自身右键复制也走这条） |
| 3 | 扩展端 `vscode.env.clipboard` | **本次不做**——需新增消息通道，收益不抵复杂度；真出问题再加 |

失败路径必须 `catch` 且不抛出未捕获异常：预览页的脚本一旦崩溃，整个 webview 交互（缩放、平移、跳转）全部失效。

### 5. 反馈用就地高亮，不复用 `#toast`

`#toast` 同时承载「Loading...」与编译错误列表，复用它会把错误信息顶掉（spec 里有对应场景）。改为给被复制的文字加一个 class 闪一下，几行 CSS + 一个 `setTimeout` 清除即可，且语义精确——用户一眼看到"复制的就是这段"。

### 6. 光标保持文本选择语义（已与用户确认）

`#previewWrapper text { cursor: text }` 保持不变：I 型光标同时提示「可划选」与「此处文字可操作」，且与既有行为一致，不引入新的视觉语言。

- 已考虑并否决：改为 `cursor: copy`。理由：单击复制虽更易发现，但会弱化划选的提示，而划选是既有能力；用户明确选择保留 I 型。
- 拖动中仍需保持 `grabbing`（既有 `#previewWrapper.is-dragging text` 规则继续生效），否则平移经过文字时手型会闪。
- 可发现性改由复制成功后的就地高亮承担（见决策 5），不依赖光标。

### 7. 双击不加延时

双击会派发两次 `click`，第一击（`detail === 1`）就完成复制，随后原生选词生效。要彻底规避只能延迟 ~250ms 等第二击，代价是复制手感变钝。选择不加延时：副作用无害（双击时顺手把整行也复制了），spec 只要求「双击仍能选词、页面不崩」。

### 8. 不做修饰键变体

Ctrl+单击之类的方案能完全避开与划选的冲突，但用户要的是"点击一下"。保留现状即可。

## Risks / Trade-offs

- [富文本节点单击只复制一片文字，用户可能期望整节点] → 已与用户确认按"复制整行"字面语义处理；spec 中明确该行为，将来若要聚合，改动局限于文本提取函数。
- [d2 升级可能改变文字渲染结构（如改用别的标签）] → 选择器只依赖 `text` 元素（SVG 文本的原生标签，最稳定的一层）；`docs/board-navigation.md` 会记录该依赖与复测方法。
- [`document.execCommand` 已被废弃] → 仅作兜底路径，主路径是 Clipboard API；若浏览器彻底移除，退化为"复制失败但页面不崩"。
- [复制高亮与用户划选高亮视觉相近，可能混淆] → 高亮使用与原生选区明显不同的样式（如底色 + 短暂时长），且不改变选区本身。
- [不换光标意味着单击复制的可发现性完全依赖事后反馈] → 已与用户确认接受；就地高亮是唯一提示手段，需保证其足够明显。
- [预览页脚本崩溃会连带破坏缩放/平移/跳转] → 复制逻辑整体包在 `try/catch` 内，异常只记录不抛出。

## Migration Plan

无需迁移。`pages/previewPage.html` 不经 webpack，改完关闭并重新打开预览面板即生效；**不需要** `yarn run package` 与 `code --install-extension` 重装。回滚 = 还原该文件（纯前端，无数据或状态变更）。

## Open Questions

无。光标语义已确认（保留文本选择语义，见决策 6）；高亮的具体视觉参数（时长、底色）属实现细节，不影响 spec 与任务拆分。

## 实现期间发现的既有缺陷（不在本次范围）

- `pages/previewPage.html` 的 `setZoomLevel()` 在给 `zoomLevel` 赋值**之前**调用 `setZoomText()`，而后者读的正是 `zoomLevel`，因此缩放百分比文字比实际值滞后一步（例：`setZoomLevel(142)` 后显示 100%，下一次操作才补上）。
- 已核实为**上游既有问题**，非本次改动引入：同样存在于本次改动前的 `HEAD` 版本，且可追溯到最初引入查看器的提交 `bc5f8cb`。
- 影响面：仅缩放百分比文字显示滞后，不影响实际 `transform`、`pan` 与适配逻辑。
- 未修复：与本次“单击复制”无关联，属独立缺陷，已单独报告用户，留待决定是否单独处理。
