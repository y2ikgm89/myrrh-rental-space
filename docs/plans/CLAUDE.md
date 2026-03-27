# docs/plans

実装計画ドキュメント置き場。

## セッション継続時

```bash
# 進行中の計画を検索（最も頻繁に使う）
grep -l "実装中\|設計承認済み" docs/plans/*.md

# README.md 上部で進行中タスクを確認
head -50 docs/plans/README.md

# 最新の計画ファイル
ls -t docs/plans/*.md | head -10
```

## プランの作成

`brainstorming` → `writing-plans` スキルが `docs/plans/YYYY-MM-DD-<name>.md` を自動作成する。

### 命名規則

新規は **日付形式** (`YYYY-MM-DD-title.md`) のみ使用。設計ドキュメントは `-design` サフィックス。

> 連番形式（`001-*.md`）は初期の完了済み計画。新規には使わない。

### フォーマット

```markdown
# タイトル

**日付**: YYYY-MM-DD
**種別**: 新機能 | バグ修正 | リファクタリング | 破壊的変更
**ステータス**: 設計中 | 設計承認済み | 実装中 | 完了

---

## 概要

[何をなぜ実装するか 2〜3行]

## 実装ステップ

- [ ] Step 1
- [ ] Step 2
```

### ステータス管理

`設計中` → `設計承認済み` → `実装中` → `完了`

完了時は計画ファイルと `README.md` の両方を更新（`README.md` には `✅` を付与）。

## 実行

計画実行時のスキルチェーン:

1. `superpowers:using-git-worktrees` — 隔離 worktree を作成
2. `superpowers:subagent-driven-development` — 同一セッション内でサブエージェント実行（推奨）
3. `superpowers:executing-plans` — 別セッションでバッチ実行・チェックポイントでレビュー

## superpowers による計画

`brainstorming` → `writing-plans` スキルは `docs/superpowers/plans/` に計画、`docs/superpowers/specs/` にスペックを作成する。
