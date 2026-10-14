# Triage 标签

各 skill 以五个标准 triage 角色来表达语义。本文件把这些角色映射到本仓库 issue 追踪器实际使用的取值。

本仓库用本地 markdown 追踪器，所以「标签」不是真正的 tracker 标签，而是 issue 文件顶部 `Status:` 行的取值。

| mattpocock/skills 中的角色 | 本仓库的取值 | 含义 |
| -------------------------- | ------------ | ---- |
| `needs-triage`             | `needs-triage`   | 维护者需要评估这个 issue |
| `needs-info`               | `needs-info`     | 等待报告人补充信息 |
| `ready-for-agent`          | `ready-for-agent` | 描述完整，可以交给 AFK agent |
| `ready-for-human`          | `ready-for-human` | 需要人工实现 |
| `wontfix`                  | `wontfix`        | 不会处理 |

当 skill 提到某个角色（例如「打上 AFK-ready 标签」）时，使用表中对应的取值。

如果实际用词与上表不同，编辑中间列即可。
