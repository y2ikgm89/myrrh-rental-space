# Clean-Break Refactor C5 Implementation Plan

> **Snapshot: 2026-04-29**
> **Completed: 2026-04-29** — All 4 phases (C5a/C5b/C5c/C5d) integrated into main via commits `8b9e9188` (C5a Phase 3) / `87f0c2b0` (ADR 0025 subagent-dispatch-template) / `2ad4a9a0` (zod-patterns barrel-index) / `50dfd85c` (tailwind-patterns barrel-index) / `64dcc622` (policy-docs-sync cleanup) and follow-up ADR 0026 / config-optimization.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor skills / rules / subagents / docs into official best-practice L3+L4 (aggressive deletions + hierarchy rethink) via a clean-break refactor.

**Architecture:** Sequential dispatch across 4 phases (C5b → C5c → C5a → C5d). Each phase = one implementer dispatch finishing multiple commits, which the controller splits by phase. The reviewer uses a combined dispatch after each phase (spec compliance + code quality in one prompt).

**Tech Stack:** Markdown frontmatter (YAML), `.claude/{rules,skills,agents}/`, `docs/architecture/decisions/`, `docs/superpowers/{specs,plans}/`, `scripts/verify-policy-docs.mjs`, `bun run validate`.

**Spec:** `docs/superpowers/specs/2026-04-27-clean-break-c5-design.md` — referenced during implementation as ground truth.

**ADR numbers:** 0025 (subagent dispatch template SSoT) + 0026 (skill naming convention). At the start of each phase, re-check with `ls docs/architecture/decisions/00*.md | tail -1`.

---

## Shared phase dispatch discipline

Include the following in each phase's implementer dispatch prompt:

```
🚫 Git completely prohibited (add / commit / push / reset / checkout / restore / stash all NG)
Editing only. The controller commits after phase completion.

🔧 Path aliases: only 3 families:
  @/admin/* → src/app/(admin)/admin/(dashboard)/_shared/*
  @/public/* → src/app/(public)/_shared/*
  @/shared/* → src/shared/*
  Double prefixes like "@/admin/_shared/X" are invalid.

📋 Plan deviation: if plan identifiers diverge from implementation,
keep and report as a justified deviation (no forced renames).

📊 Completion report format:
  ## Edited files
  - <path>: <summary of change>
  ## New files
  - <path>: <purpose>
  ## Deleted files
  - <path>: <deletion reason>
  ## DEVIATION
  - (if none, explicitly write "None")
  ## VERIFICATION
  - <grep / ls commands the controller should verify>
```

After each phase, the controller performs a 3-step verification:

1. List modifications + untracked with `git status --short`
2. Check line-count delta for target files with `wc -l`
3. Confirm expected symbols exist and removed symbols do not via `grep`

---

## Phase 1: C5b — Rules audit + barrel-index expansion (5 commits)

**Purpose:** Stabilize rules as SSoT and prepare the reference foundation for later phase dispatch prompts + doc updates.

**Dispatch unit:** One implementer (sonnet) runs Tasks 1.1–1.5 sequentially; the controller splits into five commits at commit boundaries.

### Task 1.1: Stale rule + paths gap investigation (read-only)

**Files:** read-only, no edits.

- [ ] **Step 1: Grep paths frontmatter status across all rule docs**

```bash
for f in $(find .claude/rules -name "*.md"); do
  has_paths=$(grep -l "^paths:" "$f" || true)
  if [ -z "$has_paths" ]; then
    echo "[NO paths] $f"
  fi
done
```

Expected output: list of rule docs without paths frontmatter. For each file, determine whether it is a "gap" using the criteria below:

- **Gap**: rule docs mention specific patterns under `src/` (`enums/guards.ts` / `domain/` / `actions/`, etc.) or contain content that should load only when editing those paths
- **Not a gap**: rule docs cover project-wide principles (e.g., SSOT philosophy / naming ADRs) and do not map to a specific path

Record the rationale in /tmp/c5b-investigation.md.

- [ ] **Step 2: Extract helper / API names mentioned in rule docs**

```bash
grep -rohE '`[a-z][a-zA-Z]+\(\)`' .claude/rules/ | sort -u > /tmp/c5b-rule-helpers.txt
wc -l /tmp/c5b-rule-helpers.txt
```

Expected: list of function names referenced in rule docs.

