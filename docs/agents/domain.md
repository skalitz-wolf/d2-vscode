# 领域文档

工程类 skill 在探索代码库时应当如何消费本仓库的领域文档。

## 探索之前先读这些

- 仓库根目录的 **`GLOSSARY.md`**，或
- 根目录的 **`GLOSSARY-MAP.md`**（若存在）：它指向每个 context 一份 `GLOSSARY.md`，只读与主题相关的那些。
- **`docs/adr/`**：读与你即将改动区域相关的 ADR。多 context 仓库还要看 `src/<context>/docs/adr/` 下 context 级别的决策。

这些文件如果不存在，**静默继续**。不要提示它们缺失，也不要建议提前创建。`/domain-modeling` skill（经 `/grill-with-docs` 和 `/improve-codebase-architecture` 到达）会在术语或决策真正落定时懒创建它们。

## 文件结构

单 context 仓库（大多数仓库）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多 context 仓库（根目录存在 `GLOSSARY-MAP.md`）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context 级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## 使用词汇表的术语

当产出提到某个领域概念时（issue 标题、重构方案、假设、测试名），使用 `GLOSSARY.md` 中定义的词形，不要漂移到词汇表明确回避的同义词。

如果需要的概念还没进词汇表，那是个信号：要么你在发明项目不使用的语言（重新考虑），要么确实有缺口（记下来交给 `/domain-modeling`）。

## 标记 ADR 冲突

如果产出与既有 ADR 矛盾，明确指出来，不要静默覆盖：

> _与 ADR-0007（event-sourced orders）矛盾，但值得重开，因为……_

## 本仓库

- **布局**：单 context。根目录 `GLOSSARY.md` 是唯一词汇表；ADR 放 `docs/adr/`（尚未创建——由 `/domain-modeling` 懒创建）。
- **词汇表之外**：`docs/board-navigation.md` 与 `docs/sketch-cjk-fonts.md` 是已定稿的研究笔记（已验证结论 + 复测方法），不是 ADR。改动 board 跳转 / 场景栏 / 导入，或导出字体 / sketch 之前先读它们；`AGENTS.md` 已指向这两份文档。
