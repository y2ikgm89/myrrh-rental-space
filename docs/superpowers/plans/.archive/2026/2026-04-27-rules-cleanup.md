> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# `.claude/rules/**` Clean-Break Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean-break refactor 49 files / 14,520 lines under `.claude/rules/**` to align with official best practices + project conventions (deprecated note consolidation / frontmatter consistency / ADR drift audit / barrel-index splits for large files).

**Architecture:** 7 phases / 7 commits. Phases are independent and can be rolled back per-commit. Barrel-index splits follow the existing patterns in `react-patterns.md` / `gsap-patterns.md` / `lexical-patterns.md` (barrel + sub-file structure).

**Tech Stack:** Markdown + YAML frontmatter (Claude Code autoload via `paths:` glob) + per-commit rollback / no syntax validation via `bun run validate` (rule docs are not executed).

**Key project compliance rules**:

- CLAUDE.md §Investigation/Audit: "must pre-grep before assuming rule docs structure"
- ADR 0015-equivalent clean break principle (no legacy re-exports / `@deprecated` marks / `// removed:` comments)
- One plan / one session discipline (handoff `project_clean-break-refactor-handoff.md`)

---

## Pre-Audit (reference only, no execution)

Ground truth confirmed by pre-grep:

| Metric                | Value                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Total files           | 49 (`find .claude/rules -type f -name "*.md" \| wc -l`)                                                                |
| Total lines           | 14,520 (`xargs wc -l`)                                                                                                 |
| `paths:` frontmatter  | 49 / 49 (100%)                                                                                                         |
| Deprecated markers    | 14 files / 36 occurrences                                                                                              |
| Existing barrel-index | 4 (`react-patterns.md` / `gsap-patterns.md` / `frontend/lexical-patterns.md` / `frontend/admin-ui-patterns.md` hybrid) |
| Files over 500 lines  | 11 (max `server-actions.md` / `frontend/accessibility.md` at 752 lines)                                                |

**Files over 500 lines** (barrel-index split candidates):

| Rank | File                         | Lines | Bytes | Major sections | Split priority                            |
| ---- | ---------------------------- | ----- | ----- | -------------- | ----------------------------------------- |
| 1    | `server-actions.md`          | 752   | 35KB  | 10             | **A: required**                           |
| 2    | `frontend/accessibility.md`  | 752   | 26KB  | 15             | **A: required**                           |
| 3    | `zod-patterns.md`            | 746   | 27KB  | 11             | B: recommended                            |
| 4    | `prisma-patterns.md`         | 725   | 39KB  | 14             | B: recommended                            |
| 5    | `auth-patterns.md`           | 715   | 33KB  | 11             | B: recommended                            |
| 6    | `tailwind-patterns.md`       | 569   | 22KB  | 11             | C: optional                               |
| 7    | `frontend/admin-ui/forms.md` | 528   | 22KB  | -              | C: optional                               |
| 8    | `gotchas.md`                 | 519   | 156KB | **27**         | **A: required** (cross-cutting catch-all) |
| 9    | `test-quality.md`            | 510   | 18KB  | 10             | C: optional                               |
| 10   | `frontend/seo-patterns.md`   | 508   | 24KB  | 10             | C: optional                               |
| 11   | `error-handling.md`          | 504   | 19KB  | 7              | C: optional                               |

**Barrel split scope for this plan**: the 3 Priority A files (`server-actions.md` / `frontend/accessibility.md` / `gotchas.md`). Priority B/C is deferred to later sessions (one plan / one session discipline).

**14 files containing deprecated markers**:

```
.claude/rules/auth-patterns.md (3)
.claude/rules/api-routes.md (2)
.claude/rules/gotchas.md (19)
.claude/rules/server-actions.md (1)
.claude/rules/implementation-quality.md (2)
.claude/rules/prisma-patterns.md (1)
.claude/rules/zod-patterns.md (1)
.claude/rules/tailwind-patterns.md (1)
.claude/rules/frontend/admin-inline-editor-patterns.md (1)
.claude/rules/type-safety.md (1)
.claude/rules/frontend/admin-ui/forms.md (1)
.claude/rules/frontend/ui-ux-patterns.md (1)
.claude/rules/frontend/gsap/core.md (1)
.claude/rules/frontend/lexical/conventions.md (1)
```

