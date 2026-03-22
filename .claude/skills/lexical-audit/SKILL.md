---
name: lexical-audit
description: >
  管理画面の Lexical 実装を監査またはモダナイズするときに使う。
  deprecated API、private API、listener waterfall、NodeState 逸脱、HTML import、table API を点検し、現行の公式推奨へ寄せる。
  新しい node/plugin/toolbar を追加する作業には使わない。
---

# lexical-audit（スタブ）

**手順の正本**: `.agents/skills/lexical-audit/SKILL.md`

Claude Code は本スタブからスキルを発見する。実行時は **正本** を開く（`docs/architecture/agent-instructions.md`）。

**関連ルール**: `.claude/rules/frontend/lexical-patterns.md`（`paths:` 条件付き）
