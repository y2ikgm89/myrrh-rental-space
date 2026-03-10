# .claude/ 公式ベストプラクティス準拠 設計書

**日付**: 2026-02-19
**種別**: リファクタリング
**ステータス**: 設計承認済み

---

## 概要

Claude Code の公式ドキュメント（hooks / sub-agents / skills）を参照し、`.claude/` ディレクトリを公式推奨パターンに完全準拠させる。後方互換性なし（breaking changes OK）。

## 変更一覧

### 1. フック設定の project/local 分割

**現状**: Prettier フックが `settings.local.json`（個人用・非共有）に定義されている。

**公式推奨**: プロジェクト共有フックは `.claude/settings.json` へ。`settings.local.json` は個人用のみ。

**変更**:

- `.claude/settings.json`（新規作成・git管理）に Prettier の `PostToolUse` フックを移動
- `.claude/settings.local.json` は `.env` 系の `deny` 権限のみに縮小

### 2. prettier-format.sh のパス修正

**現状**: `PROJECT_ROOT="G:/workspace/work/website/customer/myrrh-rental-space"` をハードコード。

**公式推奨**: `$CLAUDE_PROJECT_DIR` 環境変数を使用。フック実行時に Claude Code が自動設定する。

**変更**:

- スクリプト内の `PROJECT_ROOT` 変数を `$CLAUDE_PROJECT_DIR` に置換
- `settings.json` の command を `"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/prettier-format.sh"` に修正
- フック spinner に `statusMessage: "Formatting..."` を追加

### 3. commands/ 削除

**公式ドキュメント**: 「Custom slash commands have been merged into skills. Skills take precedence over commands.」

**変更**: `.claude/commands/` を完全削除（lexical-node/plugin/toolbar は全て `skills/` に上位版あり）

### 4. .claude/plans/ 削除

空ディレクトリ。公式 Claude Code の機能ではない。削除。

### 5. .gitignore 更新

**公式ドキュメント**: `memory: local` スコープのディレクトリ（`.claude/agent-memory-local/`）は非共有（should not be checked into version control）。

**変更**: `.gitignore` に `.claude/agent-memory-local/` を追加

### 6. skill フロントマター修正

| スキル             | 変更内容                              | 理由                               |
| ------------------ | ------------------------------------- | ---------------------------------- |
| `prisma-migration` | `disable-model-invocation: true` 追加 | ユーザー明示起動のみのワークフロー |
| `ui-ux-pro-max`    | `disable-model-invocation: true` 追加 | Python スクリプト実行を伴うため    |

### 7. security-reviewer agent 更新

**変更**: `memory: project` を追加。セキュリティパターンのプロジェクト固有知識を蓄積できる。

## ファイル変更サマリー

| ファイル                                   | 操作                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `.claude/settings.json`                    | 新規作成（Prettier hook + `enableAllProjectMcpServers`） |
| `.claude/settings.local.json`              | 縮小（deny rules のみ）                                  |
| `.claude/hooks/prettier-format.sh`         | 修正（`$CLAUDE_PROJECT_DIR` 使用）                       |
| `.claude/commands/`                        | **削除**（3ファイル）                                    |
| `.claude/plans/`                           | **削除**（空ディレクトリ）                               |
| `.gitignore`                               | 追加（`agent-memory-local/`）                            |
| `.claude/skills/prisma-migration/SKILL.md` | 修正（frontmatter 追加）                                 |
| `.claude/skills/ui-ux-pro-max/SKILL.md`    | 修正（frontmatter 追加）                                 |
| `.claude/agents/security-reviewer.md`      | 修正（`memory: project` 追加）                           |