- [ ] **Step 3: Cross-grep whether each helper exists in src/**

```bash
while read helper; do
  name=$(echo "$helper" | tr -d '`()' )
  count=$(grep -rln "$name" src/ 2>/dev/null | wc -l)
  if [ "$count" = "0" ]; then
    echo "[STALE] $helper — 0 references in src/"
  fi
done < /tmp/c5b-rule-helpers.txt
```

Expected: list of stale helper names that do not exist in src/.

- [ ] **Step 4: Summarize results in /tmp/c5b-investigation.md and report to the controller**

Format:

```
## paths gap (N files)
- <path>: <recommended paths>

## stale helpers (N)
- <helper>: <rule file where found>

## tailwind-patterns.md split proposal
- <subtopic>.md: <line range>

## zod-patterns.md split proposal
- <subtopic>.md: <line range>
```

- [ ] **Step 5: Implementer reports → controller approves → proceed to Task 1.2 (no commit, investigation only)**

### Task 1.2: Barrel-index tailwind-patterns.md

**Files:**

- Modify: `.claude/rules/tailwind-patterns.md` (569 → ~50 lines)
- Create: `.claude/rules/tailwind-patterns/<subtopic>.md` (4-6 sub-files)

**Reference:** See existing barrel-index usage in `react-patterns.md` (parent) + `react/<subtopic>.md` subfiles.

- [ ] **Step 1: Confirm the final format for the parent file**

Read `react-patterns.md` to confirm the format (frontmatter `paths:` + sub-file links only).

- [ ] **Step 2: Finalize subtopic split (from Task 1.1 results)**

Example: `tailwind-patterns/`

- `responsive-breakpoints.md` (md/lg/xl usage guidelines)
- `container-queries.md` (@container / @md/main:, etc.)
- `grid-overlap.md` (col-start cell overlap pattern)
- `inline-style-vs-arbitrary.md` (Tailwind v4 specificity)
- `theme-tokens.md` (@theme arbitrary value promotion)

- [ ] **Step 3: Create sub-files (move relevant lines + add frontmatter)**

Frontmatter template:

```yaml
---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---
# <Subtopic Title>

<original content>
```

- [ ] **Step 4: Shrink parent `tailwind-patterns.md`**

New format:

```yaml
---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---

# Tailwind 4 Patterns

> **Barrel-index:** Each subtopic is chain-loaded via path-scoped autoload.

- [Responsive breakpoints](tailwind-patterns/responsive-breakpoints.md)
- [Container queries](tailwind-patterns/container-queries.md)
- [Grid overlap](tailwind-patterns/grid-overlap.md)
- [Inline style vs arbitrary properties](tailwind-patterns/inline-style-vs-arbitrary.md)
- [Theme tokens](tailwind-patterns/theme-tokens.md)
```

- [ ] **Step 5: Check for missing migrations**

```bash
diff <(git show HEAD:.claude/rules/tailwind-patterns.md | wc -l) <(cat .claude/rules/tailwind-patterns.md .claude/rules/tailwind-patterns/*.md | wc -l)
```

Expected: New side is +N (frontmatter only). No content loss.

- [ ] **Step 6: Implementer reports completion → controller commits**

Commit message:

```
refactor(rules): barrel-index tailwind-patterns.md

Split 569 lines into 5 subtopics (responsive-breakpoints / container-queries / grid-overlap /
inline-style-vs-arbitrary / theme-tokens). Parent file has only paths frontmatter +
sub-file links. Keep the autoload chain.

C5b Task 1.2
```

### Task 1.3: Barrel-index zod-patterns.md

**Files:**

- Modify: `.claude/rules/zod-patterns.md` (746 → ~50 lines)
- Create: `.claude/rules/zod-patterns/<subtopic>.md` (5-7 sub-files)

- [ ] **Step 1–6: Split zod-patterns.md using the same steps as Task 1.2**

Subtopic split proposal (based on Task 1.1 results):

- `validation-schemas.md` (basic schema construction)
- `error-formatting.md` (`error:` parameter + safeParse)
- `cross-field-refine.md` (top-level refine pattern)
- `array-uniqueness.md` (duplicate rejection via `.refine()`)
- `metadata-registry.md` (`z.registry<T>().register(schema, meta)`)
- `enum-and-literals.md` (parseAsStringLiteral + isValid\* gate)

Commit message:

```
refactor(rules): barrel-index zod-patterns.md

Split 746 lines into 6 subtopics. Parent file has only paths frontmatter + sub-file links.

C5b Task 1.3
```

### Task 1.4: Fill missing paths frontmatter

**Files:**

- Modify: rule docs missing paths found in Task 1.1 (count depends on investigation results)

- [ ] **Step 1: Add paths frontmatter to each missing file**

Example (if `type-safety.md` was missing):

```yaml
---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---
```

Criteria: configure `paths:` to broadly autoload for src patterns mentioned in rule docs text (e.g., `enums/guards.ts`, `domain/`, `actions/`).

- [ ] **Step 2: Re-check paths coverage across all rule docs with grep**

```bash
total=$(find .claude/rules -name "*.md" | wc -l)
with_paths=$(grep -rl "^paths:" .claude/rules/ | wc -l)
echo "$with_paths / $total ($(( with_paths * 100 / total ))%)"
```

Expected: reach 100% (both barrel parents and sub-files have paths).

- [ ] **Step 3: Commit**

Commit message:

```
refactor(rules): fill missing paths frontmatter (autoload coverage 100%)

Fill N paths gaps found in Task 1.1 investigation. Standardize rule docs
to autoload path-scoped from the appropriate src paths.

C5b Task 1.4
```

### Task 1.5: Remove/update stale rule docs + sync AGENTS.md

**Files:**

- Modify or Delete: stale rule docs found in Task 1.1 (helpers with zero refs in src/)
- Modify: `AGENTS.md` (relevant section)

- [ ] **Step 1: Stale determination**

Re-validate the stale helper list from Task 1.1:

```bash
# Final check for each stale helper (filter: exclude test files)
grep -rln "<helper-name>" src/ --include="*.ts" --include="*.tsx" | grep -v __tests__
```

Helpers with zero hits are removal targets in rule docs. If they still exist, update the rule text accordingly.

- [ ] **Step 2: Remove (or update) stale references from rule docs**

Deletion pattern: delete entire paragraphs or table rows that only mention stale helpers.
Update pattern: if only part of a paragraph is stale, remove that sentence and stitch the rest.

- [ ] **Step 3: Sync AGENTS.md**

```bash
node scripts/verify-policy-docs.mjs
```

Expected: byte-identical verification succeeds. If it fails, sync the relevant AGENTS.md section with CLAUDE.md / rule docs.

- [ ] **Step 4: bun run validate**

```bash
bun run validate
```

Expected: type-check + lint succeed.

- [ ] **Step 5: Commit**

Commit message:

```
refactor(rules): remove stale rule docs + sync AGENTS.md

Remove N helper names with zero references in src/ from rule docs. Sync the
corresponding AGENTS.md section to be byte-identical with CLAUDE.md.

C5b Task 1.5
```

### Phase 1 completion reviewer

- [ ] **Reviewer dispatch (combined: spec compliance + code quality)**

Prompt template:

```
Review Phase 1 (C5b) commits against spec docs/superpowers/specs/2026-04-27-clean-break-c5-design.md §3.1.

Verify:
1. tailwind-patterns.md / zod-patterns.md are barrel-indexed (parent file only has paths + links)
2. paths frontmatter coverage is 100%
3. no missing references after stale rule removal (`grep -rn "<deleted-name>" .claude/ docs/ CLAUDE.md`)
4. AGENTS.md sync succeeds (`node scripts/verify-policy-docs.mjs`)
5. bun run validate succeeds

Return JSON:
{
  "spec_compliance": { "verdict": "PASS|NEEDS_CHANGES", "issues": [...] },
  "code_quality": { "verdict": "PASS|NEEDS_CHANGES", "issues": [...] },
  "overall_verdict": "PASS|NEEDS_CHANGES"
}
```

If NEEDS_CHANGES, the controller returns to the task, fixes, and re-dispatches.

---

## Phase 2: C5c — Subagents canonical + dispatch-template extraction (4 commits)

**Purpose:** Normalize subagent frontmatter to the official canonical format and convert the dispatch prompt template into a skill.

**Dispatch unit:** One implementer (sonnet) runs Tasks 2.1–2.4 sequentially.

### Task 2.1: Agent frontmatter compliance + usage investigation (read-only)

**Files:** read-only.

- [ ] **Step 1: Check frontmatter format for all agents**

```bash
for f in .claude/agents/*.md; do
  name=$(grep -m1 "^name:" "$f" | sed 's/name: //')
  desc=$(grep -m1 "^description:" "$f" | wc -c)
  tools_lines=$(awk '/^tools:/,/^[a-z]+:/' "$f" | grep -c "^  -" || echo 0)
  model=$(grep -m1 "^model:" "$f" | sed 's/model: //')
  memory=$(grep -m1 "^memory:" "$f" | sed 's/memory: //')

  issues=""
  [ "$tools_lines" -gt 0 ] && issues="$issues YAML_LIST_TOOLS"
  [ -z "$model" ] && issues="$issues NO_MODEL"
  [ "$model" = "haiku" ] && issues="$issues HAIKU_FORBIDDEN"

  echo "$f | $name | $model | memory=$memory | issues=$issues"
done
```

Expected: per-agent frontmatter status. `YAML_LIST_TOOLS` marks conversion to comma-separated, `NO_MODEL` marks adding `model: sonnet`.

- [ ] **Step 2: Grep usage for each agent**

```bash
for f in .claude/agents/*.md; do
  name=$(basename "$f" .md)
  refs=$(grep -rln "subagent_type=\"$name\"\|subagent_type='$name'" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null | wc -l)
  echo "$name: $refs references"
done | sort -k2 -n
```

Expected: agents with zero usage (refs=0) = deletion candidates.

- [ ] **Step 3: Cross-check memory: project backing dir / body Memory section**

```bash
for f in .claude/agents/*.md; do
  has_memory_field=$(grep -c "^memory: project" "$f")
  [ "$has_memory_field" = "0" ] && continue
  name=$(basename "$f" .md)
  has_dir=$([ -d ".claude/agent-memory/$name" ] && echo "yes" || echo "no")
  has_body=$(grep -c "^## Memory" "$f")
  echo "$name: dir=$has_dir, body=$has_body"
done
```

Expected: agents with dir=no and body=0 are removal targets for `memory: project`.

- [ ] **Step 4: Summarize results in /tmp/c5c-investigation.md and report to controller**

Format:

```
## frontmatter change targets
- <agent>: <issue>

## deletion candidate agents (zero usage)
- <agent>

## memory: project removal targets
- <agent>

## Extraction range for dispatch prompt from CLAUDE.md "Subagent discipline" section
- Line range: CLAUDE.md L<start>-L<end>
```

- [ ] **Step 5: Implementer reports → controller approves → proceed to Task 2.2 (no commit)**

### Task 2.2: Canonicalize frontmatter (25 agents)

**Files:**

- Modify: `.claude/agents/*.md` (agents flagged for frontmatter changes in Task 2.1)

- [ ] **Step 1: Convert YAML list `tools:` to a single comma-separated line**

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
```

After:

```yaml
tools: Read, Grep, Glob
```

- [ ] **Step 2: Fill missing frontmatter**

- Missing `model:` → add `model: sonnet` (if description trigger cannot determine implementer vs reviewer, default to sonnet)
- Standardize `description:` trigger phrase (`Use proactively when ...` or "Use after ...")

- [ ] **Step 3: Align memory: project**

Remove the `memory: project` field from agents marked for removal in Task 2.1 Step 3.

- [ ] **Step 4: Validate**

```bash
# Re-grep to ensure all agents are in canonical format
for f in .claude/agents/*.md; do
  bad=$(awk '/^tools:/,/^[a-z]+:/' "$f" | grep -c "^  -" || echo 0)
  [ "$bad" -gt 0 ] && echo "[FAIL] $f still has YAML list tools"
done
```

Expected: no output.

- [ ] **Step 5: Commit**

Commit message:

```
refactor(agents): normalize frontmatter to official canonical format

Convert all agents' tools from YAML lists to a single comma-separated line. Add
model: sonnet to agents missing it. Remove `memory: project` from agents without
a backing dir / body Memory section (continuation of 2026-04-23).

C5c Task 2.2
```

### Task 2.3: Delete zero-usage agents + update references

**Files:**

- Delete: `.claude/agents/<unused-agent>.md` (agents flagged as refs=0 in Task 2.1 Step 2)
- Modify: `CLAUDE.md` ("Auto-load" section + reviewer dispatch example)

- [ ] **Step 1: Reconfirm deletion candidate agents**

```bash
# Reproduce Task 2.1 results via grep
```

- [ ] **Step 2: Delete files**

```bash
git rm .claude/agents/<unused-agent>.md
```

- [ ] **Step 3: Update references**

```bash
# Ensure deleted agent names do not remain in CLAUDE.md / AGENTS.md / other docs
for name in <deleted-agents>; do
  grep -rn "$name" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null | grep -v "^\.claude/agents/$name\.md"
done
```

Expected: no output. If any remain, edit the file to remove them.

- [ ] **Step 4: bun run validate**

Expected: success.

- [ ] **Step 5: Commit**

Commit message:

```
refactor(agents): delete N zero-usage agents + update references

Delete agents not referenced by subagent_type in CLAUDE.md / docs.
Update CLAUDE.md "Auto-load" section + reviewer dispatch example in the same commit.

Deletion targets: <agent-name-list>

C5c Task 2.3
```

### Task 2.4: Add subagent-dispatch-template skill + ADR 0025 + shorten CLAUDE.md

**Files:**

- Create: `.claude/skills/subagent-dispatch-template/SKILL.md`
- Create: `docs/architecture/decisions/0025-subagent-dispatch-template-ssot.md`
- Modify: `CLAUDE.md` (shorten "Subagent discipline" section)
- Modify: `docs/architecture/decisions/README.md` (add 0025 entry)

- [ ] **Step 1: Reconfirm ADR numbering**

```bash
ls docs/architecture/decisions/00*.md | tail -1
git worktree list
```

Expected: latest is 0024, no parallel worktrees → confirm 0025.

- [ ] **Step 2: Create subagent-dispatch-template/SKILL.md**

```yaml
---
name: subagent-dispatch-template
description: SSoT prompt template for dispatching implementer/reviewer subagents via subagent-driven-development or the Agent tool. Enforces no git usage, three import alias families, plan deviation policy, and completion report format as discipline.
when_to_use: Use when running the subagent-driven-development skill, or right before dispatching implementer/reviewer subagents via the Agent tool.
---
# Subagent Dispatch Template

## Required implementer prompt items

(Body is migrated from the CLAUDE.md "Subagent discipline" section)
...
```

- [ ] **Step 3: Create ADR 0025**

```markdown
# 0025 — Convert Subagent dispatch template SSoT into a skill

- Status: Accepted
- Date: 2026-04-27
- Deciders: Claude Code controller / project owner

## Context

The CLAUDE.md "Subagent discipline" section scattered the dispatch prompt template
(no git, import alias families, plan deviation policy, completion report format), and
the controller manually copied it each time a new plan was created.

## Decision

Create the `subagent-dispatch-template` skill and shorten CLAUDE.md to a single
"→ see skill" line. Consolidate the dispatch prompt SSoT in the skill itself.

## Consequences

- For plan creation, dispatch prompts directly invoke/reference the skill content
- CLAUDE.md "Subagent discipline" section keeps only the discipline list (git prohibition reason, 3-step verification, etc.)
- Discipline changes are completed by updating a single skill
```

- [ ] **Step 4: Shorten CLAUDE.md**

Replace the dispatch prompt template portion of the "Subagent discipline" section with:

```markdown
- **SSoT for implementer dispatch prompt** — see `.claude/skills/subagent-dispatch-template/SKILL.md`. Manage no git usage, three import alias families, plan deviation policy, and completion report format in one skill (ADR 0025).
```

Keep the discipline list (3-step verification / sonnet+ / 3-step verification after parallel, etc.).

- [ ] **Step 5: Add 0025 entry to ADR README**

```markdown
| 0025 | [Subagent dispatch template SSoT](0025-subagent-dispatch-template-ssot.md) | Accepted | 2026-04-27 |
```

- [ ] **Step 6: bun run validate + verify-policy-docs**

```bash
bun run validate
node scripts/verify-policy-docs.mjs
```

Expected: both succeed.

- [ ] **Step 7: Commit**

Commit message:

```
feat(skills): add subagent-dispatch-template skill + ADR 0025

Consolidate the dispatch prompt template scattered in the CLAUDE.md "Subagent discipline"
section into a skill SSoT. Shorten CLAUDE.md to a single "→ see skill" line.
Record the SSoT move in ADR 0025.

C5c Task 2.4
```

### Phase 2 completion reviewer

- [ ] **Reviewer dispatch (combined)**

Prompt: Phase 2 version of the Phase 1 reviewer template. Check spec §3.2 / §4.1 C5c.

---

## Phase 3: C5a — Skills new fields + responsibility merge (5 commits)

**Purpose:** Strategically apply official new fields to skills, resolve overlapping responsibilities, and unify naming conventions.

**Dispatch unit:** One implementer (sonnet) runs Tasks 3.1–3.5 sequentially.

### Task 3.1: Skill duplication + naming investigation (read-only)

**Files:** read-only.

- [ ] **Step 1: Collect frontmatter for all skills**

```bash
for f in .claude/skills/*/SKILL.md; do
  name=$(grep -m1 "^name:" "$f" | sed 's/name: //')
  desc=$(grep -m1 "^description:" "$f" | wc -c)
  has_when=$(grep -c "^when_to_use:" "$f")
  has_arghint=$(grep -c "^argument-hint:" "$f")
  has_disable=$(grep -c "^disable-model-invocation:" "$f")
  has_paths=$(grep -c "^paths:" "$f")
  echo "$name | desc=${desc}c | when=$has_when | arghint=$has_arghint | disable=$has_disable | paths=$has_paths"
