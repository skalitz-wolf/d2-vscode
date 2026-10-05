# sketch 模式与中文字体研究笔记

> 实测环境：d2 CLI v0.9.0（Windows），2026-10-02。所有结论均经 CLI 实测验证，
> 非文档转述。升级 d2 后需重新验证。
> 本文供 agent 快速了解已研究过的问题与结论，避免重复排查。

## 1. 问题现象

`D2.previewSketch` 打开时（sketch 手绘风），英文标签是手写体，**中文标签是普通黑体**——
看起来像"中文没有手写模式"。

## 2. 根因：sketch 会整体换掉正文字体，且该字体没有 CJK 字形

`--sketch` 不只是把图形画成手绘线条，它**把正文字体换成了内置的 Fuzzy Bubbles**。
实测把 sketch 渲染出的 SVG 里内嵌的字体解码出来看 name 表：

| 渲染模式 | `.text-bold` 实际字体 | 字形总数 | CJK 字形数 |
|---|---|---|---|
| `--sketch=false` | Source Sans Pro Bold | — | 0 |
| `--sketch=true` | **Fuzzy Bubbles Bold** | 577 | **0** |

Fuzzy Bubbles 是纯拉丁手写体（OFL 授权，google/fonts 的 `ofl/fuzzybubbles`），
**一个汉字都没有**。所以中文必然落到系统字体回退，与用户是否配置字体无关。

这不是插件的问题，也不是能靠改参数绕过的——**d2 没有"只给 CJK 指定回退字体"的参数**。

## 3. 关键陷阱：传任意一个 `--font-*` 会重置其余所有槽位

d2 只要收到**任意一个** `--font-*` 参数，就会把**没被显式指定的槽位全部重置**回
Source Sans Pro（非 sketch 默认字体），d2 自带的 sketch 字体被整体丢弃。

实测（同一文件、`--sketch=true`，只传 `--font-bold=simhei.ttf`）：

| 槽位 | 不传任何字体 | 只传 `--font-bold=simhei` |
|---|---|---|
| `.text-regular` | Fuzzy Bubbles Regular | **Source Sans Pro**（sketch 字体丢了） |
| `.text-bold` | Fuzzy Bubbles Bold | simhei |
| `.text-italic` | Fuzzy Bubbles Regular | **Source Sans Pro Italic** |
| `.text-semibold` | Fuzzy Bubbles Bold | **Source Sans Pro Semibold** |
| `.text-mono` | Source Code Pro | Source Code Pro |

**推论（重要）**：任何"塞一个中文字体进去"的方案，都必须**同时覆盖全部槽位**，
否则没覆盖的槽位会从手写体掉回 Source Sans Pro，比不传还糟。

各槽位对应的文本类型（实测）：

| class | 用于 |
|---|---|
| `.text-bold` | 普通节点标签、**连线标签**、markdown 里的粗体 |
| `.text-regular` | markdown 正文 |
| `.text-semibold` | markdown 标题 |
| `.text-italic` | 斜体、**连线标签**（`fill-N2`） |
| `.text-mono` | markdown 行内代码 |

注意：**普通节点标签和连线标签走的是 `.text-bold`**，所以只覆盖 bold 能解决大多数场景，
但 markdown 富文本会用到其余四个。

## 4. 已修复：sketch 下不再注入隐式 `simhei.ttf`

**这是本仓库实际修掉的 bug**（`src/tasks.ts` 的 `resolveExportFont()`）。

原逻辑：`D2.exportFontPath` 为空时，Windows 上自动传 `simhei.ttf`
（为绕过非 sketch 位图导出的 CJK 回退 bug，见 §5）。

但在 sketch 下，这个"贴心默认值"**反而破坏了原本正常的部分**——按 §3 的规则，
simhei 会把 Fuzzy Bubbles 全部顶掉，英文手写体变成黑体，而中文并没有因此变成手写体
（simhei 本身就不是手写体）。实测同一份文件的 sketch PNG 导出：

| 导出参数 | 英文 | 中文 |
|---|---|---|
| 不传字体（修复后） | ✅ 手写体 | ❌ 黑体回退 |
| 传 simhei（修复前） | ❌ **黑体**（手写体被破坏） | ❌ 黑体 |

修复：`resolveExportFont(configured, sketch)` 增加 sketch 判断，
**sketch 且用户未显式配置时返回 `undefined`**（不传任何字体参数），
把 d2 原生的 sketch 字体留给英文。用户显式配置了 `exportFontPath` 时仍然尊重（他知道自己在换字体）。

回归确认：非 sketch 路径的参数向量与输出字节**完全不变**（实测输出 PNG 字节级相同）。

## 5. 非 sketch 的 CJK 回退 bug（原 workaround 的由来）

非 sketch 模式下 d2 内置渲染器默认字体不含 CJK，会触发系统字体回退；
Windows 上该回退解析有 bug（历史记录称"回退字体总量超 128MB 限制，落到 malgun.ttf 报错"）。

