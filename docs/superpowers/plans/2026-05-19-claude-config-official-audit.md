# 2026-05-19: Claude Code 公式準拠 audit + clean-break

## 概要

`code.claude.com/docs/en/{memory,sub-agents,skills,settings,hooks}` 最新仕様に対する `.claude/` 全 5 層（Memory / Rules / Subagents / Skills / Hooks）+ CLAUDE.md + settings.json の drift 監査。公式準拠 drift はゼロ（`audit-claude-config` Phase 1 全 PASS）だが、副次的に検出した patch version hardcode と `worktree-bootstrap` legacy fallback を「後方互換性のないクリーン化」指示に従い削除。

## 監査結果（`audit-claude-config` Phase 1）

| Check                                                                        | 結果                      |
| ---------------------------------------------------------------------------- | ------------------------- |
| `paths:` frontmatter 全 rule カバー                                          | ✅ 100%                   |
| Agent frontmatter（公式 field のみ使用）                                     | ✅ 全 15 agents           |
| Skill frontmatter（公式 field のみ使用）                                     | ✅ 全 33 skills           |
| description + when_to_use 1536 字以下                                        | ✅ 全 skills              |
| `memory: project` 宣言 ↔ `agent-memory/` 整合                                | ✅ 整合                   |
| 撤回 pattern 残骸（`docs/reference` / `.archive` / `.claude/rules/gotchas`） | ✅ ゼロ                   |
| CLAUDE.md size                                                               | ✅ 154 行 / 200 行 target |

公式 spec WebFetch（Phase 2）も実行済。`hooks-patterns.md` の event 表 + `claude-code-patterns.md` の field 表は最新仕様（v2.1.141+ の 30 events）と差分なし。

## 実装内容（clean-break）

### 1. patch version hardcode の SSoT 化

rule 本文の `Better Auth 1.6.10` / `nuqs 2.8.9` / `Next.js 16.2` 等の minor/patch version 記述を削除し、`package.json` SSoT 参照に置換（`markdown-style.md` §バージョン値の md 内ハードコード禁止 規律準拠）。

### 2. `worktree-bootstrap` legacy SKILL 削除

公式 `claude --worktree <name>` を唯一の canonical 経路に一本化。手動 `bash bootstrap.sh` / `bash cleanup.sh` の legacy fallback path および `.worktrees/` legacy location（公式は `.claude/worktrees/`）を撤廃。

## 変更ファイル

- `.claude/rules/auth-patterns.md` — `Better Auth 1.6.10 / RBAC / Next.js 16.2 対応` を package.json SSoT 参照に
- `.claude/rules/nuqs-patterns.md` — `nuqs 2.8.9 / Next.js 16.2 対応` を簡素化
- `.claude/rules/error-handling.md` — `Next.js 16.2 Server Actions` を package.json SSoT 参照に
- `.claude/rules/implementation-patterns.md` — skill リストから `worktree-bootstrap` 除去
- `.claude/rules/git-migration.md` — Worktree セクションを公式 `claude --worktree` のみに整理（legacy fallback 表行 + `bootstrap.sh` セクション削除）
- `.claude/rules/ops/deployment/secrets-and-ignore.md` — `.worktrees/` を `.claude/worktrees/` に
- `.claude/skills/subagent-dispatch-template/SKILL.md` — `worktree-bootstrap` 言及削除
- `.claude/skills/verify-subagent-report/SKILL.md` — `.worktrees/` を `.claude/worktrees/` に
- `.gitignore` — `.worktrees/` 行削除

## 削除ファイル

- `.claude/skills/worktree-bootstrap/SKILL.md`
- `.claude/skills/worktree-bootstrap/scripts/bootstrap.sh`
- `.claude/skills/worktree-bootstrap/scripts/cleanup.sh`

## 検証

- [ ] `bun run validate`（type-check + lint）
- [ ] `bun run build`
- [ ] `grep -rn "worktree-bootstrap\|\.worktrees/" .claude/ CLAUDE.md AGENTS.md` ゼロ件
- [ ] `bash .claude/skills/audit-claude-config/` Phase 1 全 PASS 維持

## マイグレーション

不要（Claude Code config のみ）

## 環境変数

なし

## 影響範囲

- **dev workflow**: `claude --worktree <name>` が唯一の canonical。手動 `bash bootstrap.sh` ワークフローは廃止
- **subagent isolation**: `Agent` tool の `isolation: "worktree"` 公式 option を使用（既存 path）
- **package.json drift**: minor/patch version の rule 本文記述廃止により `bun update` 後の rule docs 同期作業不要