---

## File Structure

### New files (generated by barrel-index split in Phases 5-7)

```
.claude/rules/
├── server-actions.md                          ← replaced by barrel index (752 → ~25 lines)
├── server-actions/                            ← new sub-dir
│   ├── export-contract.md                     ← `"use server"` export contract + Reader function = Route Handler
│   ├── use-cache.md                           ← 'use cache' patterns + cache invalidation
│   ├── implementation.md                      ← Server Action implementation patterns + public data fetch + safeFetch
│   └── prohibitions.md                        ← cache tag naming + prohibitions + file placement + gotchas
├── frontend/
│   ├── accessibility.md                       ← replaced by barrel index (752 → ~25 lines)
│   ├── accessibility/                         ← new sub-dir
│   │   ├── semantics.md                       ← semantic HTML + aria-* attributes
│   │   ├── focus-keyboard.md                  ← focus management + keyboard navigation
│   │   ├── touch-text.md                      ← 44px touch targets + min font size + uppercase tracking
│   │   ├── motion.md                          ← prefers-reduced-motion
│   │   ├── images-text.md                     ← image alt + 3-layer text-on-image guarantee
│   │   └── forms-prohibitions.md              ← form a11y + prohibitions + file placement + references
└── gotchas.md                                 ← replaced by barrel index (519 → ~30 lines)
└── gotchas/                                   ← new sub-dir
    ├── auth-routing.md                        ← Admin Gate + Multiple Root Layouts + navigation + Better Auth client
    ├── domain.md                              ← pricing format + domain/reservation + homepage section management
    ├── ui.md                                  ← public form UI unification + responsive standards + Page-First Architecture + blog sidebar
    ├── prisma.md                              ← Prisma / adapter-pg + Prisma Migrate
    ├── deployment.md                          ← deploy + build/verify + file ops/Git + Worktree + Tailwind v4/Turbopack HMR
    ├── claude-code.md                         ← Claude Code settings + shadcn/ui components + import alias + Route Handler
    └── prohibitions.md                        ← framework-specific + security + external API integration + rate limiter
```

### Modifications (Phases 1-4 / Phase 8)

```
.claude/rules/<14 files>                       ← Phase 1: consolidate deprecated notes (→ "Prohibitions" or "Removed pattern references" section)
.claude/rules/**/*.md                          ← Phase 2: paths frontmatter consistency check (fix only if drift is detected)
                                               ← Phase 3: ADR drift audit (fix only if drift is detected)
CLAUDE.md                                      ← Phase 8: reflect barrel split (update references)
```

---

## Phase 1: Deprecated note consolidation

**Files:**

- Modify: the 14 files above (single commit; do not split into multiple PRs)

**Purpose:** Consolidate scattered mentions of "deprecated", "removed", "do not reintroduce", "@deprecated", "removed:", "legacy", "old pattern" into a file-end "Prohibitions" or "Removed pattern references" section. Per clean break principles, delete simple old-name lists that do not state what to use instead (`X is removed` only). Keep guidance that points to replacements (`X is deprecated — use Y instead`).

- [ ] **Step 1: Confirm Phase 1 commit base SHA**

```bash
git log --oneline -1
```

Expected: `b4b96773 docs(claude): codify MEMORY.md re-read rule before large plan creation` (or a later commit)

- [ ] **Step 2: Judge each deprecated marker across 14 files**

For each occurrence, follow this flow:

