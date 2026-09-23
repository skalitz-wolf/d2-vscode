# Board 导航研究笔记（layers / scenarios / 跳转 / 场景栏）

> 实测环境：d2 CLI v0.9.0（Windows），2026-09-18。所有结论均经 CLI 实测验证，
> 非文档转述。升级 d2 后涉及链接格式的结论需要重新验证。
> 本文供 agent 快速了解已研究过的问题与结论，避免重复排查。

## 1. 语义模型：为什么图层和场景的交互设计不同

| | layers（图层） | scenarios（场景） |
|---|---|---|
| 本质 | 某个关注点的**下钻细节**，独立成图（**不**继承主板） | 整张基础图的**变体**（继承主板 + 增量） |
| 归属 | 属于某个节点（`节点.link: layers.X` 挂角标合理） | **不属于任何节点**（整图的属性） |
| 组合性 | 可逐级下钻（场景内还能嵌图层，`.link: layers.Y` 相对当前板） | 互斥，一次只能看一个 |
| 预览入口 | 节点右上角 d2 自带的 `.appendix-icon` 角标 | 预览左上角场景栏（已实现，见 §4） |

**场景不能多选**：d2 一次编译一个 board（`--target` 单值），"多选"意味着叠加多个场景增量，d2 没有合并模型。想要叠加效果只能在源文件里定义组合场景（可配合 `@` 导入复用），不是插件能绕过的。

board 可任意嵌套（场景里套图层、图层里套场景），`--target` 路径用 `.` 连，如 `scenarios.缓存命中.layers.存储细节`；目录渲染会生成嵌套子目录（`缓存命中/index.svg`）。

## 2. 三种渲染模式的链接格式（实测）

