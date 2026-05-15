---
description: Serena MCP の使い分け規律。LSP-backed symbol query 専用化、Read/Edit/Grep は Claude Code native を canonical 経路として維持。`.serena/project.yml` SSoT に対応。
paths:
  - ".serena/**"
  - ".claude/rules/frontend/design-system-memory.md"
  - ".claude/skills/audit-memory-staleness/**"
  - ".claude/agents/codebase-explorer.md"
---

# Serena MCP 使い分け規律

> 公式仕様: <https://oraios.github.io/serena/02-usage/050_configuration.html>
> SSoT 設定ファイル: `.serena/project.yml`（本プロジェクトの per-project 設定）

## 大原則

**Claude Code の Read / Edit / Grep / Glob を canonical 探索・編集経路として使う。**
Serena は LSP-backed symbol query（`find_symbol` / `find_referencing_symbols` / `get_symbols_overview` / `rename_symbol`）のみ使う。

### なぜ Serena 主導にしないか

公式 `claude-code` context の system prompt は `Read FORBIDDEN for discovery`・`Edit FORBIDDEN` を強要する設計だが、本プロジェクトは:

- `.claude/rules/**/*.md` の **path-scoped auto-load** が Read trigger を前提とした設計
- rule docs / yaml / json / md 探索は Glob + Grep が canonical
- 短時間で完結する局所 edit が大半（Claude Code Edit の方が低 overhead）

Serena を主導にすると **rule auto-load が動かない silent bug** + **Edit 経路の二重化で意思決定コスト増** が発生する。`.serena/project.yml` で edit 系 tool を `excluded_tools` に入れて分業を強制している。

## 使い分けマトリクス

| 用途                    | Canonical            | Serena が勝つ場面                                                     |
| ----------------------- | -------------------- | --------------------------------------------------------------------- |
| ファイル名探索          | Glob                 | （なし）                                                              |
| テキスト探索            | Grep                 | （なし）                                                              |
| 既知 path の Read       | Read                 | （なし）                                                              |
| Symbol 定義引き         | Grep                 | `find_symbol`（AST 精度、ext deps もカバー）                          |
| Symbol の caller 列挙   | Grep                 | `find_referencing_symbols`（誤検出少、grouped by file）               |
| 大規模 file の構造把握  | Read（offset/limit） | `get_symbols_overview`（軽量）                                        |
| Symbol rename           | Edit + Grep 確認     | `rename_symbol`（AST-aware、全 callsite 一発）                        |
| 1-3 行 edit             | Edit                 | （なし）                                                              |
| 大規模 symbol body 置換 | Edit                 | `replace_symbol_body`（**現状 excluded、必要なら project.yml 編集**） |

## Memory 運用

公式仕様の `read_memory` 注記: **「現タスクに関連する場合のみ」読む**。

### read_memory の判定

| タスク                   | 推奨 memory                                          |
| ------------------------ | ---------------------------------------------------- |
| 公開ページ UI / デザイン | `design-system`（reference URLs / OKLCH / clamp 表） |

その他のドメイン（Admin / 予約 / Section / Lexical 等）は `.claude/rules/**/*.md` の path-scoped auto-load を一次経路とする。2026-05-15 cleanup で過去 Snapshot 系 memory（admin-architecture / reservation-customer-system / section-system-research / lexical/node-\* 等 15 件）は全削除済 — `.claude/rules/**` が SSoT、Serena memory への二重化は drift の温床。

無関係 memory を読まない（context 浪費）。

### write_memory の判定

**user 明示要求時のみ。** `.claude/rules/**/*.md` が設計判断・規律の SSoT のため、自動 `write_memory` は SSoT 二重化を生み drift する。

例外: `.claude/rules/frontend/design-system-memory.md` に従い `design-system` memory を初回作成・更新するケース（`/frontend-design` skill 経由のセッション内デザイン判断の永続化）。

### memory 保護

`.serena/project.yml` で以下を設定済:

- `read_only_memory_patterns`: `design-system`（agent 上書き防止）
- `ignored_memory_patterns`: `_archive/.*` / dated snapshot（`list_memories` 出力から除外）

## Onboarding

`.serena/project.yml` で `added_modes: [no-onboarding]` を設定済。2026-05-15 cleanup 後の active memory は `design-system.md` + `MEMORY.md` index のみ。

新しい architecture が定着した場合は **まず `.claude/rules/**/\*.md` に rule docs として codify\*\*。Serena memory への二重化は SSoT 違反のため、原則 user 明示要求時のみ追加。

## Staleness 監査

`.claude/skills/audit-memory-staleness/SKILL.md` の検出スクリプトを定期実行（大規模リファクタ・ファイル移動・機能削除直後）。`.serena/project.yml` の `ignored_memory_patterns` で除外した dated snapshot は skill 側も自動 skip する。

## Gotchas

- **`.serena/cache/` は per-machine** — 215MB の TS LSP インデックス。`.gitignore` で除外済（`.serena/cache/` / `.serena/logs/` / `.serena/project.local.yml`）
- **`.serena/memories/` は部分 tracked / 部分 ignored 状態** — `.gitignore` 緩和（2026-05-15）以後の新規 memory は素直に track される。過去の `git add -f` 履歴は維持
- **`.serena/project.yml` 編集後は Serena MCP 再起動が必要** — Claude Code セッション再起動 or MCP server restart。設定が反映されない silent bug
- **`excluded_tools` の効果は startup 時のみ** — runtime で tool 一覧を変えられない。一時的に Serena edit tool を使いたい場合は `.serena/project.local.yml` に override（gitignored）

## 参照

- 公式: <https://oraios.github.io/serena/02-usage/050_configuration.html>（contexts / modes）
- 公式: <https://oraios.github.io/serena/02-usage/045_memories.html>（memory 仕様）
- SSoT: `.serena/project.yml`
- 関連: `.claude/skills/audit-memory-staleness/SKILL.md` / `.claude/rules/frontend/design-system-memory.md`
