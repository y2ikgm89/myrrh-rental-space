# `.claude/` Configuration Optimization — Official-Compliant Clean Implementation

> **Snapshot: 2026-04-28** — Implementation completed (4 commits on main: `98c24de2` / `1e155a4d` / `dff56828` / `1781d63b`)
> **Completed: 2026-04-28**
>
> **Date**: 2026-04-28
> **Type**: Breaking refactor (compliant with official `code.claude.com/docs/en/{memory,sub-agents,skills}` + no backward compatibility)
> **Branch**: main (no worktree, 5 consecutive commits)
> **ADR**: 0028 — deprecate process/\*.md + remove barrel index + full migration to path-scoped rules

## Goal

Reduce rule docs injected every turn while editing `.claude/` from **870 lines → ~250 lines (-71%)**. Fully align with the official Claude Code 3-layer structure (path-scoped rules + skills + memory) and remove custom patterns (barrel index / process barrel).

## Why

Path-scoped rule spec from official docs (`code.claude.com/docs/en/memory`):

- `paths:` present → inject context only when editing target files
- `paths:` absent → **always injected** (officially recommended to keep minimal)
- 「If your instructions are growing large, use path-scoped rules」

Current issues:

1. **Eight barrel index files** (`gotchas.md` / `react-patterns.md`, etc.) have no `paths:` and are always injected. They explicitly say "TOC only / manual reference", so constant injection adds no value.
2. **Four `process/*.md` files** (285 lines) are always injected. Their content can be replaced by skills (`subagent-dispatch-template`) / path-scoped rules.
3. **CLAUDE.md 198 lines** duplicate the Tech Stack table / SSoT singletons table from AGENTS.md / `ssot-singletons.md`.
4. **Seven agent files** duplicate the same three "exclusions" lines (`global-error.tsx` hard-coded exclusion / `select.tsx` required / `revalidateTag` two-arg).
5. **agent-memory** has six empty MEMORY.md files (3–5 lines), seven stale audit snapshots, and `security-reviewer/MEMORY.md` exceeds the official 200-line limit at 276 lines.

## Phase order (bundle CLAUDE.md cache busting last)

Official gotcha in `claude-code-patterns.md`: "call revise-claude-md right before session end" and "CLAUDE.md is a project-level prompt cache layer" → move CLAUDE.md changes to the final phase.

1. **Phase 1**: remove barrel index + replace references
2. **Phase 3**: centralize agent common exclusions as SSoT
3. **Phase 4**: clean up agent-memory
4. **Phase 5**: skills audit
5. **Phase 2**: deprecate `process/*.md` + slim CLAUDE.md (last)

Each phase = one commit. Do not touch CLAUDE.md until right before Phase 2.

---

## Phase 1: remove barrel index + replace references (1 commit)

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

| Old                                      | New                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `react-patterns.md` (general)            | `react/compiler.md` (Compiler) / `react/hooks.md` (Outer/Inner) / `react/forms-ssr.md` (Form/PPR) / `react/gotchas.md` (prohibited) |
| `gotchas.md` (Worktree/DB)               | `ops/deployment-patterns.md`                                                                                                        |
| `gotchas.md` (Claude Code)               | `claude-code-patterns.md`                                                                                                           |
| `gotchas.md` (Seed/Section)              | `implementation-patterns.md`                                                                                                        |
| `gotchas.md` (UI/Form)                   | `frontend/project-design-config.md`                                                                                                 |
| `gotchas.md` (Prisma)                    | `prisma-patterns.md`                                                                                                                |
| `server-actions.md` (cache)              | `server-actions/use-cache.md`                                                                                                       |
| `server-actions.md` (impl)               | `server-actions/implementation.md`                                                                                                  |
| `tailwind-patterns.md` (color/theme)     | `tailwind-patterns/theme-tokens.md`                                                                                                 |
| `zod-patterns.md` (validation)           | `zod-patterns/validation-schemas.md`                                                                                                |
| `frontend/gsap-patterns.md` (motion)     | `frontend/gsap/matchmedia.md`                                                                                                       |
| `frontend/lexical-patterns.md` (toolbar) | `frontend/lexical/toolbar-layout.md`                                                                                                |

