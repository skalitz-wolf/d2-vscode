# 打包与安装

> 本文记录本机打包/安装的具体做法与踩过的坑。`AGENTS.md` 只留一行指针，
> 细节都在这里——改完扩展不知道"怎么才能生效"时先看这里。

## 一条命令

```bash
yarn install --frozen-lockfile   # node_modules/ 存在则跳过
yarn run dev                     # webpack 构建 + vsce 打包 + 装进 VS Code
```

`yarn run dev` 会先卸掉旧 ID 的残留（`terrastruct.d2`、`d2.1`），再打包安装。

分步执行：

```bash
yarn run package                 # webpack production -> dist/extension.js
yarn run pkg                     # vsce -> d2-YYYYMMDD.vsix
```

## 产物命名

`d2-` + 打包当天本地日期（2026-10-17 -> `d2-20261017.vsix`）。旧日期的产物不会被
覆盖。`dev` 里日期只算一次并复用于安装，不存在跨零点错配。

## 装到哪个编辑器

PATH 上的 `code` 可能是别的编辑器（本机指向 Cursor），**不要直接用它**。
`yarn run dev` 会自动挑 PATH 里路径含 `Microsoft VS Code` 的 `code.cmd`；也可用
`CODE_CLI=<路径>` 显式指定。

手动安装要写全路径：

```bash
"D:/Programs/Microsoft VS Code/bin/code.cmd" --install-extension d2-<YYYYMMDD>.vsix --force
```

换过插件 ID 之后新旧扩展会并存，装前先卸掉旧 ID 的残留：

```bash
"D:/Programs/Microsoft VS Code/bin/code.cmd" --uninstall-extension d2.1
"D:/Programs/Microsoft VS Code/bin/code.cmd" --uninstall-extension terrastruct.d2
```

## 插件 ID 为什么必须改

官方插件 ID 是 `terrastruct.d2`。本 fork 若沿用同一 ID，VS Code 会把它当成官方插件
的本地副本：检查更新/修复时被市场版本覆盖。2026-09-18 实际发生过——当时 ID 是
`Terrastruct.d2`、版本 `0.8.81` 高于官方 `0.8.8`，仍被覆盖回 `0.8.8`。

现用 `mine.d2`（publisher=mine、name=d2）。命令名（`D2.*`）与设置项来自
`contributes` 声明，与 ID 无关，换 ID 后使用无差异。

## niu 与日期

`pkg`/`dev` 用 **niu**（Niubash，bash 兼容 shell，需在 PATH 上）算日期：`cmd` 没有
`$(...)`，其 `%DATE%` 又受系统语言影响不可解析。

只在 `pkg`/`dev` 内显式调用 niu。**不要**配 yarn 的 `script-shell` 全局设置——那会
连带让 `yarn package`（webpack 编译）也走 niu，而 CI 跑在 Linux 没有 niu，编译步骤
会直接失败。

## 改完什么需要重新打包

| 改动 | 是否要重新打包安装 |
|---|---|
| `src/**`（扩展端逻辑） | 要（webpack 产物 `dist/extension.js`） |
| `pages/previewPage.html` | **要**（见下） |
| `package.json` 的 `contributes` / `activationEvents` | 要 |
| `docs/**`、`AGENTS.md`、`GLOSSARY.md` | 不要（且不进 vsix） |

### `pages/previewPage.html` 也必须重新打包

这个文件不经过 webpack，很容易误以为"改完重开预览就行"。实际上
`src/browserWindow.ts` 是这样读它的：

```ts
const onDiskPath = path.join(extContext.extensionPath, "pages/previewPage.html");
const data = readFileSync(onDiskPath, "utf-8");
```

`extContext.extensionPath` 指向**安装目录**（本机是
`C:\Users\Administrator\.vscode\extensions\mine.d2-0.8.8\`），不是工作区。所以改仓库里
的这份文件后，必须重新打包安装，改动才会被复制进安装目录；重开预览面板读到的仍是
旧文件。

2026-10-17 实际踩过：改完 `previewPage.html` 只重开预览，界面毫无变化；比对发现安装
目录里的文件还是前一天的大小（39536 字节 vs 仓库 44174 字节）。

验证安装目录里是不是新版：

```powershell
$e = "C:\Users\Administrator\.vscode\extensions\mine.d2-0.8.8"
Get-Item "$e\pages\previewPage.html" | Select-Object Length,LastWriteTime
```

## 生效

装完在 VS Code 里执行 **`Developer: Reload Window`**（`Ctrl+Shift+P`）。仅关闭预览
面板不够——扩展主进程和 webview 都还跑着旧代码。
