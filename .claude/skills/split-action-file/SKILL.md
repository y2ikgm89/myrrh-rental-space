---
name: split-action-file
description: >
  大きな Server Action ファイル（500行超）を queries.ts + mutations.ts + index.ts（barrel）に分割する。
  get* 系は queries.ts、create*/update*/delete*/publish*/toggle*/restore*/archive* 系は mutations.ts に振り分ける。
  barrel の index.ts で既存 import パスを変えずに透過する。
  引数: 対象ファイルパス（例: src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts）
---

# split-action-file（スタブ）

**手順の正本**: `.agents/skills/split-action-file/SKILL.md`

Claude Code は本スタブからスキルを発見する。実行時は **正本** を開く（`docs/architecture/agent-instructions.md`）。