### Modify (~20 files)

- `.claude/skills/{audit-seed,audit-lexical,audit-use-server,worktree-bootstrap,parallax-section,lexical-node,lexical-plugin,lexical-toolbar,verify-subagent-report}/SKILL.md`, etc.
- `.claude/skills/{parallax-section,lexical-toolbar,lexical-node,lexical-plugin}/reference/*.md`
- `.claude/agents/{design-memory,project-reviewer,react-compiler-reviewer,zod-schema-reviewer}.md`
- `.claude/rules/frontend/accessibility/forms-prohibitions.md`
- `.claude/rules/ops/deployment-patterns.md`

Handle barrel references inside CLAUDE.md and `process/*.md` together in Phase 2.

### Verification

```bash
grep -rn "\.claude/rules/\(gotchas\|react-patterns\|server-actions\|tailwind-patterns\|zod-patterns\|frontend/accessibility\|frontend/gsap-patterns\|frontend/lexical-patterns\)\.md" .claude/ --include="*.md"
# After Phase 1, zero hits outside CLAUDE.md and process/*.md
```

---

## Phase 3: centralize agent common exclusions as SSoT (1 commit)

### Create

- `.claude/rules/audit-exceptions.md` (`paths: [".claude/agents/**"]`) — SSoT for common exclusions

```yaml
---
description: List of "looks like a rule violation but is a valid exception" across the codebase — SSoT so agents do not false-positive
paths:
  - ".claude/agents/**"
---
```

3-line SSoT:

- `global-error.tsx` hard-coded color — excluded as client-side fallback in `tailwind-patterns/theme-tokens.md`
- `select.tsx` `required` — excluded as a Radix constraint in `frontend/project-design-config.md`
- `revalidateTag` second argument — documented as Next.js 16 API in `server-actions/use-cache.md`

### Modify (7 agents — remove the section)

- `.claude/agents/accessibility-reviewer.md`
- `.claude/agents/better-auth-reviewer.md`
- `.claude/agents/db-migration-reviewer.md`
- `.claude/agents/react-compiler-reviewer.md`
- `.claude/agents/route-structure-reviewer.md`
- `.claude/agents/security-reviewer.md`
- `.claude/agents/zod-schema-reviewer.md`

Remove the three-line block from each agent and replace with "→ see `.claude/rules/audit-exceptions.md`".

---

## Phase 4: agent-memory cleanup (1 commit)

### Delete: six empty MEMORY.md files

- `.claude/agent-memory/design-memory/MEMORY.md` (5 lines)
- `.claude/agent-memory/route-structure-reviewer/MEMORY.md` (4)
- `.claude/agent-memory/react-compiler-reviewer/MEMORY.md` (4)
- `.claude/agent-memory/zod-schema-reviewer/MEMORY.md` (3)
- `.claude/agent-memory/performance-analyzer/MEMORY.md` (3)
- `.claude/agent-memory/better-auth-reviewer/MEMORY.md` (3)

### Modify: remove `memory: project` frontmatter from related agents

- `.claude/agents/design-memory.md`
- `.claude/agents/route-structure-reviewer.md`
- `.claude/agents/react-compiler-reviewer.md`
- `.claude/agents/zod-schema-reviewer.md`
- `.claude/agents/performance-analyzer.md`
- `.claude/agents/better-auth-reviewer.md`

Official spec: `memory` field is optional. Remove it from frontmatter to avoid forced injection of empty MEMORY.md.

### Delete: seven stale audit snapshots

- `.claude/agent-memory/project-reviewer/project_public-page-audit-2026-03-24.md` (53)
- `.claude/agent-memory/route-structure-reviewer/audit-2026-04-20.md` (38)
- `.claude/agent-memory/react-compiler-reviewer/project_audit-2026-04-21.md` (86)
- `.claude/agent-memory/zod-schema-reviewer/project_zod-audit-2026-04-21.md` (46)
- `.claude/agent-memory/better-auth-reviewer/project_dual-auth-audit-2026-04-21.md` (17)
- `.claude/agent-memory/performance-analyzer/build_2026-04-21.md` (85)
- `.claude/agent-memory/codebase-explorer/phase3-gcal-patterns.md` (100)