done
```

Expected: per-skill field adoption status. Skills with descriptions over 1,536 chars (truncated) must be shortened.

- [ ] **Step 2: Analyze naming prefixes**

```bash
ls .claude/skills/ | awk -F- '{print $1}' | sort | uniq -c | sort -rn
```

Expected: prefix distribution (`add-` 2, `create-` 3, `audit-` 4, `cloud-` 1, `google-` 1, etc.). If `*-debug` and `audit-*` are mixed, unify prefixes.

- [ ] **Step 3: Evaluate overlap candidates**

```bash
# Compare contents of add-prisma-enum and add-settings-field
diff <(cat .claude/skills/add-prisma-enum/SKILL.md) <(cat .claude/skills/add-settings-field/SKILL.md)

# Compare contents of the three lexical-* skills
wc -l .claude/skills/lexical-{node,plugin,toolbar}/SKILL.md
```

Expected: determine whether scaffolding steps are shared or clearly independent.

- [ ] **Step 4: 3-option decision on lexical-\* consolidation**

Options:

- (a) **merge**: consolidate into one `lexical-add` skill, branching by type argument (node / plugin / toolbar)
- (b) **hierarchical**: apply barrel pattern under `lexical/` dir with `node.md` / `plugin.md` / `toolbar.md` + parent `SKILL.md` routing
- (c) **keep as-is**: keep as independent responsibilities

Decision criteria:

- Shared scaffolding 70%+ → (a) merge
- Shared 30–70% → (b) hierarchical
- Shared <30% → (c) keep as-is

- [ ] **Step 5: Create rename mapping**

```
*-debug group (cloud-run-debug / google-calendar-debug / instagram-debug / stripe-debug / turbopack-hmr) → debug-* prefix
  - cloud-run-debug → debug-cloud-run
  - google-calendar-debug → debug-google-calendar
  - instagram-debug → debug-instagram
  - stripe-debug → debug-stripe
  - turbopack-hmr → debug-turbopack (HMR is a debug context)

