# Design

## Context

动机见 `proposal.md`。这里只记录决定实现方式的现状与约束。

本机（Windows）实测环境：

| 项 | 值 |
|---|---|
| yarn | 1.22.22 |
| yarn 执行脚本用的 shell | `cmd.exe`（`ComSpec=C:\WINDOWS\system32\cmd.exe`） |
| `sh` / `dash` | 未安装 |
| `bash` | 仅 WindowsApps 占位符，WSL 未安装 |
| niu（Niubash 1.1.1） | `C:\Users\Administrator\AppData\Local\Programs\Niubash\niu.exe`，已在 PATH |

关键实测结论：

- `cmd.exe` 不支持 `$(...)` 命令替换。默认配置下 `echo "d2.1-$(date +%y%m%d).vsix"` 输出**字面量**，不展开。
- `cmd` 的 `%DATE%` 受系统语言影响（本机为 `周一 2026/10/05`），不可解析。
- niu 是 bash 兼容 shell（rubash + WinuxCmd 1.0.6），`$(date +%y%m%d)` 正确得到 `261005`，且其 `date` 与 Node 本地日期一致。
- 引用 niu 时**裸名即可**（`niu` 在 PATH 上），无需绝对路径。
- yarn 1 没有 `--script-shell` 命令行参数；`script-shell` 只能经 `.yarnrc` 或环境变量（`YARN_SCRIPT_SHELL` / `npm_config_script_shell`）设置。

现有相关脚本（`package.json`）：

```json
"package": "webpack --mode production --devtool hidden-source-map",
"pkg": "vsce package --out d2.vsix",
"dev": "code --uninstall-extension terrastruct.d2; yarn gen && yarn pkg && code --install-extension d2.vsix"
```

CI 实际执行 `make.sh`，其构建步骤为 `runjob build 'yarn package'`——**从不执行 `pkg`**。

## Goals / Non-Goals

**Goals:**

- 产物名携带打包当天本地日期，多天产物可共存。
- 打包与安装对文件名的理解一致，不因跨零点而错配。
- 改动范围收敛在打包链路，不影响编译、预览与 CI。

**Non-Goals:**

- 不自动清理历史产物（用户明确自行管理）。
- 不改动 `package.json` 的 `version` 字段（仓库规则：仅用户明确要求才改）。
- 不改动 vsix 内容、`.vscodeignore` 或 `.gitignore`。
- 不追求在未安装 niu 的机器上也能打包。

## Decisions

### 1. 用 niu 做日期计算，而不是 Node 内联

`$(date +%y%m%d)` 经 niu 展开，语义直白、可读性好。

备选：`node -e "const d=new Date(),p=n=>String(n).padStart(2,'0');..."`。可行且不依赖 niu，但一行内引号多层嵌套，在 `package.json` 的 JSON 字符串里既难读也难改。用户已装 niu 并明确选择用它，故采用 niu。

### 2. 日期取本地时间，不用 UTC

必须使用本地日期。若用 `toISOString().slice(2,10)` 之类取 UTC，在东八区本地 00:00–08:00 之间会得到**前一天**的日期。`date +%y%m%d` 默认即本地时间，符合要求；实现时不得改用 UTC 取法。

### 3. 在 `pkg`/`dev` 内显式调用 niu，不设全局 `script-shell`

**这是本设计最关键的决定。**

`script-shell` 是**全局生效**的：它不只影响 `pkg`，也会让 `yarn package`（webpack 编译）走 niu。而 CI 跑在 Linux、没有 niu，实测结果是编译步骤直接失败：

```
error Couldn't find the binary node -e "..."
exit=1
```

即：`.yarnrc` 里写 `script-shell "niu"` 并提交，会**连编译一起弄挂**。实测 `.yarnrc` 中写裸名 `niu` 在本机确实生效，但该文件会随仓库分发，属于把本机环境假设强加给所有环境。

因此改为在 `pkg`/`dev` 里显式写 `niu -c "..."`：

- `yarn package` 仍走默认 shell（cmd），CI 与任何无 niu 的环境均不受影响。
- 不需要新建 `.yarnrc`，不需要改 `.gitignore`。
- 只影响这两条命令。

备选：项目级 `.yarnrc` + 加进 `.gitignore`。用户明确否决（不写 gitignore），且该方案仍需每个使用者自建配置，采用显式调用更简单。

### 4. 打包与安装在同一条 niu 调用链内共享同一次日期计算

`dev` 串联了打包与安装。若两步各自取一次当前日期，跨零点时会出现"23:59 打包出 `261005`、00:01 安装去找 `261006`"的错配（`code --install-extension` 不展开通配符，实测报 `ENOENT`）。

做法：让 `dev` 中这两步位于**同一次** niu 执行内（一次 `date` 取值、存入变量后复用），避免两次独立取值。

### 5. 文件名前缀固定为 `d2.1`

`package.json` 的 `name` 是 `1`、`publisher` 是 `d2`，`vsce` 默认产物名会是 `1-0.8.8.vsix`（不可用）。前缀取插件对外标识 `d2.1`，与 `displayName` 一致，便于识别。`--out` 显式指定，不依赖 vsce 默认命名。

## Risks / Trade-offs

- [未安装 niu 的机器无法打包] → 属预期：打包是本机开发动作，CI 不打包。失败为硬报错（实测 `Couldn't find the binary ...`，非零退出），不会静默产出错误名字的产物。
- [`dev` 脚本依赖 niu 执行整条链，若链中其它命令在 niu 下行为不同] → 实测 niu 对 `&&`、`;`、`pwd`、`$(...)` 均正常；`dev` 链中其余为 `yarn gen`、`vsce`、`code` 等外部可执行文件，不依赖 shell 特性。
- [niu 版本升级可能改变 `date` 行为] → `date +%y%m%d` 是 POSIX 标准用法；`docs/sketch-cjk-fonts.md` 式的实测复测方法已记录在本文 Context，升级后可复跑。
- [历史产物堆积占用磁盘] → 已与用户确认：自行管理，不自动清理。
- [文档与实际命令再次漂移] → `AGENTS.md`、`README.md` 中的示例同步更新，且这些示例是本次改动的一部分。

## Migration Plan

1. 修改 `package.json` 的 `scripts.pkg`、`scripts.dev`。
2. 同步更新 `AGENTS.md`、`README.md` 中的命令示例。
3. 验证：在仓库根执行打包命令，确认产物名为 `d2.1-<当天YYMMDD>.vsix`；执行编译脚本 `yarn package` 确认仍正常产出 `dist/extension.js`。
4. 回滚：还原上述文件即可；产物为 gitignore 的构建输出，无需数据迁移。

## Open Questions

无。