```
1. Read the occurrence sentence
2. Decide:
   (a) Simple declaration of old name X only (`X is removed`) → delete (clean break)
   (b) Old name X + guidance to new name Y (`X is deprecated; use Y`) → keep
   (c) Active guard like "do not reintroduce" → move to "Prohibitions" section
3. Preserve section structure after edits (`##` / `###` hierarchy)
```

Reference example (decision at `gotchas.md:61`):

```
- `CACHE_TAGS.SETTINGS` is deprecated — use granular tags directly (LAYOUT_SETTINGS, ...) ← (b) → keep
```

Reference example (decision at `gotchas.md:167`):

```
- `@layer compat` and old color tokens are removed — old tokens like `--color-primary` do not exist. All components must directly use semantic tokens from `@theme` ← (a) simple old-name declaration, but the explanation adds context → keep (boundary rule: keep if it names the new pattern to use)
```

- [ ] **Step 3: Apply fixes**

Use Edit per file to fix each occurrence. For files with multiple occurrences (`gotchas.md` 19 / `auth-patterns.md` 3 / `api-routes.md` 2 / `implementation-quality.md` 2), split into multiple Edit calls per file.

- [ ] **Step 4: Re-run audit grep**

```bash
grep -rn "@deprecated\|deprecated:\|deprecated\|removed\|do not reintroduce\|❌ past\|removed:\|legacy\|old pattern" .claude/rules/ | wc -l
```

Expected: reduced count (at least the (a) deletions are gone). The goal is not zero, but to keep only (b)/(c).

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/
git commit -m "$(cat <<'EOF'
refactor(rules): consolidate deprecated notes per clean-break principle

Following the ADR 0015 clean-break principle, consolidate deprecated markers
in `.claude/rules/**` (14 files / 36 occurrences):

- (a) Old-name declaration only → delete (clean break)
- (b) Old name → new name guidance → keep (migration guidance value)
- (c) "Do not reintroduce" guard → move to "Prohibitions" section

Disallow `@deprecated` / `// removed:` annotations (keep CLAUDE.md rule).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Frontmatter `paths:` consistency check

**Files:**

- Read-only audit: all 49 files
- Modify (only if drift detected): affected files

**Purpose:** Verify that `paths:` globs match the current repository structure. Reconfirm that paths with `()` (e.g. `src/app/(admin)/...`) work in MINGW64 (already confirmed in handoff).

- [ ] **Step 1: Extract all paths**

```bash
for f in $(find .claude/rules -type f -name "*.md"); do
  echo "=== $f ==="
  awk '/^paths:/,/^[a-z]+:|^---$/' "$f" | grep "^  -"
done
```

- [ ] **Step 2: Check each path glob matches real files**

Sample 5 paths and run `Glob` to confirm match count > 0. If 0, treat as drift (target dir removed by refactor) and list the rule for update or delete.

Example:

```
.claude/rules/frontend/gsap-patterns.md paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/components/effects/**"
→ OK if Glob returns 5+ matches
```

- [ ] **Step 3: Fix only if drift detected**

If no drift, no-op and proceed to the next phase.

- [ ] **Step 4: Commit (only if drift detected)**

```bash
git add .claude/rules/
git commit -m "$(cat <<'EOF'
refactor(rules): align paths frontmatter with current repo structure

Phase 2 of rules clean-break refactor.
<List of detected drift>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no drift, no commit; move to Phase 3.

---

## Phase 3: ADR Drift Audit

**Files:**

- Read-only: `docs/architecture/decisions/*.md` (22) + `.claude/rules/**/*.md` (49)
- Modify (only if drift detected): affected rule files / ADR

**Purpose:** Verify that constraints adopted in ADRs do not drift from rule docs. Run the `adr-drift-audit` skill to detect dead rules or ADRs missing supersedes.

- [ ] **Step 1: Run the skill**

```
/adr-drift-audit
```

Or manually:

1. List all 22 ADRs with `ls docs/architecture/decisions/`
2. Read the Decision section of each ADR
3. Reverse-lookup relevant rule docs (`.claude/rules/**`) via grep
4. Detect drift: patterns banned by ADRs still appear as "usage examples" in rule docs, or stricter rules exist only in rule docs without ADR adoption

- [ ] **Step 2: Create drift table**

```markdown
| ADR      | rule file             | drift detail                                 | fix plan |
| -------- | --------------------- | -------------------------------------------- | -------- |
| ADR 0015 | gotchas.md:XXX        | old X re-export example remains              | delete   |
| ADR 0019 | server-actions.md:XXX | execute-admin-mutation-result order is stale | update   |
```

- [ ] **Step 3: Apply fixes**

If no drift, no-op and proceed to the next phase.

- [ ] **Step 4: Commit (only if drift detected)**

```bash
git add .claude/rules/ docs/architecture/decisions/
git commit -m "$(cat <<'EOF'
refactor(rules): resolve ADR drift in rule docs

Phase 3 of rules clean-break refactor.
<Detected drift details and fixes>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Validation checkpoint (after Phases 1-3)

**Files:** verification only

- [ ] **Step 1: Verify rule autoload after edits**

`bun run validate` does not execute rule docs, so there is no syntax validation. Run the following instead:

```bash
# Check frontmatter parse errors for all files (via Python YAML)
python3 -c "
import yaml, sys, glob
for path in glob.glob('.claude/rules/**/*.md', recursive=True):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    if not content.startswith('---'):
        continue
    try:
        end = content.index('---', 3)
        yaml.safe_load(content[3:end])
    except Exception as e:
        print(f'PARSE_ERROR: {path}: {e}')
