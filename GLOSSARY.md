# D2 预览

VS Code 里预览、导出 `.d2` 图的扩展（d2lang/d2-vscode 的个人 fork）。本上下文的核心是把 d2 的「board」概念映射到预览面板的导航与渲染上。

## Language

**board**:
d2 源码里一个可独立渲染的图单位。一个 `.d2` 文件至少有一个 root board，还可以内含 layer 与 scenario。
_Avoid_: 图, diagram, 画布, 页面

**root board**（主板）:
文件的顶层 board，是预览打开时默认显示的那一个。
_Avoid_: 主图, 基础图, index board
（场景栏里代表 root board 的那个 chip 文案固定为「基础」）

**layer**（图层）:
挂在某个节点上的下钻细节，独立成图，不继承主板。
_Avoid_: 子图, 子页面, 嵌套图

**scenario**（场景）:
整张基础图的变体，继承主板再叠加增量；不属于任何节点，彼此互斥，一次只能看一个。
_Avoid_: 变体, 视图, 分支

**board path**（board 路径）:
用 `.` 连接的 board 定位串，如 `scenarios.缓存命中.layers.存储细节`；空串表示 root board。
_Avoid_: target, 路由, 地址

**appendix icon**（角标）:
d2 为带 `.link` 的节点在右上角画的小图标，是预览内跳转 layer 的入口。
_Avoid_: 徽标, badge, 链接图标

**breadcrumb**（面包屑）:
预览工具栏里表达当前 board 路径的一行：`缓存命中 › 存储细节`。第一段是**当前场景名**（在 root board 时显示「基础」），后面是图层链。只有第一段有下拉（列出「基础 + 所有顶层场景」，悬停即开），图层段点击可回退到该层。宽度不够时中间图层折叠为「…」。
_Avoid_: 场景栏, 场景切换器, 导航条

**preview popout**（预览浮窗）:
扩展自有的单一预览窗口：一个独立的 webview 面板（可再经 VS Code「移到新窗口」分离），内部用页签承载多个 d2 文档的预览。与主窗口编辑区的预览面板互不相干。
_Avoid_: 共享窗口, 弹出窗口, 第二窗口, shared window

**preview tab**（预览页签）:
预览浮窗内的一个入口，对应一个 d2 文档；浮窗同一时刻只渲染激活页签的图，切换页签即切换文档。
_Avoid_: 标签, tab 页, 文件页

**scenario bar**（场景栏）:
2026-10-18 之前的旧称，已被 breadcrumb 取代。
_Avoid_: 场景栏（改称面包屑）
