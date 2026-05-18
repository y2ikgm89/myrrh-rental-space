---
name: worktree-bootstrap
description: 隔離 git worktree を手動 bootstrap する legacy fallback。公式 `claude --worktree <name>` が canonical (自動 cleanup)、本 skill は dev server を main 常駐 / IDE 直接 open 等の例外用途のみ。
when_to_use: 公式 `claude --worktree` が使えない場面で worktree を手動 bootstrap するとき。subagent 隔離なら frontmatter `isolation: worktree` を優先。
disable-model-invocation: true
user-invocable: true
argument-hint: "<branch-name-kebab-case>"
---

# worktree-bootstrap

隔離 worktree を 1 コマンドで完全セットアップする SKILL（**legacy manual fallback**）。

## 公式 canonical 経路（推奨）

**まず公式 `claude --worktree` を検討すること**。本 SKILL は fallback 用途。

```bash
# 新規 worktree + Claude セッション同時起動
claude --worktree feature-name
# → .claude/worktrees/feature-name/ に作成
# → .worktreeinclude にマッチする gitignored を auto copy
# → 終了時に changes なしなら worktree + branch 自動削除（公式 cleanup）

# PR レビュー専用 worktree
claude --worktree "#1234"
# → pull/1234/head fetch + .claude/worktrees/pr-1234/

# Subagent 隔離（agent frontmatter or Agent tool）
# isolation: worktree → temporary worktree、変更なしで自動 cleanup
```

公式機能は `.worktreeinclude` / `worktree.baseRef: "head"` / `cleanupPeriodDays: 14` 設定済み（`.claude/settings.json`）で動く。**手動 bootstrap は以下のケースのみ**:

- dev server を main で常駐させたまま手動で別 worktree を切りたい
- subagent dispatch 以外で外部ツール（VS Code 等）から直接開きたい
- `--worktree` で trust dialog がまだ accept されていない初回セットアップ
- legacy `.worktrees/` location（公式 `.claude/worktrees/` ではない）を維持したい

採否判定の SSoT は `.claude/rules/git-migration.md` §Worktree（公式仕様準拠 SSoT）。

## 使用方法

```bash
# 作成
bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh <branch-name>

# 例
bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh review-reply
# → .worktrees/review-reply/ + feature/review-reply ブランチ

# クリーンアップ
bash .claude/skills/worktree-bootstrap/scripts/cleanup.sh <branch-name> [--force]
```

## bootstrap.sh の処理フロー

1. **引数検証** — branch 名 kebab-case 必須
2. **drift 検知**:
   - `git status --short | wc -l` で未コミット数
   - 未追跡 migration があれば WIP snapshot commit を提案（共有 dev DB drift 回避）
3. **worktree 作成** — `git worktree add -b feature/<name> .worktrees/<name> HEAD`
4. **`.worktreeinclude` 適用** — 同ファイルのパターンに沿って `.env*` / `generated/` / `playwright/.auth/` を Python で copy（PreToolUse hook の `.env` 編集 block を bypass）
5. **完了レポート** — path / branch / base SHA を表示

## cleanup.sh の処理フロー

1. **対象探索** — `.worktrees/<name>` と `.claude/worktrees/<name>` 両方を探す
2. **未コミット変更チェック** — あれば exit 1（`--force` で強制）
3. **未 push commit チェック** — upstream 比較 or main merged 判定 → 必要なら確認 prompt
4. **`git worktree remove`** + **`git worktree prune`** — 公式 cleanup
5. **branch 削除** — main にマージ済みなら自動 `branch -d`、そうでなければ保持

## 関連

- `.claude/rules/git-migration.md` §Worktree — 採否判定 / 公式機能の active 設定 / Subagent 連携（canonical SSoT）
- `.worktreeinclude` — gitignored ファイルの自動 copy 対象（公式 [Copy gitignored files into worktrees](https://code.claude.com/docs/en/worktrees#copy-gitignored-files-into-worktrees)）
- `.claude/settings.json` の `worktree.baseRef` / `cleanupPeriodDays` — 公式 [Worktree settings](https://code.claude.com/docs/en/worktrees#start-claude-in-a-worktree)
- `superpowers:using-git-worktrees` — worktree 運用の一般論
- `.claude/skills/subagent-dispatch-template/SKILL.md` — sub-agent dispatch 時の `isolation: worktree` 規律