print('OK')
"
```

Expected: `OK` (no PARSE_ERROR output)

- [ ] **Step 2: Check line/byte deltas**

```bash
echo "State after Phases 1-3:"
find .claude/rules -type f -name "*.md" | xargs wc -l | tail -1
find .claude/rules -type f -name "*.md" | wc -l
```

Confirm line counts decreased in Phase 1 (due to deletion of (a) deprecated markers).

---

## Phase 5: Barrel Split — `server-actions.md` → `server-actions/` sub-dir

**Files:**

- Modify: `.claude/rules/server-actions.md` (replace 752 → ~25 lines via barrel)
- Create: `.claude/rules/server-actions/export-contract.md`
- Create: `.claude/rules/server-actions/use-cache.md`
- Create: `.claude/rules/server-actions/implementation.md`
- Create: `.claude/rules/server-actions/prohibitions.md`

**Split mapping** (`## section` in `.claude/rules/server-actions.md` → destination):

| section (lines)                              | destination          |
| -------------------------------------------- | -------------------- |
| `"use server"` file export contract (11)     | `export-contract.md` |
| Reader function canonical Route Handler (50) | `export-contract.md` |
| 'use cache' pattern (131)                    | `use-cache.md`       |
| cache invalidation pattern (241)             | `use-cache.md`       |
| Server Action implementation patterns (342)  | `implementation.md`  |
| public data fetch patterns (518)             | `implementation.md`  |
| cache tag naming rules (572)                 | `prohibitions.md`    |
| prohibitions (618)                           | `prohibitions.md`    |
| file placement (734)                         | `prohibitions.md`    |
| Gotchas (747)                                | `prohibitions.md`    |

- [ ] **Step 1: Re-read existing barrel-index patterns (reference)**

```
Read: .claude/rules/react-patterns.md            ← 15 lines / 4 sub-file references
Read: .claude/rules/frontend/gsap-patterns.md    ← 20 lines / 4 sub-file references
Read: .claude/rules/frontend/lexical-patterns.md ← 18 lines / 5 sub-file references
```

- [ ] **Step 2: Create 4 new sub-files**

Each sub-file contains frontmatter (`description:` + `paths:` if needed) and a direct copy of the moved section.

`server-actions/export-contract.md` example:

```markdown
---
description: Server Action file export contract — only async functions can be exported; Reader function is canonical Route Handler
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
  - "src/app/(admin)/admin/api/**"
---

# Server Action — Export contract / Reader function

(move server-actions.md L11-130)
```

`server-actions/use-cache.md` example:

```markdown
---
description: Server Action 'use cache' pattern + cache invalidation (updateTag / revalidateTag)
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
  - "src/shared/lib/cache/**"
  - "src/shared/lib/constants/**"
---

# Server Action — 'use cache' / cache invalidation

(move server-actions.md L131-341)
```

`server-actions/implementation.md` example:

```markdown
---
description: Server Action implementation patterns (executeAdminMutationResult / safeFetch / toPlainObject) + public data fetch
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
---

# Server Action — implementation patterns / public data fetch

(move server-actions.md L342-571)
```

