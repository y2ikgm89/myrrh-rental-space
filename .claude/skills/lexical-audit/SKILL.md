---
name: lexical-audit
description: Use when auditing or modernizing existing Lexical implementations. Checks deprecated/private APIs, listener waterfall, NodeState violations, HTML import, table API. Do NOT use for adding new nodes/plugins/toolbar.
paths:
  - src/**/lexical/**
---

# lexical-audit（スタブ）

**手順の正本**: `.agents/skills/lexical-audit/SKILL.md`

Claude Code は本スタブからスキルを発見する。実行時は **正本** を開く（`docs/architecture/agent-instructions.md`）。

**関連ルール**: `.claude/rules/frontend/lexical-patterns.md`（`paths:` 条件付き）