**2026-10-02 复测：本机无法复现该崩溃。** 试过以下内容，`png`/`pdf`/`pptx` 全部成功，
无一例报 malgun 错误：

- 中英混排、长文本、稀有字（龘靐齉爩）、中文标点、日文假名、韩文、emoji、全角字符
- 60 节点 × 中文标签（`many_nodes`）
- 最多 200 个不同汉字（301 KB 输出）

复现失败的可能原因：d2 版本已修、或依赖当时特定字体环境。
**结论：保留 simhei 默认值仍然合理**（它至少保证了中文可读、字形确定），
但"不传就崩"这一说法在本机已不成立，不要再把它当作硬约束。

复现过程中撞到的**两个真实但无关**的报错，避免误判成字体问题：

| 报错 | 真实原因 |
|---|---|
| `GIF board 0: GIF frame pixels exceed the 2097152-pixel limit` | GIF 单帧 2M 像素上限，与字体无关；simhei 也救不了。约 40 个节点就触发 |
| `d2raster: frame width ... exceeds limit 32768` | 图太宽（上千个汉字堆在一行），栅格化宽度上限 |

## 6. 未采纳的方案：合并字体（已研究透，随时可做）

要让**中文也变手写体**，唯一可行的路子是把 Fuzzy Bubbles 与一个中文手写体
**合并成一个 TTF**，再用它覆盖全部槽位。已完整验证：

- **拉丁部分像素级零差异**：合并时**拉丁字体必须放在前面**（`Merger().merge([fuzzy, cjk])`），
  这样 d2 原版拉丁字形胜出。实测 regular/bold/italic/mono 全槽位 `differing=0.0000%`。
  反过来（中文在前）会让中文字体自带的拉丁字形抢走，版面变化（实测 15.29%）。
- **需要按字重分别合并**：markdown 正文走 regular 槽、节点标签走 bold 槽，
  用同一个 bold 合并字体填 regular 槽会导致 markdown 正文变化（实测 15.29%）。
  即至少需要 `regular` + `bold` 两个文件。
- **候选字体**（均 OFL、upem=1000 与 Fuzzy Bubbles 一致、自带拉丁但会被覆盖）：
  - ZCOOL KuaiLe（`ofl/zcoolkuaile`）：圆润可爱，6766 汉字，气质最接近 Fuzzy Bubbles
  - Ma Shan Zheng（`ofl/mashanzheng`）：毛笔书法感，6763 汉字
- **体积**：合并后单个约 1.6 MB（ZCOOL）/ 6 MB（Ma Shan Zheng）。全部槽位都覆盖的话
  vsix 会从 ~107 KB 涨到约 3.5 MB（仅 ZCOOL）/ 15 MB（两个都要）。
- **合并输出不是字节可复现的**（内嵌时间戳），所以产物必须**构建一次后提交进仓库**，
  不能指望每次构建得到相同字节。

**未采纳原因**：用户权衡后认为体积代价不值得，选择维持现状（2026-10-02）。
如果将来要做，按上面结论直接实施即可，不需要重做实验。

### 构建合并字体的脚本要点

```python
from fontTools.merge import Merger
Merger().merge([fuzzy_bubbles_ttf, cjk_handwriting_ttf]).save(out)  # 拉丁在前！
```

- 需要 `fontTools`（`pip install fonttools brotli`）
- 可变字体（如 `SourceCodePro[wght].ttf`）**不能直接 merge**，会报
  `AttributeError: type object 'VarStore' has no attribute 'mergeMap'`，
  要先用 `fontTools.varLib.instancer.instantiateVariableFont()` 实例化成静态字体
- 子集化（裁到 GB2312 常用字）**几乎没有收益**（ZCOOL 本身就只有 6763 个常用汉字，
  裁完仍占原 gzip 的 96%），不要在这上面浪费时间

## 7. 复测方法

```bash
# 1. 看 sketch 到底用了什么字体（解码 SVG 里内嵌的 base64 字体，读 name 表）
d2 --sketch=true --target= --theme=0 x.d2 out.svg
# 从 out.svg 里提取 @font-face 的 base64，base64 -d 后是 WOFF，读 name 表 ID 1/2

# 2. 验证"传字体是否重置其余槽位"（只看 SVG 里 .text-* 的 font-family 指向哪个 @font-face）
d2 --sketch=true --target= --theme=0 --font-bold=C:/Windows/Fonts/simhei.ttf x.d2 out.svg

# 3. 验证拉丁字形是否零差异（像素比对）
#    渲染同一份纯拉丁文件两次（不传字体 / 传合并字体），裁到内容包围盒后比像素

# 4. 精确复刻插件的导出路径（stdin + --stdout-format，与写文件行为不同）
d2 --target= --theme=0 --sketch=true --stdout-format=png - < x.d2 > out.png
```

**坑**：`d2 file.d2 --stdout-format=png`（不写 `-`）会忽略 stdout 格式、按输出文件名渲染，
必须写 `-` 才是真正的 stdout 模式。测试时务必带 `-`。