| 打开方式 | 链接格式 | 能否跳转 |
|---|---|---|
| 单板渲染（`--target=`，预览/CompileToSvg）root 板 | `href="root.layers.X"` / `root.scenarios.X`（路由路径，含中文与空格，不 URL 编码） | 预览 ✅（插件识别）；file:// 打开 ❌（被当相对文件路径，"未找到文件"） |
| 单板渲染非 root 板 | **格式不规则**，见 §3 | 预览部分可用 |
| 目录渲染（`CompileToSvgs` / 输出参数以 `.svg` 结尾） | `href="X.svg"`、`..\X.svg"`（相对文件路径，Windows 分隔符是 `\`） | 浏览器 ✅（URL 解析把 `\` 当 `/`，file:// 直接双击即可） |
| `d2 --watch` | 服务器路由解析 `root.*` | ✅（d2 官方交互模式，d2 不内嵌进本插件的原因见 git 历史） |

## 3. `.link` 语法规则（v0.9.0 实测，容易踩坑）

- **路径相对"定义处所在的板"解析**，解析不到就**静默丢弃**（不报错！）
- 从 root 板：`layers.X`、`scenarios.X` 都正常生成 `root.*` 链接
- 从场景内部：
  - 指向本场景嵌套图层：写相对形式 `layers.存储细节` → 生成完整 `root.scenarios.S1.layers.存储细节` ✅
  - 写绝对形式 `scenarios.S1.layers.存储细节` → **被静默丢弃**（最常踩的坑）
  - 指向兄弟场景（.link 定义在 root、继承进场景板）：生成**裸名** `缓存未命中`（无 `root.` 前缀）
  - 指回 root（`link: root`）：生成 `..\index`
- 预览已知限制：`browserWindow.ts` 只识别 `root` / `root.*`，上述裸名与 `..\index` 形式会被误当文件路径 → **预览内从场景板内部跳兄弟场景/回主板不可用**（浏览器打开目录渲染 SVG 不受影响）。修复需要启发式解析（裸名无法与真实文件链接区分，需先按兄弟板路径尝试编译、失败再回退打开文件），收益与风险见 git 历史讨论，暂未做。

## 4. 预览实现要点（已实现，细节见代码注释）

- **角标跳转（图层）**：d2 的角标 `.appendix-icon` 渲染在 `<a>` **外面**（无 DOM 嵌套），webview 按包围盒重叠面积几何关联；board 路径大小写敏感，不能 toLowerCase
- **场景栏（场景）**：`boardParser.ts` 解析源码顶层 `scenarios:` 一级键（d2 CLI 没有"列出 boards"的命令，只能自己解析）→ 随 `render` 消息发 `scenarios` 数组 → webview 渲染 chips（`基础` 固定第一项）→ 点击发 `selectBoard`（board 路径 `""`=主板 / `scenarios.名字`）→ 与角标同机制跳转（压历史栈）
- **历史栈**：`D2P.boardHistory`，显式跳转（角标/场景栏）压栈、返回按钮弹栈、后退本身不压栈，新开预览窗口清空
- **boardParser 容错设计**：括号深度扫描，处理带空格裸键、引号键、`|md` 文本块内的 `{}`/`:`/`#`、`@导入` 值（无花括号）、无冒号裸键（空 board，d2 允许）、单行块；任何异常只丢当前键，不影响其余解析。测试样例见本文 git 提交信息（9 项全过）
- **单击文字复制（2026-09-23 新增）**：预览里鼠标移到文字上是 I 型光标（提示可划选），**单击即复制该 `<text>` 的整行内容**，被复制文字短暂高亮（`.copy-flash`，600ms）。要点：
  - **d2 文字渲染结构（v0.9.0 实测）**：单行标签 → 一个 `<text>`；多行标签（`"a\nb\nc"`）→ 一个 `<text>` 下每行一个 `<tspan>`；markdown 富文本 → `<g class="md md-native">` 下**并列多个** `<text>`（粗体/斜体/普通各一片）；`--sketch` 下文字仍是 `<text>`
  - **核心陷阱**：多行标签的 `textContent` 会把各行**无分隔符**粘起来（`alpha`+`beta`+`gamma` → `"alphabetagamma"`）。必须先查 `querySelectorAll("tspan")`，有则逐行 `join("\n")`；没有（单行标签、富文本碎片）才直接取 `textContent`
  - **冲突消解**：用 `click` 而非自己配对 mousedown/mouseup——浏览器只在「同元素按下+松开」时派发 click，拖选与平移天然不触发；再用 `getSelection().isCollapsed === false` 判定「刚划选过」，此时不复制、不覆盖选区。双击会先触发一次 click（顺手复制整行）随后正常选词，属可接受副作用，未加延时
  - **分支优先级**：`.appendix-icon` 角标跳转 > 文字复制 > 平移。复制分支的选择器写成 `#previewWrapper text`（限定在预览容器内，避免工具栏里将来出现 `<text>` 时误触发）
  - **剪贴板**：主路径 `navigator.clipboard.writeText`（VS Code webview 宿主为内层 iframe 声明了 `clipboard-write`，无需扩展端参与），失败退化为离屏 textarea + `execCommand('copy')`；全程 `try/catch`，**绝不外抛**——预览页脚本一旦崩，缩放/平移/跳转一起失效。复制**不新增任何扩展端消息通道**
  - **高亮为何改 `fill` 而非背景色**：SVG `<text>` 没有可靠的背景绘制面；d2 把 `fill` 写在元素的**表现属性**上（优先级低于任何 CSS 规则），故 `.copy-flash { fill: var(--vscode-textLink-foreground) }` 能稳定覆盖。色值取 `textLink` 而非选区底色：后者当字形颜色用时在浅色主题白底上几乎看不见
  - **不改动扩展端**：只改 `pages/previewPage.html`，该文件**不走 webpack**，改完关闭重开预览面板即生效，**不需要** `yarn run package` 与重装 vsix

## 5. SVG 内做场景栏（未实现，已研究可行）

结论：**可行**，走导出后处理——`compileToSvgs` 完成后往每个 SVG 注入一排 SVG 原生按钮（`rect`+`text`，`onclick` 改 `location.href` 为相对文件名）。`CompileToSvgs` 已知 board 列表（boardParser），文件名即 board 名。难点按影响排序：

1. **脚本执行环境**：SVG 内脚本仅在"以文档方式打开"时运行（双击/浏览器标签页）；被 `<img>` 嵌入网页/Markdown 时浏览器禁用脚本，栏失效（d2 自带的 `.svg` 链接在 `<img>` 里同样不可点，行为一致）
2. 无 HTML 工具栏可用，需 SVG 元素画 UI（定位 viewBox 左上角）
3. 每个板 SVG 都要注入；嵌套目录相对路径要算对（`../index.svg`）
4. 后处理维护成本：d2 升级改输出结构需跟随调整（纯注入不动 d2 原有内容，比改写链接稳）

注意：撤掉场景节点 `.link` 后（语义原因，见 §1），**静态 SVG 里目前没有任何场景入口**——若浏览器侧需要场景跳转，这就是实现路径。

## 6. `@` 导入与 board 的交互（v0.9.0 实测）