audit-* group (cache-audit / lexical-audit / seed-audit / ssot-audit / use-server-audit / memory-staleness-audit / adr-drift-audit / integration-audit / audit-settings-sections) already uses the audit prefix → only check naming consistency
```

- [ ] **Step 6: Summarize results in /tmp/c5a-investigation.md and report to controller**

Format:

```
## New field adoption candidates
### when_to_use additions
- <skill>: <reason>

### argument-hint additions
- <skill>: <hint string>

### disable-model-invocation: true additions
- <skill>: <reason>

## Responsibility overlap consolidation
### add-prisma-enum + add-settings-field
- <merge / shared reference / keep as-is> + reason

### lexical-* (3 skills)
- <a/b/c> + reason

## rename mapping
- <old> → <new>: <reason>

## description over 1,536 chars
- <skill>: <character count>
```

- [ ] **Step 7: Controller approval → Task 3.2 (no commit)**

### Task 3.2: Strategic application of new fields

**Files:**

- Modify: `.claude/skills/<skill>/SKILL.md` (multiple skills based on Task 3.1 results)

- [ ] **Step 1: Apply to skills targeted for when_to_use**

Example:

```yaml
---
name: prisma-migration
description: ...
when_to_use: After editing schema.prisma, right before running bunx --bun prisma migrate dev to create a migration. Use as a precursor to the db-migration-reviewer agent.
---
```

- [ ] **Step 2: Apply to skills targeted for argument-hint**

Example:

```yaml
---
name: split-action-file
description: ...
argument-hint: <action-file-path>
---
```

- [ ] **Step 3: Apply disable-model-invocation: true**

Add to human-trigger-only skills (debug-\* / turbopack-hmr, etc.):

```yaml
---
name: debug-cloud-run
description: ...
disable-model-invocation: true
---
```

Reason: these skills are invoked based on developer judgment, and autoload misfires would contaminate debug context.

- [ ] **Step 4: Shorten skills with descriptions over 1,536 chars**

Compress the description of the target skills (from Task 3.1 Step 1 results) to within 1,536 chars. Move details to the body.

- [ ] **Step 5: bun run validate**

Expected: success.

- [ ] **Step 6: Commit**

Commit message:

```
feat(skills): strategically apply when_to_use / argument-hint / disable-model-invocation

