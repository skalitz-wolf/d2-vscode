# Proposal

## Why

预览面板的缩放百分比文字**永远显示上一次的值**：把滑块拖到 400% 显示的是 333%，`resetZoom` 之后显示的是重置前的比例。原因是 `pages/previewPage.html` 的 `setZoomLevel()` 在给 `zoomLevel` 赋值**之前**就调用 `setZoomText()`，而后者读的正是 `zoomLevel`。

同一行还藏着一个更严重的缺陷：`zoomSlider.value` 是**字符串**，原样存进 `zoomLevel` 后，下一次 `setZoomText()` 会因字符串没有 `.toFixed` 而抛 `TypeError`。预览页的脚本是一整个 `<script>` 块，**一次未捕获异常就会让缩放、平移、board 跳转、场景栏全部失效**，用户只能重开预览面板。

两个缺陷均可追溯到最初引入查看器的提交 `bc5f8cb`，属上游遗留；本次一并修正。

## What Changes

- `setZoomLevel()` 改为**先赋值、后刷新文字**，与同文件中本来正确的 `zoomTo()` / `zoomFit()` 顺序一致，消除百分比滞后。
- `setZoomLevel()` 对入参做 `Number()` 转换，消除字符串 `zoomLevel` 引发的 `TypeError`（滑块拖动路径与扩展端消息路径都会传字符串）。
- 缩放滑块、`resetZoom` 消息、`render` 消息（保留缩放分支）三条路径的百分比显示与 `zoomLevel`、`transform` 保持一致。
- 不改变任何缩放数值语义：`applyTransform` 使用的比例、`pan` 计算、fit 行为全部不变。

## Capabilities

### New Capabilities

<!-- 无：本次是对既有 preview-interaction 能力的缺陷修正 -->

### Modified Capabilities

- `preview-interaction`: 新增「缩放状态与百分比显示保持一致」的要求——百分比文字 MUST 反映当前生效的缩放比例，且缩放入口 MUST NOT 因入参类型（字符串/数字）而中断预览脚本。

## Impact

- **代码**：仅 `pages/previewPage.html` 的 `setZoomLevel()` 一个函数（该文件不走 webpack，改完重开预览即生效，无需重新打包或重装 vsix）。
- **扩展端**：无改动。
- **依赖**：无。
- **行为变化**：修复后百分比文字立刻正确（此前滞后一步）；滑块连续拖动不再中断预览。
- **文档**：`docs/board-navigation.md` §7 中"复查缩放百分比时注意"一段需从"上游既有缺陷，尚未修复"改为已修复并记录复现/验证方法。
