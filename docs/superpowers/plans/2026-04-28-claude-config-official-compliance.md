# 2026-04-28 Claude Code 公式準拠クリーンアップ

> **Snapshot: 2026-04-28**
> **Completed: 2026-04-28**
> 同日 ADR 0028（Claude Config Optimization）完了直後の追加クリーンアップ。
> 公式仕様 5 層（memory / rules / subagents / skills / hooks）一次ソース検証で発見した残差逸脱を、後方互換性なしで除去する。

## 一次ソース検証結果

`.claude/rules/research-audit.md` Step 1-2 に従い、Claude Code 本体の公式 docs を WebFetch で取得して照合した。

| 公式 docs                            | 検証ポイント                                                                    | 現状                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `code.claude.com/docs/en/memory`     | `.claude/rules/` + `paths:` frontmatter は公式機能                              | ✅ 全 32 rule docs `paths:` 完備                                  |
| `code.claude.com/docs/en/skills`     | SKILL.md < 500 行、description + when_to_use 合計 1,536 chars 上限              | ✅ 全 31 skill 準拠                                               |
| `code.claude.com/docs/en/sub-agents` | frontmatter `name`/`description` 必須、その他は任意フィールド                   | ✅ 全 15 agent 公式 frontmatter のみ使用                          |
| `code.claude.com/docs/en/sub-agents` | **v2.1.63 で `Task` tool → `Agent` tool に rename。`Task` は alias として残存** | ⚠️ `matcher: "Task"` が残存                                       |
| `code.claude.com/docs/en/sub-agents` | `memory:` 設定なし agent は `agent-memory/<name>/` を持たない                   | ⚠️ design-memory / react-compiler-reviewer が orphaned dir を保有 |
| `code.claude.com/docs/en/memory`     | `MEMORY.md` 200 行 / 25KB 上限、archive は trim 推奨                            | ⚠️ 「次回参照不要」明記の archive 5 件残存                        |

## 差分（破壊的変更で除去）

### Phase 1: `Task` → `Agent` matcher rename（公式 v2.1.63 準拠）

公式 docs より:

> In version 2.1.63, the Task tool was renamed to Agent. Existing `Task(...)` references in settings and agent definitions still work as aliases.

alias は後方互換のための一時措置。クリーン実装目標に従い `Agent` に統一する。

修正対象:

- `.claude/settings.json` L136: `"matcher": "Task"` → `"matcher": "Agent"`
- `.claude/rules/claude-code-patterns.md` L73: 「Task ツール不可」 → 「Agent ツール不可」
- `.claude/rules/ops/hooks-patterns.md` L116-120: `matcher: "Task"` 解説 → `matcher: "Agent"` 解説 + v2.1.63 rename 注記
- `.claude/skills/verify-subagent-report/SKILL.md` L149: 「Task tool 実行後」 → 「Agent tool 実行後」

### Phase 2: orphaned agent-memory directory 削除

`memory:` frontmatter なしの agent に対する `.claude/agent-memory/<name>/` は孤立データ。公式仕様では `memory:` 設定時のみ生成される。

削除対象:

- `.claude/agent-memory/design-memory/` (3 files) — agent .md に `memory:` なし
- `.claude/agent-memory/react-compiler-reviewer/` (1 file) — agent .md に `memory:` なし

その他 6 件（codebase-explorer / project-reviewer / security-reviewer / test-writer / test-runner / verification）は agent .md に `memory:` 設定済み = 公式準拠維持。

### Phase 3: MEMORY.md archive entry プルーニング

公式 docs より:

> The first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first, are loaded at the start of every conversation.

現状 130 行で上限内だが、「次回参照不要」明記の 5 件 (archive 2026-04-28) は無価値な常時注入。index から削除（**ファイル本体は学習用に保持**）。

削除対象 (MEMORY.md index 行のみ):

- `project_p17-19-sequential-handoff` archive
- `project_clean-break-refactor-handoff` archive
- `project_clean-break-c5-handoff` archive
- `project_meo-multi-location-handoff` archive
- `project_section-arch-phase-b-handoff`（保持理由: 経緯学習用と明記） → これは保持

実削除は 4 件 + section header 整理。

## 検証

- `bun run validate` exit 0 維持（rule / skill / agent 配下に TypeScript 影響なし）
- `.claude/rules/audit-exceptions.md` への新規例外不要

## ADR

ADR system は 2026-04-28 ADR 0028 で撤回済み。本変更は plan 文書 + git log で履歴管理。

## 完了マーカー

> **Completed: 2026-04-28**

実行サマリ:

- Phase 1 (Task → Agent rename): `.claude/settings.json` / `.claude/rules/claude-code-patterns.md` / `.claude/rules/ops/hooks-patterns.md` / `.claude/skills/verify-subagent-report/SKILL.md` 計 4 ファイル更新
- Phase 2 (orphaned agent-memory 削除): `.claude/agent-memory/{design-memory,react-compiler-reviewer}/` 削除（gitignore 済み = git 履歴影響なし）
- Phase 3 (MEMORY.md プルーニング): 130 行 → 117 行（archive 4 セクション削除）