`server-actions/prohibitions.md` example:

```markdown
---
description: Server Action cache tag naming rules / prohibitions / file placement / gotchas
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
---

# Server Action — naming rules / prohibitions / placement / gotchas

(move server-actions.md L572-end)
```

- [ ] **Step 3: Replace server-actions.md with a barrel index**

```markdown
---
description: Server Action patterns (Next.js 16 / "use server" contract / 'use cache' / cache invalidation) — see sub-files for details
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
  - "src/app/(admin)/admin/api/**"
---

# Server Action patterns (barrel index)

This file is a barrel index. Each topic is managed in the sub-files below:

- [server-actions/export-contract.md](./server-actions/export-contract.md) — `"use server"` export contract / Reader function is the canonical Route Handler
- [server-actions/use-cache.md](./server-actions/use-cache.md) — 'use cache' pattern / cache invalidation (updateTag / revalidateTag / CACHE_TAGS)
- [server-actions/implementation.md](./server-actions/implementation.md) — `executeAdminMutationResult` / public data fetch (safeFetch + toPlainObject)
- [server-actions/prohibitions.md](./server-actions/prohibitions.md) — cache tag naming rules / prohibitions / file placement / Gotchas
```

- [ ] **Step 4: Verify line counts + content hash after move**

```bash
# Original file line count (before) ≈ sum of 4 sub-files after move (only barrel header overhead)
wc -l .claude/rules/server-actions/*.md
# Expected: original 752 + frontmatter overhead 4*5 ≈ 772 lines
```

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/server-actions.md .claude/rules/server-actions/
git commit -m "$(cat <<'EOF'
refactor(rules): split server-actions.md into barrel-index + 4 sub-files

Split server-actions.md (752 lines) using the barrel-index pattern (precedent: react-patterns.md /
gsap-patterns.md / lexical-patterns.md) into:

- server-actions/export-contract.md — "use server" contract / Reader = Route Handler
- server-actions/use-cache.md — 'use cache' / cache invalidation
- server-actions/implementation.md — implementation patterns / public data fetch
- server-actions/prohibitions.md — naming rules / prohibitions / placement / Gotchas

Barrel index shortened to ~25 lines. Each sub-file has its own paths frontmatter
to declare autoload scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Barrel Split — `frontend/accessibility.md` → `frontend/accessibility/` sub-dir

**Files:**

- Modify: `.claude/rules/frontend/accessibility.md` (752 → ~30 lines, replaced with barrel)
- Create: `.claude/rules/frontend/accessibility/semantics.md`
- Create: `.claude/rules/frontend/accessibility/focus-keyboard.md`
- Create: `.claude/rules/frontend/accessibility/touch-text.md`
- Create: `.claude/rules/frontend/accessibility/motion.md`
- Create: `.claude/rules/frontend/accessibility/images-text.md`
- Create: `.claude/rules/frontend/accessibility/forms-prohibitions.md`

**Split mapping**:

| section (lines)                                       | destination              |
| ----------------------------------------------------- | ------------------------ |
| Overview (11)                                         | merge into barrel header |
| Semantic HTML (24)                                    | `semantics.md`           |
| aria-\* attributes (180)                              | `semantics.md`           |
| Focus management (253)                                | `focus-keyboard.md`      |
| Keyboard navigation (677)                             | `focus-keyboard.md`      |
| Touch targets (307)                                   | `touch-text.md`          |
| Minimum font size (386)                               | `touch-text.md`          |
| Uppercase label tracking standard (410)               | `touch-text.md`          |
| prefers-reduced-motion (436)                          | `motion.md`              |
| Image alt text (596)                                  | `images-text.md`         |
| Three-layer text-on-image readability guarantee (618) | `images-text.md`         |
| Form accessibility (535)                              | `forms-prohibitions.md`  |
| Prohibitions (713)                                    | `forms-prohibitions.md`  |
| File placement (737)                                  | `forms-prohibitions.md`  |
| References (748)                                      | `forms-prohibitions.md`  |

- [ ] **Step 1: Create 6 sub-files**

