# Issue 追踪：本地 markdown

本仓库的 issue 与 spec 以 markdown 文件形式存放在 `.scratch/` 下。

个人 fork 的上游 GitHub Issues 已关闭（`gh issue list` 报 `repository has disabled issues`），因此不走 `gh issue create`，一律写本地文件。

## 约定

- 一个功能一个目录：`.scratch/<feature-slug>/`
- spec 是 `.scratch/<feature-slug>/spec.md`
- 实现 issue 一个 ticket 一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号，不合并成单个文件
- triage 状态记为每个 issue 文件顶部的 `Status:` 行（取值见 `triage-labels.md`）
- 评论与会话历史追加到文件末尾的 `## Comments` 标题下

## 当 skill 说「发布到 issue 追踪器」

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当 skill 说「获取相关 ticket」

读取被引用的路径对应的文件。用户通常会直接给出路径或编号。

## Wayfinder 操作

供 `/wayfinder` 使用。**map** 是一个文件，每个 ticket 对应一个子文件。

- **Map**：`.scratch/<effort>/map.md`（承载 Notes / Decisions-so-far / Fog）。
- **子 ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 编号，问题写在正文。`Type:` 行记录 ticket 类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：文件顶部附近的 `Blocked by: NN, NN` 行。它列出的每个文件都为 `resolved` 时，该 ticket 解除阻塞。
- **Frontier**：扫描 `.scratch/<effort>/issues/` 中处于 open、未阻塞、未认领状态的文件；编号最小者优先。
- **认领**：在任何工作之前设置 `Status: claimed` 并保存。
- **完成**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后把上下文指针（gist + 链接）追加到 `map.md` 的 Decisions-so-far。
