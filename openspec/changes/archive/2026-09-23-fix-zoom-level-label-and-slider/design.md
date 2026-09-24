# Design

## Context

- 缺陷位置：`pages/previewPage.html` 的 `setZoomLevel(zl)`。原实现顺序为
  `applyTransform(zl)` → `setZoomText(true)` → `zoomSlider.value = zl` → `zoomLevel = zl`，
  而 `setZoomText()` 内部读的是 `zoomLevel`，于是文字永远落后一步。
- 同文件内 `zoomTo()` 与 `zoomFit()` 的顺序是对的（先赋 `zoomLevel`、后 `setZoomText()`），
  所以**只有 `setZoomLevel()` 这条路径**表现出滞后，这也是缺陷不易察觉的原因——
  按钮缩放、Ctrl+滚轮、fit 都正常，只有滑块与重置缩放不对。
- `zoomSlider.value` 与扩展端消息传来的都是**字符串**。`zoomLevel` 被写成字符串后，
  下一次 `setZoomText()` 调 `zoomLevel.toFixed()` 抛 `TypeError`。
- 预览页的交互代码是**单个 `<script>` 块**，一次未捕获异常即中断全部交互
  （缩放、平移、board 跳转、场景栏），用户只能重开预览面板——所以第二处缺陷的影响远大于第一处。
- 缺陷可追溯到最初引入查看器的提交 `bc5f8cb`，属上游遗留，非本次改动引入（已用改动前的
  `HEAD` 版本逐字节比对确认）。
- 验证环境：jsdom 无头 harness（`docs/board-navigation.md` §7），无真实浏览器可用。

## Goals / Non-Goals

**Goals:**

- 百分比文字与当前生效的缩放比例始终一致。
- 缩放入口的任何合法入参形式都不引发未捕获异常。
- 三条入口路径（滑块、`resetZoom` 消息、保留缩放的 `render`）行为一致。

**Non-Goals:**

- 不改动缩放数值语义（`applyTransform` 的比例、`pan` 计算、fit 逻辑）。
- 不重构缩放相关函数（`zoomTo` / `zoomFit` / `zoomFitBoth` 已正确，不动）。
- 不改变扩展端任何代码。
- 不引入缩放动画、缓动等新特性。

## Decisions

### 1. 只修 `setZoomLevel()`，向已有的正确顺序对齐

把顺序改为 `zoomLevel = Number(zl)` → `applyTransform(zoomLevel)` → `zoomSlider.value = zoomLevel` → `setZoomText(true)`，与 `zoomTo()` 保持一致。

- 备选：改 `setZoomText()` 让它接收比例参数（如 `setZoomText(zl)`）。
  放弃——要动 `zoomTo`/`zoomFit`/`zoomFitBoth`/`resetZoom` 四处调用点，
  而其中三处本来就对；改动面越大，越容易碰到已验证正确的路径。
- 备选：在 `setZoomLevel()` 末尾再补一次 `setZoomText(true)`。
  放弃——治标不治本，保留"先读后写"的错误顺序，下次改动容易再踩。

### 2. `Number()` 转换放在赋值处

`zoomLevel = Number(zl)`，让"缩放比例是数值"成为该变量的不变式，而不是在每个读取点各自防御。

- 备选：在 `setZoomText()` 里写 `Number(zoomLevel).toFixed()`。
  放弃——只保住格式化这一处，其他读 `zoomLevel` 做算术的地方（`zoomTo` 的 `newZl / zoomLevel`、
  `zoomPlus` 的 `zoomLevel + zoomStep`）仍会踩到字符串隐式转换的坑。
- 说明：`Number()` 对合法输入（数字、数字字符串）行为一致；非法输入得到 `NaN`，
  而原实现同样会得到 `NaN` 并在 `.toFixed()` 处抛错，故未引入新的失败模式，也未扩大范围去校验输入。

### 3. 不改 `setZoomText(text)` 的签名

`text` 参数历史上未被使用（`setZoomText(true/false)` 调用点都传布尔值，函数体忽略它）。
本次不清理：它不属于本缺陷，且清理会牵动四个调用点，属独立重构。

## Risks / Trade-offs

- [只修一个函数，可能遗漏其他"先读后写"的同类缺陷] → 已用 harness 覆盖三条入口路径
  （滑块、`resetZoom`、保留缩放的 `render`）与 `zoomTo`/`zoomFit` 两条对照路径，52 项断言全过；
  `docs/board-navigation.md` §7 记录了复现与验证方法，便于后续复查。
- [`Number()` 对非法输入返回 `NaN` 而非报错，问题被推迟到下游] → 与原实现的失败点相同
  （均在 `.toFixed()` 抛错），未使情况变差；校验输入属于新范围，本次不做。
- [jsdom 与真实浏览器存在差异，无头通过不等于真机通过] → 断言基于 `transform` 字符串、
  `zoomLevel` 数值、百分比文字与未捕获异常监听，均为与布局无关的状态；真实浏览器需人工确认一次手感。

## Migration Plan

无需迁移。`pages/previewPage.html` 不经 webpack，关闭并重新打开预览面板即生效；
**不需要** `yarn run package` 与重装 vsix。回滚 = 还原该函数。

## Open Questions

无。`setZoomText(text)` 未使用参数的处理属独立重构，已明确列入 Non-Goals。