### Modify: compress `security-reviewer/MEMORY.md`

- 476 → under 200 lines (official auto-load limit)
- Move details into topic files (`payment-patterns.md` / `auth-patterns.md`, etc.)

---

## Phase 5: skills audit (1 commit)

### Audit targets (26 skills)

Usage investigation:

- Overlaps with bundled skills: `update-config` / `keybindings-help` / `simplify` / `fewer-permission-prompts` / `loop` / `schedule` / `claude-api` are bundled, so confirm no project skills share those names
- Unused candidates: `adr-create` / `prisma-migration` / `audit-*` (9) / `debug-*` (5)

Delete/merge depending on audit results. If zero findings, a no-op commit is still a valid completion (CLAUDE.md L289: "A clean implementation directive that fully passes pre-audit can complete with a no-op plan").

---

## Phase 2: deprecate `process/*.md` + slim CLAUDE.md (1 commit) — **last**

### Delete (4 files)

- `.claude/rules/process/git-migration.md` (44 lines)
- `.claude/rules/process/implementation-patterns.md` (129)
- `.claude/rules/process/research-audit.md` (56)
- `.claude/rules/process/subagent-discipline.md` (56)
- Delete the `.claude/rules/process/` directory as well

### Migration targets

| Source file                  | Migration target                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `subagent-discipline.md`     | Consolidate into `.claude/skills/subagent-dispatch-template/SKILL.md`                                                                           |
| `research-audit.md`          | `.claude/rules/research-audit.md` (`paths: [".claude/agents/**", ".claude/skills/audit-*/**", ".claude/skills/verify-subagent-report/**"]`)     |
| `implementation-patterns.md` | `.claude/rules/implementation-patterns.md` (`paths: ["src/shared/domain/**", "src/app/(admin)/**/_shared/actions/**", "prisma/schema.prisma"]`) |
| `git-migration.md`           | `.claude/rules/git-migration.md` (`paths: ["prisma/migrations/**", ".github/workflows/**"]`)                                                    |

### CLAUDE.md slimming (198 → ~120 lines)

Sections to remove:

- L33-46 "Tech stack table" → leave only a pointer to AGENTS.md `#tech-stack`
- L160-181 "SSoT singletons table" → fully delegate to `.claude/rules/ssot-singletons.md` (path-scoped autoload); CLAUDE.md becomes a one-line pointer: "Primary SSoTs are in `ssot-singletons.md`"
- L185-194 "Auto-load" section → leave only a reference to official docs `code.claude.com/docs/en/memory`
- L196-204 "Principles aligned to official APIs / best practices" → already consolidated into `.claude/rules/research-audit.md`, so remove from CLAUDE.md

Also remove the contradictory barrel spec note in CLAUDE.md L138 ("barrel index is TOC-only, no `paths:`, sub-files auto-load").

### Fix barrel references in CLAUDE.md / process/\*

Replace all barrel references in CLAUDE.md / process/\*.md skipped in Phase 1 (→ deleted in Phase 2) with sub-file paths.

---

> **Note (2026-04-28)**: Because the ADR feature was fully removed in a later commit, ADR 0028 created by this plan was deleted. The decision logic remains in this plan as the canonical record.

---

## Verification (after each phase)

```bash
bun run validate  # type-check + lint
git diff --stat HEAD~1  # confirm number of changed files
```

After the final phase:

```bash
# Confirm always-loaded rules = 0
grep -L "^paths:" $(find .claude/rules -type f -name "*.md") 2>/dev/null
# Expected: no output

# Confirm barrel files are absent
ls .claude/rules/{gotchas,react-patterns,server-actions,tailwind-patterns,zod-patterns}.md 2>&1 | grep "No such"

# Confirm process/ directory is absent
ls .claude/rules/process/ 2>&1 | grep "No such"
```

## Completion criteria

- [ ] 5 commits are on main (Phase 1 → 3 → 4 → 5 → 2 order)
- [ ] `bun run validate` exit 0
- [ ] Always-loaded rules = 0 files
- [ ] CLAUDE.md ≤ 130 lines
- [ ] `MEMORY.md` updated (record this plan with a completion marker)
