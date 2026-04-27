# 0025 — Subagent dispatch template SSoT を skill 化

- Status: Accepted
- Date: 2026-04-27
- Deciders: Claude Code controller / project owner

## Context

CLAUDE.md「Subagent 規律」節に dispatch prompt template（git 全面禁止 / import alias 3 系統 /
plan deviation policy / 完了報告フォーマット）が散在しており、新規 plan 作成・implementer dispatch
時に毎回 controller が手動で複製していた。特に以下の 3 項目は plan ごとにコピーが必要な
boilerplate だった:

- 🚫 git 全面禁止（`git add / commit / push / reset / checkout / restore / stash`）
- import alias 3 系統（`@/admin/*` / `@/public/*` / `@/shared/*` の解決先）
- plan deviation policy（justified deviation として保持し報告のみ）

さらに combined reviewer の dispatch prompt（spec compliance + code quality + JSON 3 verdict
フォーマット）も毎回書き直しが発生していた。

## Decision

`subagent-dispatch-template` skill（`.claude/skills/subagent-dispatch-template/SKILL.md`）を
新設し、以下を 1 箇所に集約する:

1. Implementer dispatch prompt 必須項目（コピー用ブロック）
2. 完了報告フォーマット（standardized output format）
3. Combined reviewer dispatch prompt template（JSON 3 verdict）
4. Controller の 3 段検証コマンド（`git status` / `wc -l` / `grep`）
5. SSoT ヘルパー改修時の追加明示

CLAUDE.md「Subagent 規律」節からは dispatch prompt template の詳細を削除し、
「→ `subagent-dispatch-template` skill 参照」の 1 行に短縮する。

規律 list（git 禁止理由 / sonnet 以上 / parallel 後の 3 段検証等の文脈・理由）は
CLAUDE.md に残す。skill には「何を書くか（template）」、CLAUDE.md には「なぜそうするか
（理由・文脈）」を分離する。

## Consequences

- **Positive**: dispatch prompt 作成時のコピーコスト削減。template の更新が 1 箇所で完結
- **Positive**: combined reviewer の JSON verdict フォーマットが統一される
- **Negative**: skill を参照する一手間が増える（`when_to_use` で dispatch 直前に参照するよう明示）
- **Neutral**: CLAUDE.md の「Subagent 規律」節は短縮されるが、規律 list 自体（文脈・理由）は維持

## 関連

- C5c Task 2.4（Clean-Break Refactor Phase 2）で実装
- CLAUDE.md「Subagent 規律」節 L224-L247 の dispatch prompt 部分を参照
