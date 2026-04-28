# `.claude/` Configuration Optimization — 公式準拠クリーン実装

> **Snapshot: 2026-04-28** — Implementation completed (4 commits on main: `98c24de2` / `1e155a4d` / `dff56828` / `1781d63b`)
> **Completed: 2026-04-28**
>
> **Date**: 2026-04-28
> **Type**: Breaking refactor (公式 `code.claude.com/docs/en/{memory,sub-agents,skills}` 準拠 + 後方互換なし)
> **Branch**: main（worktree 不使用、5 commit 連続）
> **ADR**: 0028 — process/\*.md 廃止 + barrel index 廃止 + path-scoped rules 完全移行

## Goal

`.claude/` 編集時に毎ターン context 注入される rule docs を **870 行 → ~250 行 (-71%)** に削減する。公式 Claude Code が定める path-scoped rule + skill + memory の 3 層構造に完全準拠させ、独自パターン（barrel index / process barrel）を排除する。

## Why

公式 docs（`code.claude.com/docs/en/memory`）の path-scoped rule 仕様:

- `paths:` あり → 対象ファイル編集時のみ context 注入
- `paths:` なし → **常時注入**（最小限が公式推奨）
- 「If your instructions are growing large, use path-scoped rules」

現状の問題:

1. **barrel index 8 ファイル**（`gotchas.md` / `react-patterns.md` 等）が `paths:` なし = 常時注入。各「TOC のみ・手動参照用」と明記しているのに常時注入は無価値。
2. **`process/*.md` 4 ファイル**（285 行）が常時注入。実体は skill（`subagent-dispatch-template`）/ path-scoped rule で代替可能なパターン集。
3. **CLAUDE.md 198 行** に Tech Stack table / SSoT singletons table が AGENTS.md / `ssot-singletons.md` と重複。
4. **agent ファイル 7 個** が同じ「除外項目」3 行を重複保有（`global-error.tsx` ハードコード除外 / `select.tsx` required / `revalidateTag` 2 引数）。
5. **agent-memory** に 3-5 行の空 MEMORY.md が 6 個、stale audit snapshot が 7 個、`security-reviewer/MEMORY.md` が公式 200 行上限を 276 行超過。

## Phase 順序（CLAUDE.md キャッシュ破壊を最後に集約）

公式 gotcha: `claude-code-patterns.md` 「revise-claude-md はセッション終了直前に呼ぶ」「CLAUDE.md はプロジェクトレベルのプロンプトキャッシュ層」 → CLAUDE.md 変更を最終 phase に。

1. **Phase 1**: barrel index 削除 + 参照置換
2. **Phase 3**: agent 共通除外 SSoT 化
3. **Phase 4**: agent-memory 整理
4. **Phase 5**: skills 棚卸し
5. **Phase 2**: `process/*.md` 廃止 + CLAUDE.md スリム化（最後）

各 Phase = 1 commit。Phase 2 実行直前まで CLAUDE.md には触らない。

---

## Phase 1: barrel index 削除 + 参照置換 (1 commit)

### Delete (8 files)

- `.claude/rules/gotchas.md`
- `.claude/rules/react-patterns.md`
- `.claude/rules/server-actions.md`
- `.claude/rules/tailwind-patterns.md`
- `.claude/rules/zod-patterns.md`
- `.claude/rules/frontend/accessibility.md`
- `.claude/rules/frontend/gsap-patterns.md`
- `.claude/rules/frontend/lexical-patterns.md`

### Reference replacement map (~20 sites)

| Old                                      | New                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `react-patterns.md` (general)            | `react/compiler.md` (Compiler) / `react/hooks.md` (Outer/Inner) / `react/forms-ssr.md` (Form/PPR) / `react/gotchas.md` (禁止) |
| `gotchas.md` (Worktree/DB)               | `ops/deployment-patterns.md`                                                                                                  |
| `gotchas.md` (Claude Code)               | `claude-code-patterns.md`                                                                                                     |
| `gotchas.md` (Seed/Section)              | `implementation-patterns.md`                                                                                                  |
| `gotchas.md` (UI/Form)                   | `frontend/project-design-config.md`                                                                                           |
| `gotchas.md` (Prisma)                    | `prisma-patterns.md`                                                                                                          |
| `server-actions.md` (cache)              | `server-actions/use-cache.md`                                                                                                 |
| `server-actions.md` (impl)               | `server-actions/implementation.md`                                                                                            |
| `tailwind-patterns.md` (color/theme)     | `tailwind-patterns/theme-tokens.md`                                                                                           |
| `zod-patterns.md` (validation)           | `zod-patterns/validation-schemas.md`                                                                                          |
| `frontend/gsap-patterns.md` (motion)     | `frontend/gsap/matchmedia.md`                                                                                                 |
| `frontend/lexical-patterns.md` (toolbar) | `frontend/lexical/toolbar-layout.md`                                                                                          |

