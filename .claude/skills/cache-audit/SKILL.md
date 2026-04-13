---
name: cache-audit
description: Use when reviewing cache invalidation in Server Actions. Detects missing updateTag/revalidateTag, inconsistencies, and 3-point-set gaps after editing Server Action files.
paths:
  - src/**/actions/**
  - src/**/actions.ts
  - src/**/mutations.ts
---

# cache-audit（スタブ）

**手順の正本**: `.agents/skills/cache-audit/SKILL.md`

Claude Code は本スタブからスキルを発見する。実行時は **正本** を開く（`docs/architecture/agent-instructions.md`）。
