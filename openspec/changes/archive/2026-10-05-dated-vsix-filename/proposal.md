# Proposal

## Why

打包产物固定叫 `d2.vsix`，每次覆盖同一个文件，无法从文件名分辨是哪天打的包；而且这个名字硬编码在 `package.json`、`AGENTS.md`、`README.md` 共 4 处，改一处容易漏掉其余，导致安装时找不到文件。

## What Changes

- `pkg` 脚本改为借助 niu（Niubash，本机 PATH 上的 bash 兼容 shell）计算**打包当天的本地日期**，产物命名为 `d2.1-YYMMDD.vsix`（例：2026-10-05 → `d2.1-261005.vsix`）。
- `dev` 脚本同步改为计算同一文件名并安装，否则它仍引用已不再生成的 `d2.vsix` 而失效。
- 更新 `AGENTS.md`、`README.md` 中的命令示例，使其与实际产物名一致。
- **不新增 `.yarnrc`**：只在 `pkg`/`dev` 内显式调用 niu。若用 `script-shell` 全局指定 niu，会连带影响 `yarn package`（webpack 编译），而 CI 跑在 Linux、没有 niu，会让编译步骤直接失败。
- 旧产物保留、不自动清理（由用户自行管理）。

## Capabilities

### New Capabilities

- `release-packaging`: 打包产物的命名契约——文件名格式、日期取值口径（本地日期而非 UTC）、以及打包与安装两步之间的名称一致性。

### Modified Capabilities

无。现有 `preview-interaction` 描述的是预览面板运行时交互，本次改动不触及该行为。

## Impact

- `package.json`：`scripts.pkg`、`scripts.dev`
- `AGENTS.md`、`README.md`：命令示例
- 新增运行时依赖：本机 PATH 上的 `niu`（仅 `pkg`/`dev` 使用）
- 不受影响：`yarn package`（webpack 编译）、`yarn watch`、CI（`make.sh` 只执行 `yarn package`，从不执行 `pkg`）、`.gitignore`、`dist/`、预览功能