Each sub-file includes frontmatter (`description:` + `paths:`) plus a copy of the moved section.

`frontend/accessibility/semantics.md` example:

```markdown
---
description: Accessibility — semantic HTML / aria-* attributes
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
---

# Accessibility — semantic HTML / aria-\*

(move frontend/accessibility.md L24-252)
```

Create the other 5 sub-files in the same way. Inherit the original file's `paths:` as-is.

- [ ] **Step 2: Replace with a barrel index**

```markdown
---
description: Accessibility — WCAG 2.1 AA / 2.5.5 Enhanced AAA compliant (see sub-files for details)
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
---

# Accessibility (barrel index)

WCAG 2.1 AA + 2.5.5 Enhanced (AAA) compliant. Each topic is managed in the sub-files below:

- [accessibility/semantics.md](./accessibility/semantics.md) — semantic HTML / aria-\* attributes
- [accessibility/focus-keyboard.md](./accessibility/focus-keyboard.md) — focus management / keyboard navigation
- [accessibility/touch-text.md](./accessibility/touch-text.md) — 44px touch targets / minimum font size / uppercase tracking
- [accessibility/motion.md](./accessibility/motion.md) — prefers-reduced-motion
- [accessibility/images-text.md](./accessibility/images-text.md) — image alt / three-layer text-on-image readability guarantee
- [accessibility/forms-prohibitions.md](./accessibility/forms-prohibitions.md) — form a11y / prohibitions / references
```

- [ ] **Step 3: Post-move verification + Commit**