- when_to_use: add to N skills with insufficient triggering precision
- argument-hint: add to N skills that take arguments
- disable-model-invocation: set true on N human-trigger-only skills
- description: shorten N skills over 1,536 chars

C5a Task 3.2
```

### Task 3.3: Decide + apply lexical-\* consolidation

**Files:** Follow the decision from Task 3.1 Step 4.

- [ ] **Step 1: Apply the chosen option (a/b/c)**

(a) If merge:

```bash
mkdir .claude/skills/lexical-add
# Merge content from lexical-{node,plugin,toolbar}
# Delete the three old dirs
git rm -r .claude/skills/lexical-{node,plugin,toolbar}/
```

(b) If hierarchical: apply barrel-pattern (same as rules barrel-index)

(c) If keep as-is: skip Task 3.3 (move to Task 3.4)

- [ ] **Step 2: Update references**

```bash
grep -rn "lexical-node\|lexical-plugin\|lexical-toolbar" .claude/ docs/ CLAUDE.md AGENTS.md
```

Expected: no old skill names remain (Task 3.5 will re-sweep, but this is an early fix).

- [ ] **Step 3: Commit (only if the chosen option is applied)**

Commit message example (if (a)):

```
refactor(skills): merge lexical-{node,plugin,toolbar} into lexical-add

