# docs/plans

実装計画ドキュメント置き場（**WIP 専用**、clean-break 原則: [ADR-0015](../architecture/decisions/0015-clean-break-refactor-and-parallel-implementer-discipline.md)）。

## セッション継続時

```bash
# 進行中の計画を検索（両ディレクトリ）
grep -l "ステータス.*\(実装中\|設計承認済み\)\|For agentic workers" \
  docs/plans/*.md docs/superpowers/plans/*.md 2>/dev/null \
  | grep -v CLAUDE.md | grep -v README.md

# README.md で進行中タスクを確認
head -30 docs/plans/README.md

# 最新の計画ファイル
ls -t docs/plans/*.md docs/superpowers/plans/*.md 2>/dev/null \
  | grep -v CLAUDE.md | grep -v README.md | head -10
```

## プランの作成

`brainstorming` → `writing-plans` スキルが自動作成する。

### 命名規則

**日付形式** (`YYYY-MM-DD-title.md`) のみ使用。設計ドキュメントは `-design` サフィックス。

連番形式（`001-*.md`〜`080-*.md`）は初期の完了済み計画で、clean-break 方針により削除済み。集約サマリーは [`archive/completed-legacy.md`](./archive/completed-legacy.md)、個別プランは git history（`git log --all --diff-filter=D -- docs/plans/001-*.md`）で辿る。

### フォーマット

```markdown
# タイトル

**日付**: YYYY-MM-DD
**種別**: 新機能 | バグ修正 | リファクタリング | 破壊的変更
**ステータス**: 設計中 | 設計承認済み | 実装中

---

## 概要

[何をなぜ実装するか 2〜3行]

## 実装ステップ

- [ ] Step 1
- [ ] Step 2
```

### ステータス管理（clean-break）

`設計中` → `設計承認済み` → `実装中` → **削除**

完了・破棄いずれも **ファイル削除** する。長期的に保持すべき意思決定は [ADR](../architecture/decisions/) に昇格する。git log が SSoT のため、コミットメッセージにプランファイル名を含めると後続セッションが辿りやすい（例: `feat(foo): implement plan docs/plans/YYYY-MM-DD-foo.md (phase 2)`）。

## 実行

計画実行時のスキルチェーン:

1. `superpowers:using-git-worktrees` — 隔離 worktree を作成
2. `superpowers:subagent-driven-development` — 同一セッション内でサブエージェント実行（推奨）
3. `superpowers:executing-plans` — 別セッションでバッチ実行・チェックポイントでレビュー

## 計画ファイルの配置

| パス                      | 用途                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `docs/plans/`             | 直接 Write で作成した日付プラン・軽量タスク                          |
| `docs/superpowers/plans/` | `superpowers:writing-plans` スキル生成の詳細プラン（タスク分解付き） |
| `docs/superpowers/specs/` | `superpowers:brainstorming` スキル生成の要件・設計ドキュメント       |

`brainstorming` → `writing-plans` → `subagent-driven-development` のスキルチェーンで使用。`docs/superpowers/` 配下のディレクトリは clean-break 後は空で、skill 実行時に再作成される。