### Modify (~20 files)

- `.claude/skills/{audit-seed,audit-lexical,audit-use-server,worktree-bootstrap,parallax-section,lexical-node,lexical-plugin,lexical-toolbar,verify-subagent-report}/SKILL.md` 等
- `.claude/skills/{parallax-section,lexical-toolbar,lexical-node,lexical-plugin}/reference/*.md`
- `.claude/agents/{design-memory,project-reviewer,react-compiler-reviewer,zod-schema-reviewer}.md`
- `.claude/rules/frontend/accessibility/forms-prohibitions.md`
- `.claude/rules/ops/deployment-patterns.md`

CLAUDE.md と `process/*.md` 内の barrel 参照は Phase 2 で一括処理。

### Verification

```bash
grep -rn "\.claude/rules/\(gotchas\|react-patterns\|server-actions\|tailwind-patterns\|zod-patterns\|frontend/accessibility\|frontend/gsap-patterns\|frontend/lexical-patterns\)\.md" .claude/ --include="*.md"
# Phase 1 完了時、CLAUDE.md と process/*.md 以外で 0 件
```

---

## Phase 3: agent 共通除外 SSoT 化 (1 commit)

### Create

- `.claude/rules/audit-exceptions.md`（`paths: [".claude/agents/**"]`）— 共通除外項目 SSoT

```yaml
---
description: コードベース全体で「ルール違反に見えるが正当な例外」のリスト — agents が誤検出しないため SSoT
paths:
  - ".claude/agents/**"
---
```

3 行 SSoT:

- `global-error.tsx` のハードコードカラー — `tailwind-patterns/theme-tokens.md` で client-side fallback として除外
- `select.tsx` の `required` — `frontend/project-design-config.md` で Radix 制約として除外
- `revalidateTag` の第 2 引数 — `server-actions/use-cache.md` で Next.js 16 API として記載

### Modify (7 agents — 該当セクション削除)

- `.claude/agents/accessibility-reviewer.md`
- `.claude/agents/better-auth-reviewer.md`
- `.claude/agents/db-migration-reviewer.md`
- `.claude/agents/react-compiler-reviewer.md`
- `.claude/agents/route-structure-reviewer.md`
- `.claude/agents/security-reviewer.md`
- `.claude/agents/zod-schema-reviewer.md`

各 agent から該当 3 行ブロックを削除し「→ `.claude/rules/audit-exceptions.md` 参照」に置換。

---

## Phase 4: agent-memory 整理 (1 commit)

### Delete: 空 MEMORY.md 6 ファイル

- `.claude/agent-memory/design-memory/MEMORY.md` (5 行)
- `.claude/agent-memory/route-structure-reviewer/MEMORY.md` (4)
- `.claude/agent-memory/react-compiler-reviewer/MEMORY.md` (4)
- `.claude/agent-memory/zod-schema-reviewer/MEMORY.md` (3)
- `.claude/agent-memory/performance-analyzer/MEMORY.md` (3)
- `.claude/agent-memory/better-auth-reviewer/MEMORY.md` (3)

### Modify: 該当 agent から `memory: project` frontmatter 削除

- `.claude/agents/design-memory.md`
- `.claude/agents/route-structure-reviewer.md`
- `.claude/agents/react-compiler-reviewer.md`
- `.claude/agents/zod-schema-reviewer.md`
- `.claude/agents/performance-analyzer.md`
- `.claude/agents/better-auth-reviewer.md`

公式仕様: `memory` field は optional。空 MEMORY.md 強制注入回避のため frontmatter から外す。

### Delete: stale audit snapshot 7 ファイル

- `.claude/agent-memory/project-reviewer/project_public-page-audit-2026-03-24.md` (53)
- `.claude/agent-memory/route-structure-reviewer/audit-2026-04-20.md` (38)
- `.claude/agent-memory/react-compiler-reviewer/project_audit-2026-04-21.md` (86)
- `.claude/agent-memory/zod-schema-reviewer/project_zod-audit-2026-04-21.md` (46)
- `.claude/agent-memory/better-auth-reviewer/project_dual-auth-audit-2026-04-21.md` (17)
- `.claude/agent-memory/performance-analyzer/build_2026-04-21.md` (85)
- `.claude/agent-memory/codebase-explorer/phase3-gcal-patterns.md` (100)