Merge shared scaffolding from three skills into one, branching by type argument (node /
plugin / toolbar). Resolve overlap. Unify naming to add-* prefix.

C5a Task 3.3
```

### Task 3.4: rename: _-debug → debug-_ (also confirm audit-\*)

**Files:**

- Rename (git mv): `.claude/skills/cloud-run-debug` → `.claude/skills/debug-cloud-run`, plus 4 others
- Modify: `name:` field in each SKILL.md

- [ ] **Step 1: Rename dir + name field**

```bash
git mv .claude/skills/cloud-run-debug .claude/skills/debug-cloud-run
# Update name: in SKILL.md
# Apply to all 5 skills
```

- [ ] **Step 2: Check naming consistency for audit-\* group**

Only `audit-settings-sections` uses the `audit-` prefix, while others use suffix forms like `cache-audit` / `lexical-audit`. If unifying:

```bash
git mv .claude/skills/cache-audit .claude/skills/audit-cache
git mv .claude/skills/lexical-audit .claude/skills/audit-lexical
git mv .claude/skills/seed-audit .claude/skills/audit-seed
git mv .claude/skills/ssot-audit .claude/skills/audit-ssot
git mv .claude/skills/use-server-audit .claude/skills/audit-use-server
git mv .claude/skills/memory-staleness-audit .claude/skills/audit-memory-staleness
git mv .claude/skills/adr-drift-audit .claude/skills/audit-adr-drift
git mv .claude/skills/integration-audit .claude/skills/audit-integration
# audit-settings-sections already uses prefix, no change needed
```

Decision: adopt `audit-*` prefix unification (formalize in ADR 0026).

- [ ] **Step 3: Update name field**

Match each SKILL.md `name:` to the new dir name.

- [ ] **Step 4: bun run validate**

- [ ] **Step 5: Commit**

Commit message:

```
refactor(skills): unify naming rules — *-debug → debug-*, *-audit → audit-*

Unify prefixes per ADR 0026 (skill naming convention):
- 5 debug skills: cloud-run-debug, etc. → debug-* prefix
- 8 audit skills: cache-audit, etc. → audit-* prefix

C5a Task 3.4
```

### Task 3.5: ADR 0026 + consolidate add-prisma-enum/add-settings-field + update all references

**Files:**

- Create: `docs/architecture/decisions/0026-skill-naming-convention.md`
- Modify: `docs/architecture/decisions/README.md`
- Modify: `add-prisma-enum/SKILL.md` + `add-settings-field/SKILL.md` (or merge)
- Modify: all reference locations (CLAUDE.md / docs / other skills / agents)

- [ ] **Step 1: Create ADR 0026**

```markdown
# 0026 — Skill naming convention

- Status: Accepted
- Date: 2026-04-27

## Decision

Skill naming convention:

- `add-*`: new resource additions (DB enum / settings field, etc.)
- `create-*`: scaffolding (admin page / page content / server action, etc.)
- `audit-*`: audit/detection (cache / seed / ssot / use-server / memory-staleness / etc.)
- `debug-*`: environment/service diagnostics (cloud-run / google-calendar / instagram / stripe / turbopack)
- `<topic>` (no prefix): feature/category skills (frontend-design / parallax-section / ui-ux-pro-max / etc.)

## Consequences

- Old _-debug / _-audit / single audit-\* skills are renamed to the new prefix (commit `<rename-sha>`)
- New skills must follow this rule
- Exceptions require ADR justification
```

- [ ] **Step 2: Add 0026 entry to ADR README**

- [ ] **Step 3: Apply consolidation decision for add-prisma-enum / add-settings-field**

Follow results from Task 3.1 Step 3:

- High overlap (70%+) → merge
- Medium overlap (30–70%) → extract shared reference file (`reference/scaffold-common.md`)
- Low overlap (<30%) → keep as-is

- [ ] **Step 4: Update all references (phase-complete sweep)**

```bash
# Check that no old skill names remain
for old in cloud-run-debug google-calendar-debug instagram-debug stripe-debug turbopack-hmr cache-audit lexical-audit seed-audit ssot-audit use-server-audit memory-staleness-audit adr-drift-audit integration-audit; do
  refs=$(grep -rn "$old" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null | grep -v "$old.md:" | wc -l)
  [ "$refs" -gt 0 ] && echo "[FAIL] $old still has $refs refs"
