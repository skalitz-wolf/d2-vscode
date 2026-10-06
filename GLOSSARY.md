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

**scenario bar**（场景栏）:
预览工具栏里切换 scenario 的一排 chips，固定以「基础」（root board）打头。
_Avoid_: 场景切换器, board 栏

**board history**（历史栈）:
预览内 board 跳转的后退栈：角标与场景栏跳转压栈，返回按钮弹栈。
_Avoid_: 导航记录, 面包屑
