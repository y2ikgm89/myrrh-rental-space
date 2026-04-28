# ADR 0028: `.claude/rules` を path-scoped rules のみに統一

- **Status**: Accepted
- **Date**: 2026-04-28
- **Supersedes**: なし（barrel index / process barrel パターンを撤回）
- **Related**: 0025 subagent-dispatch-template SSoT / 0026 skill naming convention

## Context

Claude Code 公式仕様（`code.claude.com/docs/en/memory`）の rules システムは「path-scoped」が基本設計:

- `paths:` あり → 対象ファイル編集時のみ context 注入
- `paths:` なし → **常時注入**（公式は「最小限」を推奨: "If your instructions are growing large, use path-scoped rules so instructions load only when Claude works with matching files"）

本プロジェクトは 2 種類の独自パターンで「常時注入」rule を 12 ファイル抱えていた:

### 1. barrel index（8 ファイル、114 行）

`gotchas.md` / `react-patterns.md` / `server-actions.md` / `tailwind-patterns.md` / `zod-patterns.md` / `frontend/accessibility.md` / `frontend/gsap-patterns.md` / `frontend/lexical-patterns.md`

各ファイル冒頭に「**TOC のみ。実体は sub-file が `paths:` で auto-load する。手動参照用**」と明記しているにもかかわらず、`paths:` を持たないため **毎セッション常時注入されていた**。これは公式が想定する rules 機能の使い方ではない。

### 2. process barrel（4 ファイル、285 行）

`process/git-migration.md` / `process/implementation-patterns.md` / `process/research-audit.md` / `process/subagent-discipline.md`

「常に必要なプロセスルール」として常時注入していたが、内容を精査すると:

- `subagent-discipline.md` は subagent dispatch 時のみ必要（`subagent-dispatch-template` skill が canonical）
- `research-audit.md` は調査・監査時のみ必要（`audit-*` / `verify-subagent-report` skill 経由）
- `implementation-patterns.md` は実装パターン集（path-scoped で `src/shared/domain/**` 等に scope 可）
- `git-migration.md` は Git / Migration 操作時のみ必要

→ **すべて path-scoped または skill 統合に置換可能**。常時注入は過剰。

### 計測

`.claude/` 編集時に毎ターン注入される rule docs の合計: **約 870 行**

- CLAUDE.md (常時): 198 行
- barrel index 8 (常時): 114 行
- process/\*.md 4 (常時): 285 行
- `.claude/**` path-scoped (`gotchas/claude-code.md` 等): ~270 行

## Decision

`.claude/rules/` 内の rule docs を **すべて `paths:` 付きの path-scoped rules** に統一する。常時注入される rule（`paths:` なし）はゼロにする。

### 具体的な変更

1. **barrel index 8 ファイル削除**。参照していた agents / skills / rules sub-file 内の path 参照は最も適切な sub-file（`react/compiler.md` / `gotchas/claude-code.md` 等）への直接 path に書き換え。

2. **process/\*.md 4 ファイル廃止**:
   - `subagent-discipline.md` → `subagent-dispatch-template` skill 本体に統合
   - `research-audit.md` → `.claude/rules/research-audit.md`（`paths: [".claude/agents/**", ".claude/skills/audit-*/**", ".claude/skills/verify-subagent-report/**"]`）に移動
   - `implementation-patterns.md` → `.claude/rules/implementation-patterns.md`（`paths: ["src/shared/domain/**", "src/app/(admin)/**/_shared/actions/**", "prisma/schema.prisma"]`）に移動
   - `git-migration.md` → `.claude/rules/git-migration.md`（`paths: ["prisma/migrations/**", ".github/workflows/**", "docs/architecture/decisions/**"]`）に移動

3. **CLAUDE.md スリム化（198 → ~120 行）**: 重複セクション（Tech Stack table → AGENTS.md / SSoT singletons table → `ssot-singletons.md` / 自動ロード説明 → 公式 docs / 公式 API 準拠原則 → `research-audit.md`）を削除。

4. **agent 共通除外項目 SSoT 化**: 7 agents が重複保有している「除外項目」3 行を `.claude/rules/audit-exceptions.md`（`paths: [".claude/agents/**"]`）に集約。

## Consequences

### 良い影響

- **毎ターン context 注入 -71%**（870 行 → ~250 行）。`.claude/` 編集セッション全般のレスポンス速度向上。
- **公式仕様への準拠**: 将来の Claude Code バージョンアップ時の互換性向上。barrel / process barrel のような独自パターンを公式メカニズムに置換。
- **rule docs の一貫性**: 「TOC のみ・手動参照用」と「常時注入」の矛盾解消。`.claude/rules/**/*.md` はすべて path-scoped で意味のあるトリガーを持つ。
- **重複削減**: agent 内の「除外項目」3 行 × 7 ファイル → 単一 SSoT。

### 悪い影響 / 受け入れる代償

- **後方互換性なし**: barrel ファイルへの参照は破壊。Phase 1 で 20+ 箇所の参照を sub-file 直接 path に書き換える必要がある。
- **「TOC を 1 ファイルで参照したい」用途の喪失**: barrel index は人間が「rules 一覧」として読むためにも使われていた。代替として `ls .claude/rules/**/*.md` で十分。
- **subagent-dispatch-template skill の肥大化**: `subagent-discipline.md` 統合により skill が 100+ 行追加。skill 公式上限 500 行は満たすため許容。

### 例外条項

公式の推奨する `paths:` なし rules の用途は本 ADR 後ゼロにする。今後 path-scoped で表現できない rule が必要になった場合のみ、その都度 ADR で正当化する。

## Verification

```bash
# 常時ロード rule = 0 確認
grep -L "^paths:" $(find .claude/rules -type f -name "*.md") 2>/dev/null
# 期待: 出力なし

# barrel + process ファイル不在確認
ls .claude/rules/{gotchas,react-patterns,server-actions,tailwind-patterns,zod-patterns}.md 2>&1 | grep "No such" | wc -l  # 期待: 5
ls .claude/rules/process/ 2>&1 | grep "No such"  # 期待: 1 件 hit

# CLAUDE.md 行数
wc -l CLAUDE.md  # 期待: ≤ 130 行

bun run validate  # exit 0
```

## References

- [`code.claude.com/docs/en/memory`](https://code.claude.com/docs/en/memory) — Path-specific rules
- [`code.claude.com/docs/en/skills`](https://code.claude.com/docs/en/skills) — Skill 公式仕様（`paths:` サポート）
- ADR 0025 — subagent-dispatch-template SSoT
- ADR 0026 — skill naming convention
- Plan: `docs/superpowers/plans/2026-04-28-claude-config-optimization.md`
