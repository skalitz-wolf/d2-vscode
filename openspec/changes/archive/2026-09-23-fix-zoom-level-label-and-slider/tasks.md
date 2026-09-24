# Tasks

## 1. 缺陷复现（修复前）

- [x] 1.1 用 jsdom harness 复现百分比滞后：依次调 `setZoomLevel(250)`、`setZoomLevel(400)`、`resetZoom`，验证显示值等于**上一次**的比例（`setZoomLevel(250)` 后显示 100%），且 `zoomTo`/`zoomFit` 两条对照路径本来正确
- [x] 1.2 复现字符串入参崩溃：把 `zoomSlider.value = "400"` 后调 `sliderOnChange()`，再拖一次，验证抛出 `zoomLevel.toFixed is not a function`
- [x] 1.3 确认两处缺陷均为上游遗留而非本次改动引入：`git show HEAD:pages/previewPage.html` 与工作区逐字节比对 `setZoomLevel` 函数体完全一致，并追溯至提交 `bc5f8cb`

## 2. 修复

- [x] 2.1 调整 `setZoomLevel()` 顺序为「先赋值、后刷新」：`zoomLevel = Number(zl)` → `applyTransform` → `zoomSlider.value` → `setZoomText(true)`，与 `zoomTo()` 一致
- [x] 2.2 加高价值中文注释说明两处缺陷的成因（先读后写的滞后、字符串入参的 `TypeError` 及"一次异常中断全部交互"的影响），并说明 `Number()` 为何不可省
- [x] 2.3 确认 `zoomTo`/`zoomFit`/`zoomFitBoth` 三个本来就正确的路径未被改动（`git diff` 只涉及 `setZoomLevel`）

## 3. 修复验证

- [x] 3.1 验证百分比立即正确：`setZoomLevel(250)` 后显示 250%，滑块拖到 400 显示 400%，保留缩放的重新渲染后显示 150%
- [x] 3.2 验证字符串入参不再崩：连续把滑块拖到 400/500/120/750/10，无异常抛出，`zoomLevel` 为 number 类型，滑块 value 与 `zoomLevel` 同步
- [x] 3.3 验证边界与重置：滑块最大值 750 显示 750% 且 `transform` 为 `scale(7.5,7.5)`；`resetZoom` 消息后显示 100% 且 `zoomLevel === 100`
- [x] 3.4 验证无未捕获异常：harness 监听 `window` error 事件，全程为空

## 4. 回归

- [x] 4.1 重跑既有 52 项交互回归（单击复制、多行 `tspan` 拼接、剪贴板兜底、选区优先、mousedown 分流、双击选词、角标优先、场景栏、返回按钮、Recompile），全部通过
- [x] 4.2 把上轮为绕过该缺陷而弱化的断言恢复为强断言：`4.1 前置：已缩放到 142% 并平移` 现在要求百分比文字为 `142%`（修复前只能接受滞后的 100%）

## 5. 文档

- [x] 5.1 更新 `docs/board-navigation.md` §7：把"上游既有缺陷，尚未修复"改为已修复，保留复现方法（含 harness 需要 shim `innerText`、补 `visualViewport`、`postMessage` 需补 `targetOrigin` 三个 jsdom 坑）