done
```

Expected: no output. If any remain, edit the file to remove them.

The following SSoT items require manual checks (if grep hits, update in the same commit):

- `CLAUDE.md` "Auto-load" section skill name lists / skill mentions in `## Hard Rules`
- `AGENTS.md` corresponding section (byte-identical to CLAUDE.md)
- skill references in `docs/architecture/decisions/README.md`
- other skills (cross-references in SKILL.md body)
- other agents (dispatch examples in `.claude/agents/*.md` body)

- [ ] **Step 5: Live activation test**

Activate one new skill name (e.g., `/audit-cache`) and confirm behavior (controller manual).

- [ ] **Step 6: bun run validate + verify-policy-docs**

- [ ] **Step 7: Commit**

Commit message:

```
docs(adr): 0026 skill naming convention + add-* consolidation + update all references

Formalize the skill naming convention (add-* / create-* / audit-* / debug-*) in ADR 0026.
Consolidate shared scaffolding between add-prisma-enum / add-settings-field as
<merge / reference / keep as-is>. Update all old skill name references across
CLAUDE.md / docs / other skills.

C5a Task 3.5
```

### Phase 3 completion reviewer

- [ ] **Reviewer dispatch (combined)**

Prompt: Phase 3 version of the Phase 1 reviewer template. Check spec §3.3 / §4.1 C5a.

---

## Phase 4: C5d — Docs audit + cleanup (6 commits)

**Purpose:** docs/ consistency, archive decisions, dangling link removal, version drift fixes.

**Dispatch unit:** One implementer (sonnet) runs Tasks 4.1–4.6 sequentially.

### Task 4.1: ADR README index sync audit + fixes

**Files:**

- Modify: `docs/architecture/decisions/README.md`

- [ ] **Step 1: Compare ADR file count with README index row count**

```bash
file_count=$(ls docs/architecture/decisions/00*.md | wc -l)
index_count=$(grep -cE "^\| \[00" docs/architecture/decisions/README.md)
echo "files=$file_count, index=$index_count, expected_diff=1 (includes template)"
```

Expected: `file_count = index_count` (if template counts separately, +1).

- [ ] **Step 2: Cross-grep to ensure each ADR is indexed in README**

```bash
for f in docs/architecture/decisions/00*.md; do
  num=$(basename "$f" | cut -c1-4)
  found=$(grep -c "^\| \[$num\]" docs/architecture/decisions/README.md)
  [ "$found" = "0" ] && echo "[MISSING] $num not in README"
done
```

Expected: no output. If output appears, add to README.

- [ ] **Step 3: Check index order (by number) and reorder if needed**

- [ ] **Step 4: Commit**

Commit message:

```
docs(adr): sync README index — add N missing entries + reorder by number

Add M missing README index rows out of N ADR files. Reorder rows by number.

C5d Task 4.1
```

### Task 4.2: Fix dangling links in design docs

**Files:**

- Modify: `docs/architecture/**/*.md` (files with dangling links)

- [ ] **Step 1: Extract all links**

```bash
grep -rohE "\]\([^)]+\.md[^)]*\)" docs/architecture/ | sort -u | sed 's/^.\(.*\))$/\1/' > /tmp/c5d-links.txt
wc -l /tmp/c5d-links.txt
```

- [ ] **Step 2: Verify each link target exists on disk**

```bash
while read link; do
  # Convert relative links to absolute paths (simple; handle context manually if needed)
  if [ ! -f "docs/architecture/$link" ] && [ ! -f "$link" ]; then
    echo "[DANGLING] $link"
  fi
done < /tmp/c5d-links.txt
```

Expected: list of dangling links.

- [ ] **Step 3: Fix each dangling link (delete or replace with correct path)**

Criteria:

- If link target was deleted → remove the link (delete or replace the sentence)
- If link target was renamed → update to the new path

- [ ] **Step 4: Commit**

Commit message:

```
docs(architecture): fix N dangling links

Verify design-doc links on disk, remove N links to deleted files, and update M links
to renamed files with the new paths.

C5d Task 4.2
```

### Task 4.3: Plan/spec archive determination (read-only investigation)

**Files:** read-only.

- [ ] **Step 1: Extract commit SHAs from all plans/specs**

```bash
for f in docs/superpowers/plans/*.md docs/superpowers/specs/*.md; do
  shas=$(grep -oE "\b[0-9a-f]{7,40}\b" "$f" | head -3)
  echo "$f: $shas"
done > /tmp/c5d-plan-shas.txt
```

- [ ] **Step 2: Confirm each SHA exists on main**

```bash
while IFS=: read file shas; do
  for sha in $shas; do
    git cat-file -e "$sha" 2>/dev/null && echo "[REAL] $file: $sha" || echo "[FAKE] $file: $sha"
  done
done < /tmp/c5d-plan-shas.txt
```

- [ ] **Step 3: Determine implementation status for each plan**

Criteria:

- All SHAs in the plan exist on main + final task completed (match commit log) → archive candidate
- Some SHAs missing or unimplemented → keep as-is

- [ ] **Step 4: Summarize results in /tmp/c5d-archive-list.md and report to controller**

Format:

```
## archive candidate plans
- <path>: implementation complete (final SHA <sha>)

## archive candidate specs
- <path>: related plan complete

## keep as-is
- <path>: reason
```

- [ ] **Step 5: Controller approval → Task 4.4 (no commit)**

### Task 4.4: Move plans/specs to .archive/2026/ + update README

**Files:**

- Move (git mv): plans/specs marked as archive candidates in Task 4.3
- Create: `docs/superpowers/plans/.archive/2026/` + `docs/superpowers/specs/.archive/2026/` (if missing)
- Modify: `docs/superpowers/plans/README.md` (or `.archive/README.md`)