```bash
wc -l .claude/rules/frontend/accessibility/*.md
# Expected: original 752 + frontmatter overhead 6*5 ≈ 782 lines

git add .claude/rules/frontend/accessibility.md .claude/rules/frontend/accessibility/
git commit -m "$(cat <<'EOF'
refactor(rules): split frontend/accessibility.md into barrel-index + 6 sub-files

Split frontend/accessibility.md (752 lines / 15 sections) with the barrel-index pattern:

- accessibility/semantics.md — semantic HTML / aria-*
- accessibility/focus-keyboard.md — focus / keyboard navigation
- accessibility/touch-text.md — 44px touch / font size / tracking
- accessibility/motion.md — prefers-reduced-motion
- accessibility/images-text.md — image alt / three-layer text-on-image guarantee
- accessibility/forms-prohibitions.md — forms / prohibitions / references

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Barrel Split — `gotchas.md` → `gotchas/` sub-dir

**Files:**

- Modify: `.claude/rules/gotchas.md` (519 → ~30 lines, replaced with barrel)
- Create: `.claude/rules/gotchas/auth-routing.md`
- Create: `.claude/rules/gotchas/domain.md`
- Create: `.claude/rules/gotchas/ui.md`
- Create: `.claude/rules/gotchas/prisma.md`
- Create: `.claude/rules/gotchas/deployment.md`
- Create: `.claude/rules/gotchas/claude-code.md`
- Create: `.claude/rules/gotchas/prohibitions.md`

**Split mapping** (27 sections → 7 sub-files):

| section group                                                                                          | destination       |
| ------------------------------------------------------------------------------------------------------ | ----------------- |
| Admin Gate / Multiple Root Layouts / navigation / Better Auth client                                   | `auth-routing.md` |
| Pricing format / domain & reservations / homepage section management                                   | `domain.md`       |
| Public form UI unification / public page responsive standards / Page-First Architecture / blog sidebar | `ui.md`           |
| Prisma / adapter-pg / Prisma Migrate                                                                   | `prisma.md`       |
| Deploy / build & verification / file ops & Git / Worktree / Tailwind v4 / Turbopack HMR                | `deployment.md`   |
| Claude Code settings / shadcn/ui components / import alias / Route Handler (PPR env)                   | `claude-code.md`  |
| Framework-specific / security / external API integration / rate limiter                                | `prohibitions.md` |

- [ ] **Step 1: Create 7 sub-files**

Inherit the original `paths:` (`src/**` + `prisma/**`, the full gotchas.md paths). Keep each sub-file `description:` concise.

Example `gotchas/deployment.md`:

```markdown
---
description: Gotchas — deploy / build verification / Git Worktree / Tailwind v4 + Turbopack HMR
paths:
  - "src/**"
  - "prisma/**"
  - "Dockerfile"
  - "cloudbuild.yaml"
---

# Gotchas — deploy / build / Git / Worktree / Tailwind+Turbopack

(move the relevant sections from gotchas.md)
```

- [ ] **Step 2: Replace with a barrel index**

```markdown
---
description: Gotchas — project-specific pitfalls and fixes (barrel index)
paths:
  - "src/**"
  - "prisma/**"
---

# Gotchas (barrel index)

Project-specific pitfalls and fixes. Each topic is managed in the sub-files below:

- [gotchas/auth-routing.md](./gotchas/auth-routing.md) — Admin Gate / Multiple Root Layouts / navigation / Better Auth client
- [gotchas/domain.md](./gotchas/domain.md) — pricing format / domain & reservations / homepage section management
- [gotchas/ui.md](./gotchas/ui.md) — public form UI / responsive standards / Page-First / blog sidebar
- [gotchas/prisma.md](./gotchas/prisma.md) — Prisma + adapter-pg / Prisma Migrate
- [gotchas/deployment.md](./gotchas/deployment.md) — deploy / build / Git / Worktree / Tailwind+Turbopack HMR
- [gotchas/claude-code.md](./gotchas/claude-code.md) — Claude Code settings / shadcn/ui / import alias / Route Handler
- [gotchas/prohibitions.md](./gotchas/prohibitions.md) — framework-specific / security / external API / rate limiter
```

- [ ] **Step 3: Post-move verification + Commit**

```bash
wc -l .claude/rules/gotchas/*.md
# Expected: original 519 + frontmatter overhead 7*7 ≈ 568 lines

git add .claude/rules/gotchas.md .claude/rules/gotchas/
git commit -m "$(cat <<'EOF'
refactor(rules): split gotchas.md into barrel-index + 7 sub-files

Split gotchas.md (519 lines / 27 sections / 156KB cross-cutting catch-all)
using the barrel-index pattern:

- gotchas/auth-routing.md — Admin Gate / Multiple Root Layouts / navigation
- gotchas/domain.md — pricing / domain reservations / homepage sections
- gotchas/ui.md — public forms / responsive / Page-First / sidebar
- gotchas/prisma.md — Prisma adapter-pg / Migrate
- gotchas/deployment.md — deploy / build / Git Worktree / Tailwind HMR
- gotchas/claude-code.md — Claude Code settings / shadcn / import alias
- gotchas/prohibitions.md — framework-specific / security / external API / RL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: CLAUDE.md / docs reference updates

**Files:**

- Modify: `CLAUDE.md` (reflect references after barrel split)
- Read-only: `docs/**/*.md` (drift detection only)

**Purpose:** Because the three main rule files become barrels in Phases 5-7, confirm that references in CLAUDE.md / `docs/**` have not drifted.

- [ ] **Step 1: Grep references in CLAUDE.md**

```bash
grep -n "server-actions.md\|frontend/accessibility.md\|gotchas.md" CLAUDE.md
```

CLAUDE.md references are in the `→ <rule>.md` format, so barrel pointers still work (autoload chains load sub-files). **Only change if drift is detected.**

- [ ] **Step 2: Grep references in docs/**

```bash
grep -rn "server-actions.md\|frontend/accessibility.md\|gotchas.md" docs/ --include="*.md"
```

Check whether references like `→ .claude/rules/<file>.md` in ADRs or guides should point to the barrel or a sub-file. Barrel pointers are OK, but if a specific section is referenced, update to the sub-file path.

- [ ] **Step 3: Apply fixes (only if drift detected)**

```bash
# Example:
grep -rln "\.claude/rules/server-actions\.md#cache" CLAUDE.md docs/
# → If it hits, update to .claude/rules/server-actions/use-cache.md
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "$(cat <<'EOF'
docs(claude): update rule references for barrel-index splits

Updated references in CLAUDE.md / docs/** after splitting server-actions.md /
frontend/accessibility.md / gotchas.md into barrel + sub-file structures in Phases 5-7.

Barrel pointers (`→ <rule>.md`) still load sub-files via autoload chains, so no changes
needed. Only references pointing at section anchors (`#xxx`) were updated to sub-file
paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: Completion report

- [ ] **Step 1: Confirm commits for all phases**

```bash
git log --oneline -10
```

Expected output (order follows phase numbers):

```
<sha9>  docs(claude): update rule references for barrel-index splits         ← Phase 8
<sha8>  refactor(rules): split gotchas.md into barrel-index + 7 sub-files     ← Phase 7
<sha7>  refactor(rules): split frontend/accessibility.md into barrel-index... ← Phase 6
<sha6>  refactor(rules): split server-actions.md into barrel-index...         ← Phase 5
<sha5>  refactor(rules): resolve ADR drift in rule docs                       ← Phase 3 (only if drift found)
<sha4>  refactor(rules): align paths frontmatter with current repo structure  ← Phase 2 (only if drift found)
<sha3>  refactor(rules): consolidate deprecated notes per clean-break...      ← Phase 1
b4b96773 docs(claude): codify MEMORY.md re-read rule before large plan creation ← base
```

- [ ] **Step 2: Check line/file count deltas**

```bash
echo "=== After Phase 1-7 ==="
find .claude/rules -type f -name "*.md" | wc -l    # 49 → 49 + 17 sub-files = 66 (expected)
find .claude/rules -type f -name "*.md" | xargs wc -l | tail -1
```

- [ ] **Step 3: Update memory**

Append "✅ C1 completed (commit `<latest sha>`)" to `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md`.

- [ ] **Step 4: Report completion summary to the user**

```
C1 completed (commit <sha>):
- 7 commits / N lines cleaned up
- 3 barrel splits (server-actions / accessibility / gotchas)
- 17 new sub-files added
- deprecated marker cleanup (X → Y)

Recommended next session: C2 (.claude/agents/** cleanup) or P19 Phase 1
```

---

## Self-Review Checklist

This section captures the self-review before plan submission.

**1. Spec coverage:**

| Spec item (from handoff)                           | Covered task                     |
| -------------------------------------------------- | -------------------------------- |
| 30+ file audit                                     | Phase 1-3 (all 49 files scanned) |
| deprecated pattern removal / cleanup               | Phase 1 (14 files)               |
| frontmatter `paths:` consistency                   | Phase 2                          |
| expand barrel-index structure to other large rules | Phase 5-7 (3 splits)             |
| `adr-drift-audit` skill usage                      | Phase 3                          |

**Gap:** Priority B/C barrel splits (zod / prisma / auth / tailwind / forms / test-quality / seo / error-handling) are out of scope for this plan. Add a new plan later if needed.

**2. Placeholder scan:** No TBD / TODO / "fill in details" ✓

**3. Type consistency:** File paths / section names confirmed via ground truth grep ✓

**4. Realism check:**

- Phase 1: 14 files × average 2.5 occurrences = ~36 edits, ~30-45 minutes
- Phase 2-3: no-op if no drift, ~15 minutes
- Phase 5-7: 3 splits × ~25 minutes = ~75 minutes
- Phase 8-9: ~10 minutes
- **Estimated total**: 2-3 hours (subagent-driven without parallelization, sequential execution)

**5. Worktree decision:**

- This plan edits only `.claude/rules/**` (does not touch src/)
- Incremental commits on main make rollback easy
- No worktree needed; OK to run on main

---

## How to run

After saving this file, run the following in the controller (main session):

**Recommended: subagent-driven-development**

```
Run docs/superpowers/plans/2026-04-27-rules-cleanup.md with subagent-driven-development.
Execute each phase in one dispatch, and verify git log + wc -l between phases.
After all phases complete, append ✅ C1 completed to memory.
```

**Alternative: executing-plans (inline)**

```
Run docs/superpowers/plans/2026-04-27-rules-cleanup.md with the executing-plans skill
inline. After Phase 1 → 4, confirm with the user, then run Phase 5-9.
```
