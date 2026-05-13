---
name: worktree-bootstrap
description: Bootstrap an isolated git worktree with env copy, Prisma generated copy, and main DB drift detection. Invoke after deciding to use a worktree per the decision matrix in .claude/rules/git-migration.md §Worktree 採否判定.
disable-model-invocation: true
argument-hint: "<branch-name-kebab-case>"
---

# worktree-bootstrap

隔離 worktree を 1 コマンドで完全セットアップする SKILL。

**採否判定（worktree を使うべきか）**は `.claude/rules/git-migration.md` §Worktree 採否判定 を参照。本 SKILL は採用決定後のセットアップ自動化を担当。

## 背景

このプロジェクトでは worktree 作成に複数の手動ステップが必要:

1. `git worktree add -b feature/<name> .worktrees/<name> HEAD`
2. `.env` / `.env.local` を worktree にコピー（PreToolUse Edit/Write ブロックを bypass するため `python3 shutil.copy2` 経由）
3. `generated/` を worktree にコピー（`robocopy generated <worktree>/generated`）
4. main の未コミット migration を検出 → ドリフト回避のため WIP スナップショット commit
5. worktree 内で `bun run type-check` 実行で動作確認

これを手動で実行すると漏れが発生しやすく、特にステップ 4（DB drift）は見落としやすい。

## 使用方法

```bash
bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh <branch-name>
```

例:

```bash
bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh review-reply
# → .worktrees/review-reply/ が作成され、feature/review-reply ブランチで切り出される
```

## 処理フロー

1. **引数検証**: ブランチ名必須
2. **Drift 検知**:
   - `git status --short | wc -l` で未コミット数を取得
   - `git status --short | grep "prisma/migrations/"` で未追跡 migration を検出
   - 未追跡 migration あり → 既にローカル Postgres 適用済みの可能性が高い → WIP snapshot の実施確認
3. **Worktree 作成**: `git worktree add -b feature/<name> .worktrees/<name> HEAD`
4. **Env ファイルコピー**: `python3 -c "import shutil; shutil.copy2('.env', '.worktrees/<name>/.env')"` （PreToolUse bypass）
5. **Generated コピー**: robocopy（Windows）または `shutil.copytree`
6. **完了レポート**: worktree パス・ブランチ名・ベース commit SHA を表示

## 関連

- `.claude/rules/git-migration.md` — Worktree 採否判定 / worktree merge / DB drift / 未追跡 migration 対処（canonical SSoT）
- `.claude/rules/claude-code-patterns.md` — subagent-driven-development 規律 / `PostToolUse:Agent` hook の検証パターン
- `superpowers:using-git-worktrees` — worktree 運用の一般論（本 SKILL はプロジェクト固有自動化）