- [ ] **Step 1: Create archive dir**

```bash
mkdir -p docs/superpowers/plans/.archive/2026
mkdir -p docs/superpowers/specs/.archive/2026
```

- [ ] **Step 2: Move**

```bash
for plan in <archive-list>; do
  git mv "$plan" "docs/superpowers/plans/.archive/2026/$(basename $plan)"
done
# same for specs
```

- [ ] **Step 3: Add Snapshot note to archived plans/specs**

At the top of each archived file:

```markdown
> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.
```

- [ ] **Step 4: Update README (separate active vs archive)**

`docs/superpowers/plans/README.md`:

```markdown
# Plans

## Active

- (empty or in-progress plans)

## Archive

- [.archive/2026/](.archive/2026/) — completed plans
```

- [ ] **Step 5: Commit**

Commit message:

```
docs(plans): move completed plans/specs to .archive/2026/

Move N plans + M specs that are complete (commit SHAs verified on main) into the archive
dir. Add Snapshot notes at each file top. Update README to explicitly separate active vs archive.

C5d Task 4.4
```

### Task 4.5: Fix version drift in docs/guides/ + docs/reference/

**Files:**

- Modify: `docs/guides/**/*.md` + `docs/reference/**/*.md`

- [ ] **Step 1: Get ground truth from package.json**

```bash
node -e "const p = require('./package.json'); for (const [k,v] of Object.entries(p.dependencies || {})) console.log(k, v)" | grep -E "next|react|@prisma|tailwindcss|zod|better-auth|lexical|nuqs"
```

Expected: versions of each major library.

- [ ] **Step 2: Grep version mentions in docs**

```bash
grep -rnE "Next\.js [0-9]+\.[0-9]+|React [0-9]+\.[0-9]+|Prisma [0-9]+\.[0-9]+|Tailwind [0-9]+\.[0-9]+|Zod [0-9]+\.[0-9]+|Better Auth [0-9]+\.[0-9]+|Lexical [0-9]+\.[0-9]+" docs/guides/ docs/reference/ 2>/dev/null
```

- [ ] **Step 3: Align drifted entries to ground truth**

Example: `Prisma 7.7` → `Prisma 7.8` (match package.json)

- [ ] **Step 4: Commit**

Commit message:

```
docs(guides): fix version drift — match package.json

Align N library version mentions in docs/guides/ + docs/reference/ to be byte-identical
with package.json (Prisma X.X / Next.js X.X / etc).

C5d Task 4.5
```

### Task 4.6: Remove descriptions of deprecated features

**Files:**

- Modify: `docs/**/*.md` + `.serena/memories/**/*.md`

- [ ] **Step 1: Grep deprecated feature names**

```bash
grep -rln "Supabase\|FullCalendar\|Three\.js\|three\.js\|PixiJS\|pixi" docs/ .serena/memories/ 2>/dev/null
```

Expected: list of files containing deprecated features.

- [ ] **Step 2: Review relevant passages in each file**

Criteria:

- Explicit historical context like "used in the past" or "migrated" → keep (Snapshot context)
- Current-state references like "currently used" or "how to configure" → remove (deprecated)

- [ ] **Step 3: Delete / update**

- [ ] **Step 4: Commit**

Commit message:

```
docs: remove current-state references to deprecated features (Supabase / FullCalendar / Three.js / PixiJS)

Remove deprecated features described as currently used from docs / serena memories.
Keep historical-context mentions (migration records, etc.) with Snapshot notes.

C5d Task 4.6
```

### Phase 4 completion reviewer

- [ ] **Reviewer dispatch (combined)**

Prompt: Phase 4 version of the Phase 1 reviewer template. Check spec §3.4 / §4.1 C5d.

---

## Overall verification

- [ ] **bun run validate && bun run build**

Expected: both succeed.

- [ ] **node scripts/verify-policy-docs.mjs**

Expected: byte-identical sync succeeds.

- [ ] **Final sweep for missing references**

```bash
# Ensure no old names remain across phases
for old in <deleted-agents> <renamed-skills>; do
  grep -rn "$old" .claude/ docs/ CLAUDE.md AGENTS.md 2>/dev/null
done
```

Expected: no output (deleted agents / old skill names remain nowhere).

- [ ] **Check git log**

```bash
git log --oneline | head -25
```

Expected: 14–23 commits, separated by phase in logical units.

- [ ] **Update/archive handoff memory**

Update `~/.claude/projects/<slug>/memory/project_clean-break-c5-handoff.md`:

- If completed: add archive note (`> **Completed: 2026-04-27** — ...`)
- If partially completed: update remaining phases + launch commands

- [ ] **CLAUDE.md learning codify (use revise-claude-md skill)**

Append learnings from C5 to CLAUDE.md:

- Scale (4 phases / 14–23 commits) as a Clean-Break Refactor reference
- Phase-specific pitfalls in C5b/c/a/d (cascade ref / context budget / etc.)

At session end, invoke the `revise-claude-md` skill (per CLAUDE.md learning: "call revise-claude-md right before session end").

---

## Risk + Mitigation (recap)

See spec §5. Control five risks: missed cross-phase reference fixes / context pressure / ADR numbering conflicts / silent breakage from stale deletions / broken skill rename invocations.

## Out of Scope

See spec §7. Skill content quality improvements / rule wording improvements / agent internal prompt improvements / new design docs / .claude/hooks/ audit are covered in another plan.
