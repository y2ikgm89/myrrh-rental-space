# 実装計画（docs/plans/）

`docs/plans/` は **WIP 専用** の実装計画置き場。完了プランは削除し、コンテキストは git log と ADR で辿る（clean-break 原則: [ADR-0015](../architecture/decisions/0015-clean-break-refactor-and-parallel-implementer-discipline.md)）。

---

## 現在進行中

_(なし — `docs/plans/*.md` に該当ファイルがある場合はここに列挙する)_

自動検出:

```bash
ls docs/plans/*.md docs/superpowers/plans/*.md 2>/dev/null \
  | grep -v CLAUDE.md | grep -v README.md
```

---

## 作成・実行の流れ

| ステップ     | ツール                                                                         | 出力先                                                  |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 要件・設計   | `superpowers:brainstorming`                                                    | `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`    |
| 詳細プラン   | `superpowers:writing-plans`                                                    | `docs/superpowers/plans/YYYY-MM-DD-<name>.md`           |
| 軽量タスク   | 直接 `Write`                                                                   | `docs/plans/YYYY-MM-DD-<name>.md`                       |
| 実行（推奨） | `superpowers:subagent-driven-development`                                      | —                                                       |
| 実行（別）   | `superpowers:executing-plans`                                                  | —                                                       |
| 完了後       | **プランファイルを削除** — 恒久決定は [ADR](../architecture/decisions/) に昇格 | git log: `git log --all --diff-filter=D -- docs/plans/` |

詳細手順は [`CLAUDE.md`](./CLAUDE.md)。

---

## 履歴の辿り方

- **アーキテクチャ決定事項**: [`docs/architecture/decisions/`](../architecture/decisions/)
- **2026-02-07 以前の完了プラン**（約 80 件の集約サマリー）: [`archive/completed-legacy.md`](./archive/completed-legacy.md)
- **2026-02-08 以降の個別プラン**: git history のみ。代表コマンド:
  ```bash
  git log --all --diff-filter=D --name-only --format="%h %s" -- docs/plans/ docs/superpowers/
  git show <sha>:docs/plans/<filename>.md
  ```
- **進行中プランの drift 検出**: `plan-drift-detector` subagent（プラン記載の identifier と実装の乖離を自動検出）

---

## 方針（clean-break 原則）

1. プランは **ephemeral** — 完了したら削除する。git log が SSoT
2. 恒久的な意思決定は **ADR** に昇格する（`docs/architecture/decisions/`）
3. プラン間の相互参照は最小化する — drift と dangling link の温床
4. プロジェクト品質スコアのような state 情報は README に置かない — stale 化する
