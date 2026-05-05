> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Skills `paths:` Field Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the official `paths:` field to SKILL.md frontmatter for 11 path-bound skills, preventing auto-activation outside target paths and saving description-budget context.

**Architecture:** Add the `paths:` field from the official Claude Code Skills spec ([skills docs](https://code.claude.com/docs/en/skills)) to 11 path-bound skills. With `paths:` configured, **auto-activation happens only when matching files are open** (user invocation `/skill` remains available). Match the YAML list format (unquoted glob) already used in `.claude/rules/**/*.md`. Exclude path-bound portions from the always-loaded description/when_to_use budget (1,536 chars × ~20 skills ≒ 30KB) to save context.

**Tech Stack:** YAML frontmatter (Claude Code Skills spec)

---

## Decision Matrix

### 11 skills that add `paths:` (path-bound)

| Bundle | Skill                     | `paths:` (YAML list)                                                                                                                                             |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `prisma-migration`        | `prisma/schema.prisma`                                                                                                                                           |
| A      | `seed-audit`              | `prisma/seed.ts`, `prisma/schema.prisma`                                                                                                                         |
| B      | `cache-audit`             | `src/**/actions.ts`, `src/**/mutations.ts`, `src/**/queries.ts`, `src/**/api/**/route.ts`                                                                        |
| B      | `split-action-file`       | `src/**/actions.ts`, `src/**/mutations.ts`, `src/**/queries.ts`                                                                                                  |
| B      | `use-server-audit`        | `src/**/actions.ts`, `src/**/mutations.ts`, `src/**/queries.ts`, `src/**/server-actions/**`                                                                      |
| C      | `lexical-audit`           | `src/**/lexical/**`                                                                                                                                              |
| C      | `lexical-node`            | `src/**/lexical/nodes/**`                                                                                                                                        |
| C      | `lexical-plugin`          | `src/**/lexical/plugins/*Plugin.tsx`                                                                                                                             |
| C      | `lexical-toolbar`         | `src/**/lexical/plugins/toolbar/**`                                                                                                                              |
| D      | `audit-settings-sections` | `src/app/(admin)/admin/(dashboard)/settings/_components/sections/**`                                                                                             |
| D      | `adr-drift-audit`         | `docs/architecture/decisions/**`, `bunfig.toml`, `playwright.config.ts`, `.gitignore`, `package.json`, `cloudbuild.yaml`, `lefthook.yml`, `.github/workflows/**` |

### 21 skills that do not add `paths:` (keep justification)

| Reason                                                                                             | Applicable skills                                                                                           |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `disable-model-invocation: true` (auto-activation already disabled; `paths:` is meaningless)       | `adr-create`, `create-section-type`, `worktree-bootstrap`                                                   |
| Intent-based invocation (adding new resources; natural language triggers like "add a Prisma enum") | `add-prisma-enum`, `add-settings-field`, `create-admin-page`, `create-page-content`, `create-server-action` |
| Error-state invocation (language triggers like "it doesn't run" / "deploy failed")                 | `cloud-run-debug`, `google-calendar-debug`, `instagram-debug`, `stripe-debug`, `turbopack-hmr`              |
| Cross-project audits (path-limited scans risk missing detections)                                  | `ssot-audit`, `integration-audit`, `memory-staleness-audit`                                                 |
| Frontend design / UX intent-based (not tied to specific paths)                                     | `frontend-design`, `parallax-section`, `ui-ux-pro-max`                                                      |
| Intent-based meta-skill (dependency updates / verify subagent, etc.)                               | `upgrade-deps`, `verify-subagent-report`                                                                    |

---

## File Structure

Targets for change (11 files, frontmatter only):

```
.claude/skills/
├── prisma-migration/SKILL.md          (Bundle A)
├── seed-audit/SKILL.md                (Bundle A)
├── cache-audit/SKILL.md               (Bundle B)
├── split-action-file/SKILL.md         (Bundle B)
├── use-server-audit/SKILL.md          (Bundle B)
├── lexical-audit/SKILL.md             (Bundle C)
├── lexical-node/SKILL.md              (Bundle C)
├── lexical-plugin/SKILL.md            (Bundle C)
├── lexical-toolbar/SKILL.md           (Bundle C)
├── audit-settings-sections/SKILL.md   (Bundle D)
└── adr-drift-audit/SKILL.md           (Bundle D)
```

Each SKILL.md adds a YAML list `paths:` field between `description:` and `argument-hint:` (or closing `---`). Do not change the body (steps).

---

## Tasks

### Task 1: Bundle A — Database/Migration skills

**Files:**

- Modify: `.claude/skills/prisma-migration/SKILL.md`
- Modify: `.claude/skills/seed-audit/SKILL.md`

- [ ] **Step 1: Add paths to prisma-migration/SKILL.md**

Insert between the `description:` block and `argument-hint:`. Final frontmatter:

```yaml
---
name: prisma-migration
description: >
  Generate and run a migration after Prisma schema changes.
  Review schema.prisma diffs, propose a migration name, run `migrate dev`, and regenerate the client.
  Use immediately after editing prisma/schema.prisma.
paths:
  - prisma/schema.prisma
argument-hint: "[migration-name]"
---
```

- [ ] **Step 2: Add paths to seed-audit/SKILL.md**

This file has no `argument-hint:`, so insert right under `description:` and before the closing `---`. Final frontmatter:

```yaml
---
name: seed-audit
description: Verify coverage of prisma/seed.ts. Detect whether all Prisma enum values are used in seeds, seed functions exist for all models, they are registered in seedAll / seedDemo, and upserts make it idempotent. Use after adding new models, enum values, or during periodic maintenance.
paths:
  - prisma/seed.ts
  - prisma/schema.prisma
---
```

- [ ] **Step 3: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/prisma-migration/SKILL.md .claude/skills/seed-audit/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: both files' frontmatter include `paths:` and the YAML list is correctly indented.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/prisma-migration/SKILL.md .claude/skills/seed-audit/SKILL.md
git commit -m "chore(skills): add paths frontmatter to database skills

Add official paths fields to prisma-migration / seed-audit.
Auto-activate only while editing matching files (prisma/schema.prisma / prisma/seed.ts),
reducing always-loaded description budget (1,536 char × auto-load) context usage.

C3b Bundle A. Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

### Task 2: Bundle B — Server Action skills

**Files:**

- Modify: `.claude/skills/cache-audit/SKILL.md`
- Modify: `.claude/skills/split-action-file/SKILL.md`
- Modify: `.claude/skills/use-server-audit/SKILL.md`

All three skills have partial path scope overlap (`actions.ts` / `mutations.ts` / `queries.ts`). This is expected: when editing Server Action files, multiple audit skills should surface descriptions together.

- [ ] **Step 1: Add paths to cache-audit/SKILL.md**

Insert directly below `description:` and before the closing `---`. Final frontmatter:

```yaml
---
name: cache-audit
description: Check the completeness of cache invalidation for Server Actions. Detect missing updateTag/revalidateTag, inconsistencies, and missing three-part sets. Use after editing Server Action files.
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/api/**/route.ts
---
```

- [ ] **Step 2: Add paths to split-action-file/SKILL.md**

Insert between the `description:` block and `argument-hint:`. Final frontmatter:

```yaml
---
name: split-action-file
description: >
  Split large Server Action files (500+ lines) into queries.ts + mutations.ts + index.ts (barrel).
  Route get* to queries.ts; create*/update*/delete*/publish*/toggle*/restore*/archive* to mutations.ts.
  Keep existing import paths transparent via the barrel index.ts.
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
argument-hint: <action-file-path>
---
```

- [ ] **Step 3: Add paths to use-server-audit/SKILL.md**

Insert directly below `description:` and before the closing `---`. Final frontmatter:

```yaml
---
name: use-server-audit
description: Scan `"use server"` files to ensure they comply with the Next.js 16 official export contract (only async functions may be exported). Detect types/interfaces/classes, non-async const exports, and default non-function exports to prevent Turbopack silent bugs (`ReferenceError: X is not defined`). Run after editing Server Action files or after large refactors.
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/server-actions/**
---
```

- [ ] **Step 4: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/cache-audit/SKILL.md .claude/skills/split-action-file/SKILL.md .claude/skills/use-server-audit/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: all three files' frontmatter include `paths:`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/cache-audit/SKILL.md .claude/skills/split-action-file/SKILL.md .claude/skills/use-server-audit/SKILL.md
git commit -m "chore(skills): add paths frontmatter to server action skills

Add official paths fields to cache-audit / split-action-file / use-server-audit.
Auto-activate only while editing actions.ts / mutations.ts / queries.ts / api route.ts.
The path overlap among the three skills is intentional (multiple audits surface while editing Server Actions).

C3b Bundle B. Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

### Task 3: Bundle C — Lexical skills

**Files:**

- Modify: `.claude/skills/lexical-audit/SKILL.md`
- Modify: `.claude/skills/lexical-node/SKILL.md`
- Modify: `.claude/skills/lexical-plugin/SKILL.md`
- Modify: `.claude/skills/lexical-toolbar/SKILL.md`

Actual lexical layout:

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/` (`*Plugin.tsx`)
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/` (`*Section.tsx`)
- `src/shared/lib/lexical/`

`src/**/lexical/**` can cover all of these. Separate lexical-plugin and lexical-toolbar by `*Plugin.tsx` vs `plugins/toolbar/**`.

- [ ] **Step 1: Add paths to lexical-audit/SKILL.md**

Final frontmatter:

```yaml
---
name: lexical-audit
description: Use when auditing or modernizing Lexical implementations in the admin UI. Check deprecated/private APIs, listener waterfalls, NodeState deviations, HTML import, and table API, and align to current official recommendations. Do not use when adding new node/plugin/toolbar.
paths:
  - src/**/lexical/**
---
```

- [ ] **Step 2: Add paths to lexical-node/SKILL.md**

Final frontmatter:

```yaml
---
name: lexical-node
description: Use when adding a new node type to admin Lexical. Cover NodeState API, JSON/DOM round-trip, and editor registration in one flow. If the main goal is auditing existing nodes or removing deprecated APIs, use lexical-audit.
paths:
  - src/**/lexical/nodes/**
---
```

- [ ] **Step 3: Add paths to lexical-plugin/SKILL.md**

Final frontmatter:

```yaml
---
name: lexical-plugin
description: Use when adding a new plugin to admin Lexical. Decide whether to implement via dialog, command, or listener and wire through editor integration. If the main goal is auditing existing implementations or removing deprecated APIs, use lexical-audit.
paths:
  - src/**/lexical/plugins/*Plugin.tsx
---
```

Note: Scoping to `*Plugin.tsx` only excludes `plugins/toolbar/` (`*Section.tsx`) and avoids path overlap with lexical-toolbar.

- [ ] **Step 4: Add paths to lexical-toolbar/SKILL.md**

Final frontmatter:

```yaml
---
name: lexical-toolbar
description: Use when adding new operations to the admin Lexical toolbar. Align button placement, command wiring, dialog integration, and active state together. If the main goal is auditing or modernizing the existing toolbar, use lexical-audit.
paths:
  - src/**/lexical/plugins/toolbar/**
---
```

- [ ] **Step 5: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/lexical-audit/SKILL.md .claude/skills/lexical-node/SKILL.md .claude/skills/lexical-plugin/SKILL.md .claude/skills/lexical-toolbar/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: all four files' frontmatter include `paths:`. lexical-audit is the broadest with `lexical/**`, lexical-node is `nodes/**`, lexical-plugin is `plugins/*Plugin.tsx`, and lexical-toolbar is `plugins/toolbar/**`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lexical-audit/SKILL.md .claude/skills/lexical-node/SKILL.md .claude/skills/lexical-plugin/SKILL.md .claude/skills/lexical-toolbar/SKILL.md
git commit -m "chore(skills): add paths frontmatter to lexical skills

Add official paths fields to lexical-audit / lexical-node / lexical-plugin / lexical-toolbar. lexical-audit covers all of src/**/lexical/**; node/plugin/toolbar use their actual placements (nodes/ / plugins/*Plugin.tsx / plugins/toolbar/) to avoid path overlap.

C3b Bundle C. Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

### Task 4: Bundle D — Settings + ADR skills

**Files:**

- Modify: `.claude/skills/audit-settings-sections/SKILL.md`
- Modify: `.claude/skills/adr-drift-audit/SKILL.md`

- [ ] **Step 1: Add paths to audit-settings-sections/SKILL.md**

Final frontmatter:

```yaml
---
name: audit-settings-sections
description: Audit the quality of admin settings sections (settings/_components/sections/). Check hint collapses, navigation links, form patterns, and SubmitButton placement in one pass. Use after adding new settings sections or during periodic maintenance.
paths:
  - src/app/(admin)/admin/(dashboard)/settings/_components/sections/**
---
```

- [ ] **Step 2: Add paths to adr-drift-audit/SKILL.md**

Final frontmatter:

```yaml
---
name: adr-drift-audit
description: Detect drift between ADR constraints (docs/architecture/decisions/) and config files (bunfig.toml / playwright.config.ts / .gitignore / package.json / .github/workflows/*.yml / cloudbuild.yaml / lefthook.yml). Use after new ADR adoption or during periodic maintenance. Check that configs do not become dead code by conflicting with ADR constraints.
paths:
  - docs/architecture/decisions/**
  - bunfig.toml
  - playwright.config.ts
  - .gitignore
  - package.json
  - cloudbuild.yaml
  - lefthook.yml
  - .github/workflows/**
---
```

- [ ] **Step 3: YAML frontmatter validation**

Run:

```bash
for f in .claude/skills/audit-settings-sections/SKILL.md .claude/skills/adr-drift-audit/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; if(c==2) exit; next} c==1{print}' "$f"
done
```

Expected: both files' frontmatter include `paths:`. adr-drift-audit covers all config files (top-level) and docs / .github/workflows.

- [ ] **Step 4: Final grep — confirm all 11 skills have paths**

Run:

```bash
grep -l "^paths:" .claude/skills/*/SKILL.md | sort
```

Expected:

```
.claude/skills/adr-drift-audit/SKILL.md
.claude/skills/audit-settings-sections/SKILL.md
.claude/skills/cache-audit/SKILL.md
.claude/skills/lexical-audit/SKILL.md
.claude/skills/lexical-node/SKILL.md
.claude/skills/lexical-plugin/SKILL.md
.claude/skills/lexical-toolbar/SKILL.md
.claude/skills/prisma-migration/SKILL.md
.claude/skills/seed-audit/SKILL.md
.claude/skills/split-action-file/SKILL.md
.claude/skills/use-server-audit/SKILL.md
```

11 entries, fully matching the Decision Matrix.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/audit-settings-sections/SKILL.md .claude/skills/adr-drift-audit/SKILL.md
git commit -m "chore(skills): add paths frontmatter to settings and adr skills

Add official paths fields to audit-settings-sections / adr-drift-audit.
audit-settings-sections targets admin settings sections,
adr-drift-audit covers ADR docs + config files (bunfig.toml /
playwright.config.ts / .gitignore / package.json / cloudbuild.yaml /
lefthook.yml / .github/workflows/**).

C3b complete (all 11 path-bound skills).
Refs: docs/superpowers/plans/2026-04-27-skills-paths-enhancement.md"
```

---

## After completion

Completion report and next-session handoff:

1. Confirm all 4 commits are on main with `git log --oneline -5`
2. Update `⬜ C3b` to `✅ C3b complete (commits SHA1〜SHA4)` in `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md`, and add a result summary
3. Note in memory that the remaining plan **C4 (`docs/**` cleanup)\*\* is untouched