- 语法：`服务: @组件/短链服务`（整文件）、`缓存: @组件/公共组件.Redis 短链缓存`（**`.` 连到目标节点**做选择性导入）；路径相对本文件、**不带 `.d2` 后缀**
- **v0.9.0 不支持**：`@文件|节点` 管道选择器、glob（`@parts/*.d2`）——这些是官方最新文档描述的语法，本地 CLI 实测报错，勿被文档误导
- layers / scenarios 都能导入（整文件或选择性），嵌套 board 亦可
- **stdin 模式**（插件预览的工作方式）导入路径按**进程 cwd** 解析；插件 `compile()` 的 cwd 传的是 d2 文件所在目录（`taskRunner.ts` 的 `fileDirectory`），语义正确，勿改动
- board 名与文件名：目录渲染时 board 名即文件名（含空格中文，如 `Sggate 内部.svg`）；跨目录跳转链接带 `\` 分隔符，浏览器可用

## 7. 测试方法（可复用）

- 链接格式排查：`d2 file.d2 --target= - | grep -o 'href="[^"]*"'`
- 预览行为模拟（stdin）：`cat file.d2 | d2 - --target=scenarios.X -`（工作目录必须是 d2 文件所在目录）
- boardParser 单测：`npx tsc src/boardParser.ts --outDir <tmp> --module commonjs --target es2020 --skipLibCheck` 后用 node 跑断言
- webview UI：`pages/previewPage.html` 可用本地 http 服务 + Browser pane 测（stub `acquireVsCodeApi`，`window.postMessage` 驱动 render 消息），历史上有过此法抓出工具栏溢出 bug
- **自动化回归 harness**：同法可用 jsdom 无头跑（无需真实浏览器）。要点：stub `acquireVsCodeApi`、补 `window.visualViewport`（jsdom 无布局，`zoomFit` 依赖它）、给 `navigator.clipboard` 装可控 mock（可切成功/失败）、并 shim `innerText`（jsdom 未实现，赋值是**静默 no-op**，会让场景栏/百分比断言假失败）。断言直接读 `wrapper.style.transform`、元素 class、`getSelection().isCollapsed`，用真实 d2 SVG 驱动 render 消息。2026-09-23 实测 49 项全过
- **jsdom harness 的三个坑**（都会造成假失败，不补就是白跑）：`innerText` 未实现（赋值是**静默 no-op**，场景栏/百分比断言永远读不到值）、`visualViewport` 缺失（`zoomFit` 依赖它）、`postMessage` 强制要 `targetOrigin`（而页面内用的是单参形式，真实 webview 允许）。另注意 `postMessage` 是**异步派发**，断言前必须等一拍
- **已修复：缩放百分比滞后 + 滑块拖动崩溃（2026-09-23）**。原 `setZoomLevel()` 顺序为「先 `setZoomText()`、后赋 `zoomLevel`」，而前者读的正是 `zoomLevel` → 百分比**滞后一步**（`setZoomLevel(250)` 后显示 100%）。同一行还有个更严重的：`zoomSlider.value` 与扩展端消息传的都是**字符串**，原样存进 `zoomLevel` 后，下一次 `setZoomText()` 因字符串无 `.toFixed` 抛 `TypeError`，而预览页是**单个 `<script>` 块**——一次未捕获异常就让缩放/平移/跳转/场景栏全失效。修法：顺序改为「先赋值后刷新」并与本来就正确的 `zoomTo`/`zoomFit` 对齐，同时 `zoomLevel = Number(zl)` 把「数值」确立为该变量的不变式。两处缺陷均可追溯到 `bc5f8cb`，属上游遗留。复现方法：拖滑块两次即崩；或调 `setZoomLevel(250)` 看百分比停在 100%

## 8. 相关文件

| 文件 | 职责 |
|---|---|
| `src/boardParser.ts` | 顶层 layers/scenarios 一级键解析（场景栏数据源） |
| `src/browserWindow.ts` | `clickOnTag_A`（角标跳转）/ `selectBoard`（场景栏）/ `navigateBack`（历史栈） |
| `src/docToPreviewGenerator.ts` | `D2P.scenarioList`、`currentTarget`、`boardHistory` |
| `pages/previewPage.html` | 场景栏 UI（`renderBoardBar`）、角标几何关联、返回按钮 |
| `src/tasks.ts` | `compile()`（单板）/ `compileToSvgs()`（目录渲染，§5 注入点） |

示例文件（tech-doc 仓库 `短链/示例/`）：`场景示例.d2`、`图层示例.d2`、`导入图层示例.d2`、`导入场景示例.d2`、`导入场景图层示例.d2`（含嵌套 board 与各种导入写法，可当回归测试集）。