### Modify: `security-reviewer/MEMORY.md` 圧縮

- 476 → 200 行未満（公式 auto-load 上限）
- 詳細は topic file 化（`payment-patterns.md` / `auth-patterns.md` 等）

---

## Phase 5: skills 棚卸し (1 commit)

### Audit 対象（26 skill）

利用実績調査:

- bundled skill との重複: `update-config` / `keybindings-help` / `simplify` / `fewer-permission-prompts` / `loop` / `schedule` / `claude-api` は bundled なのでプロジェクト skill に同名がないことを確認
- 未使用候補: `adr-create` / `prisma-migration` / `audit-*` 9 個 / `debug-*` 5 個

棚卸し結果次第で削除/統合。検出ゼロなら no-op commit でも valid 完了（CLAUDE.md L289 「事前監査で全 PASS の『クリーン実装』指示は no-op plan で valid 完了」）。

---

## Phase 2: `process/*.md` 廃止 + CLAUDE.md スリム化 (1 commit) — **最後**

### Delete (4 files)

- `.claude/rules/process/git-migration.md` (44 行)
- `.claude/rules/process/implementation-patterns.md` (129)
- `.claude/rules/process/research-audit.md` (56)
- `.claude/rules/process/subagent-discipline.md` (56)
- ディレクトリ `.claude/rules/process/` も削除

### 移行先

| 元ファイル                   | 移行先                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subagent-discipline.md`     | `.claude/skills/subagent-dispatch-template/SKILL.md` 本体に統合                                                                                  |
| `research-audit.md`          | `.claude/rules/research-audit.md`（`paths: [".claude/agents/**", ".claude/skills/audit-*/**", ".claude/skills/verify-subagent-report/**"]`）     |
| `implementation-patterns.md` | `.claude/rules/implementation-patterns.md`（`paths: ["src/shared/domain/**", "src/app/(admin)/**/_shared/actions/**", "prisma/schema.prisma"]`） |
| `git-migration.md`           | `.claude/rules/git-migration.md`（`paths: ["prisma/migrations/**", ".github/workflows/**"]`）                                                    |

### CLAUDE.md スリム化 (198 → ~120 行)

削除対象セクション:

- L33-46 「技術スタック table」 → AGENTS.md `#tech-stack` 参照のみ残す
- L160-181 「SSoT singletons table」 → `.claude/rules/ssot-singletons.md`（path-scoped で auto-load）に完全委譲、CLAUDE.md は「主要 SSoT は `ssot-singletons.md`」の 1 行ポインタのみ
- L185-194 「自動ロード」セクション → 公式 docs `code.claude.com/docs/en/memory` 参照のみ
- L196-204 「公式 API / ベストプラクティス準拠の原則」 → `.claude/rules/research-audit.md` に集約済みなので CLAUDE.md からは削除

CLAUDE.md L138 の barrel 仕様矛盾記述（「barrel index は TOC のみで `paths:` 持たず実体 sub-file が auto-load」）も削除。

### CLAUDE.md / process/\* 内の barrel 参照修正

Phase 1 でスキップした CLAUDE.md / process/\*.md（→ Phase 2 で削除）内の barrel 参照を全て sub-file path に置換。

---

> **Note (2026-04-28)**: ADR 機能全体を後続 commit で廃止したため、当初本 plan で作成した ADR 0028 は削除済み。判断ロジックは本 plan が canonical 記録。

---

## Verification (各 Phase 後)

```bash
bun run validate  # type-check + lint
git diff --stat HEAD~1  # 変更ファイル数確認
```

最終 Phase 後:

```bash
# 常時ロード rule = 0 確認
grep -L "^paths:" $(find .claude/rules -type f -name "*.md") 2>/dev/null
# 期待結果: 出力なし

# barrel ファイル不在確認
ls .claude/rules/{gotchas,react-patterns,server-actions,tailwind-patterns,zod-patterns}.md 2>&1 | grep "No such"

# process/ ディレクトリ不在確認
ls .claude/rules/process/ 2>&1 | grep "No such"
```

## 完了基準

- [ ] 5 commit が main に積まれている（Phase 1 → 3 → 4 → 5 → 2 順）
- [ ] `bun run validate` exit 0
- [ ] 常時ロード rule = 0 ファイル
- [ ] CLAUDE.md ≤ 130 行
- [ ] `MEMORY.md` 更新（本 plan を完了マーカー付きで記録）
