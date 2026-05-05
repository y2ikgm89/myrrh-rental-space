> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Agents Clean-Break Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align 25 subagent definition files in `.claude/agents/**` to the canonical format in the official Claude Code subagent docs (`code.claude.com/docs/en/sub-agents`), with a clean break and no backward-compatibility shim.

**Architecture:** Conduct a three-axis audit per the C2 scope in handoff memory `project_clean-break-refactor-handoff.md`: **(A) least-privilege tools** / **(B) proactive description pattern** / **(C) memory: project only when required**. Pre-grep found all 25 files use YAML list `tools`, which differs from the canonical comma-separated format, so Phase 1 normalizes it. Of 15 `memory: project` declarations, five lack backing dirs; two of those (`cache-strategy-reviewer` / `lexical-reviewer`) also lack a Memory management section and are removed in Phase 2. Phase 3 updates stale §section anchor refs caused by the C1 rule docs barrel split (`server-actions.md` / `frontend/accessibility.md` / `gotchas.md`). Description / duplication / dead subagents were deemed clean in pre-audit (→ rechecked in Phase 4).

**Tech Stack:** Markdown + YAML frontmatter only. No code changes. Verification uses `grep` + visual YAML structure checks.

---

## File Structure

**Target files: all 25 `.claude/agents/*.md` (modified)**

| Area                                       | File count | Notes                                                                                                            |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| All 25 (Phase 1)                           | 25         | Normalize `tools:` from YAML list → comma-separated                                                              |
| `cache-strategy-reviewer` (Phase 2)        | 1          | Remove `memory: project` (no memory mention in body)                                                             |
| `lexical-reviewer` (Phase 2)               | 1          | Remove `memory: project` (no memory mention in body)                                                             |
| `accessibility-reviewer` (Phase 3)         | 1          | Fix anchor `frontend/accessibility.md §Touch targets` → barrel sub-file (`frontend/accessibility/touch-text.md`) |
| `editorial-consistency-reviewer` (Phase 3) | 1          | Same as above                                                                                                    |
| `plan-drift-detector` (Phase 3)            | 1          | Fix anchor `gotchas.md §Claude Code settings` → `gotchas/claude-code.md`                                         |

**Items not changed (kept):**

- `description: >` block scalar format (YAML-compliant, keep for readability)
- `model: sonnet` for all (spec-compliant; no need to change to `inherit`)
- `memory: project` for 13 files (10 have backing dirs / 3 lack backing dirs but have Memory management sections = waiting for lazy-create)
- Functional responsibilities across 25 files (no duplication/dead agents found in pre-audit)

**Not created:**

- New backing dirs (leave to lazy-create; pre-creating empty `MEMORY.md` is noise)
- New subagents

---

## Pre-audit confirmed items

### tools format (Phase 1 target)

**Current (all 25):**

```yaml
tools:
  - Read
  - Grep
  - Glob
```

**Target (official canonical):**

```yaml
tools: Read, Grep, Glob
```

**Rationale:** All examples in official docs `code.claude.com/docs/en/sub-agents` use a single comma-separated line. YAML lists are technically valid, but we avoid dual formats and unify on the canonical form (clean break).

### memory: project orphan determination (Phase 2 target)

| Agent                     | backing dir | body Memory management section | Decision                |
| ------------------------- | ----------- | ------------------------------ | ----------------------- |
| `cache-strategy-reviewer` | none        | none                           | **Remove**              |
| `db-migration-reviewer`   | none        | yes (lines 134-145)            | Keep (lazy-create wait) |
| `lexical-reviewer`        | none        | none                           | **Remove**              |
| `test-runner`             | none        | yes (lines 104-116)            | Keep                    |
| `verification`            | none        | yes (lines 89-106)             | Keep                    |

Criteria follow the CLAUDE.md rule for `.claude/agents/<name>.md`: determine whether the body includes MEMORY references or `.claude/agent-memory/<name>/` has a dir.

### Stale anchor refs (Phase 3 target)

At C1 completion commit `5d298e74`, rule docs were barrel split, but four §section anchors in agent bodies were missed:

```
.claude/agents/accessibility-reviewer.md:173
.claude/agents/editorial-consistency-reviewer.md:96
.claude/agents/plan-drift-detector.md:130
```

Confirm the exact paths and § section names of C1-generated sub-files via `Read` + `Grep` in Phase 3 before rewriting.

### Duplicate/dead subagent audit results

Pre-review confirmed functional differences across all 25; no duplicates or dead agents detected. Phase 4 performs a recheck only.

- `accessibility-reviewer` vs `editorial-consistency-reviewer`: WCAG standards review vs Editorial Magazine token consistency — separate axes
- `test-runner` vs `verification`: per-test diagnosis vs build/type-check/lint umbrella — separate axes
- `test-writer` vs `e2e-test-writer`: bun:test vs Playwright — separate axes
- `design-memory` vs `editorial-consistency-reviewer`: persistent design memory (write) vs violation detection (read-only) — separate axes

---

## Task 1: Tools format normalization (Phase 1)

**Files:**

- Modify: `.claude/agents/accessibility-reviewer.md` (lines 9-12)
- Modify: `.claude/agents/animation-cleanup-reviewer.md` (lines 8-12)
- Modify: `.claude/agents/better-auth-reviewer.md` (lines 9-15)
- Modify: `.claude/agents/cache-strategy-reviewer.md` (lines 9-12)
- Modify: `.claude/agents/codebase-explorer.md` (lines 8-12)
- Modify: `.claude/agents/db-migration-reviewer.md` (lines 8-12)
- Modify: `.claude/agents/design-memory.md` (lines 8-12)
- Modify: `.claude/agents/e2e-test-writer.md` (lines 8-14)
- Modify: `.claude/agents/editorial-consistency-reviewer.md` (lines 8-11)
- Modify: `.claude/agents/email-template-reviewer.md` (lines 9-13)
- Modify: `.claude/agents/event-flow-reviewer.md` (lines 7-10)
- Modify: `.claude/agents/large-file-detector.md` (lines 8-10)
- Modify: `.claude/agents/lexical-reviewer.md` (lines 8-14)
- Modify: `.claude/agents/performance-analyzer.md` (lines 7-10)
- Modify: `.claude/agents/plan-drift-detector.md` (lines 9-13)
- Modify: `.claude/agents/project-reviewer.md` (lines 9-13)
- Modify: `.claude/agents/rate-limit-reviewer.md` (lines 7-10)
- Modify: `.claude/agents/react-compiler-reviewer.md` (lines 8-14)
- Modify: `.claude/agents/reservation-flow-reviewer.md` (lines 7-10)
- Modify: `.claude/agents/route-structure-reviewer.md` (lines 8-12)
- Modify: `.claude/agents/security-reviewer.md` (lines 8-11)
- Modify: `.claude/agents/test-runner.md` (lines 8-12)
- Modify: `.claude/agents/test-writer.md` (lines 8-14)
- Modify: `.claude/agents/verification.md` (lines 8-12)
- Modify: `.claude/agents/zod-schema-reviewer.md` (lines 8-14)

> **Line numbers are as of audit time. When implementing, use Read to confirm the `tools:` block at the start of frontmatter before editing. Replace the entire `tools:` section before the `---` (frontmatter end) with a single line.**

- [ ] **Step 1: Confirm violation pattern exists (pre-edit grep)**

Run:

```bash
grep -lE '^tools:$' .claude/agents/*.md | wc -l
```

Expected: `25` (all 25 have a standalone YAML list `tools:` line)

- [ ] **Step 2: Establish edit pattern on one representative file — `accessibility-reviewer.md`**

Frontmatter in `accessibility-reviewer.md` (around lines 9-12):

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
model: sonnet
```

After:

```yaml
tools: Read, Grep, Glob
model: sonnet
```

Edit:

```
old_string:
tools:
  - Read
  - Grep
  - Glob
model: sonnet

new_string:
tools: Read, Grep, Glob
model: sonnet
```

- [ ] **Step 3: Apply the same edit pattern to the remaining 24**

For each file, `Read` → confirm the `tools:` block in frontmatter → edit to a single comma-separated line. Do the same even for files containing long tool names like `mcp__context7__*`.

Example: `better-auth-reviewer.md`:

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
  - Bash
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
model: sonnet
memory: project
```

After:

```yaml
tools: Read, Grep, Glob, Bash, mcp__context7__resolve-library-id, mcp__context7__query-docs
model: sonnet
memory: project
```

Files like `design-memory.md` that include `skills:` follow the same rule (keep `skills:` as YAML list; normalize `tools:` only):

Before:

```yaml
tools:
  - Read
  - Grep
  - Glob
  - Write
skills:
  - frontend-design
model: sonnet
memory: project
```

After:

```yaml
tools: Read, Grep, Glob, Write
skills:
  - frontend-design
model: sonnet
memory: project
```

Same for files with only two tools like `large-file-detector.md`:

Before:

```yaml
tools:
  - Glob
  - Bash
model: sonnet
```

After:

```yaml
tools: Glob, Bash
model: sonnet
```

- [ ] **Step 4: Verify violation pattern is fully removed (post-edit grep)**

Run:

```bash
grep -lE '^tools:$' .claude/agents/*.md
```

Expected: no output (exit 1)

Inverse grep for confirmation:

```bash
grep -E '^tools: ' .claude/agents/*.md | wc -l
```

Expected: `25` (all 25 converted to comma-separated format)

- [ ] **Step 5: Minimal YAML structure sanity check**

Confirm the frontmatter block (between `---`) is intact. Each file should have exactly two `---` markers (start + frontmatter end):

```bash
for f in .claude/agents/*.md; do
  count=$(grep -cE '^---$' "$f")
  if [ "$count" != "2" ]; then echo "BROKEN: $f (--- count: $count)"; fi
done
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add .claude/agents/
git commit -m "refactor(agents): normalize tools to canonical comma-separated format

Align to the canonical YAML frontmatter format in official docs (code.claude.com/docs/en/sub-agents). Convert tools from YAML list to a single comma-separated line for all 25 files (clean break, no functional changes).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Memory: project orphan removal (Phase 2)

**Files:**

- Modify: `.claude/agents/cache-strategy-reviewer.md` (line 14: remove `memory: project`)
- Modify: `.claude/agents/lexical-reviewer.md` (line 16: remove `memory: project`)

> **Rationale:** Both lack `.claude/agent-memory/<name>/` dirs and have no Memory management section in the body. `db-migration-reviewer` / `test-runner` / `verification` lack backing dirs but do have Memory management sections, so **keep** as lazy-create pending.

- [ ] **Step 1: Confirm current state of the two removal targets**

Run:

```bash
grep -nH '^memory: project$' .claude/agents/cache-strategy-reviewer.md .claude/agents/lexical-reviewer.md
```

Expected:

```
.claude/agents/cache-strategy-reviewer.md:14:memory: project
.claude/agents/lexical-reviewer.md:16:memory: project
```

- [ ] **Step 2: Remove `memory: project` line from `cache-strategy-reviewer.md`**

Before (around lines 13-15, assuming Task 1 completion state):

```yaml
model: sonnet
memory: project
---
```

After:

```yaml
model: sonnet
---
```

Edit:

```
old_string:
model: sonnet
memory: project
---

new_string:
model: sonnet
---
```

- [ ] **Step 3: Remove `memory: project` line from `lexical-reviewer.md`**

Edit using the same pattern as `cache-strategy-reviewer`.

- [ ] **Step 4: Post-delete verification — ensure the 13 keep targets remain**

Run:

```bash
grep -lE '^memory: project$' .claude/agents/*.md | sort
```

Expected: 13 (does not include `cache-strategy-reviewer.md` or `lexical-reviewer.md`)

```
.claude/agents/better-auth-reviewer.md
.claude/agents/codebase-explorer.md
.claude/agents/db-migration-reviewer.md
.claude/agents/design-memory.md
.claude/agents/performance-analyzer.md
.claude/agents/project-reviewer.md
.claude/agents/react-compiler-reviewer.md
.claude/agents/route-structure-reviewer.md
.claude/agents/security-reviewer.md
.claude/agents/test-runner.md
.claude/agents/test-writer.md
.claude/agents/verification.md
.claude/agents/zod-schema-reviewer.md
```

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/cache-strategy-reviewer.md .claude/agents/lexical-reviewer.md
git commit -m "refactor(agents): remove orphan memory: project declarations

Remove the memory: project declaration for the two agents that have neither a backing dir nor a body Memory management section (per CLAUDE.md §Auto-load criteria).
Keep the other 13 because they have a backing dir or a body Memory management section.

- cache-strategy-reviewer: no dir + no body memory mention
- lexical-reviewer: no dir + no body memory mention

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stale §anchor refs after C1 barrel split (Phase 3)

**Files:**

- Modify: `.claude/agents/accessibility-reviewer.md` (line 173)
- Modify: `.claude/agents/editorial-consistency-reviewer.md` (line 96)
- Modify: `.claude/agents/plan-drift-detector.md` (line 130)

> **Background:** In C1 completion commit `5d298e74`, `.claude/rules/frontend/accessibility.md` and `.claude/rules/gotchas.md` were split into a barrel-index pattern. Agent body §section anchors should point to sub-files, but drifted to barrel refs, so we fix them.

- [ ] **Step 1: Confirm sub-file layout after barrel split**

Run:

```bash
ls .claude/rules/frontend/accessibility/ .claude/rules/gotchas/
```

Expected output includes sub-file names (such as `touch-text.md` / `claude-code.md`).

- [ ] **Step 2: Find the exact location of §Touch targets**

Run:

```bash
grep -lE 'Touch targets|44px|2\.5\.5' .claude/rules/frontend/accessibility/*.md
```

Expected: sub-file containing `touch-text.md` appears.

Confirm the exact § section heading in the target sub-file:

```bash
grep -nE '^##' .claude/rules/frontend/accessibility/touch-text.md
```

- [ ] **Step 3: Find the exact location of §Claude Code settings**

Run:

```bash
grep -lE 'Claude Code settings|hook script' .claude/rules/gotchas/*.md
```

Expected: sub-file containing `claude-code.md` appears.

Confirm the exact § section heading in the target sub-file:

```bash
grep -nE '^##' .claude/rules/gotchas/claude-code.md
```

- [ ] **Step 4: Fix anchor in `accessibility-reviewer.md`**

Read around line 173 and then edit after confirming current state.

Before (example, reflect the sub-file name and § confirmed in Step 2):

```markdown
→ Details: `.claude/rules/frontend/accessibility.md` §Touch targets (WCAG 2.5.5 Enhanced)
```

After:

```markdown
→ Details: `.claude/rules/frontend/accessibility/touch-text.md` §Touch targets (WCAG 2.5.5 Enhanced)
```

> Align the exact sub-file name and § heading with Step 2 grep results. If something other than `touch-text.md` (e.g., `interactive.md`) is hit, use that instead.

- [ ] **Step 5: Fix anchor in `editorial-consistency-reviewer.md`**

Read around line 96 and edit. Align to the same sub-file as Step 4:

Before:

```markdown
→ Details: `.claude/rules/frontend/accessibility.md` §Touch targets
```

After:

```markdown
→ Details: `.claude/rules/frontend/accessibility/touch-text.md` §Touch targets
```

- [ ] **Step 6: Fix anchor in `plan-drift-detector.md`**

Read around line 130 and edit:

Before:

```markdown
- `.claude/rules/gotchas.md` §Claude Code settings — schema precondition validation rules for plans
```

After:

```markdown
- `.claude/rules/gotchas/claude-code.md` §Claude Code settings — schema precondition validation rules for plans
```

> If Step 3 grep shows the § in something other than `claude-code.md` (e.g., `general.md`), use that.

- [ ] **Step 7: Final grep for remaining barrel-only refs**

Check that no stale items remain beyond the four known lines:

```bash
grep -nE '\.claude/rules/(frontend/accessibility|gotchas)\.md \xc2\xa7' .claude/agents/*.md
```

Note: `\xc2\xa7` is the UTF-8 byte sequence for `§`. Use it if MINGW64 cannot pass a `§` literal. Alternative:

```bash
grep -nE '\.claude/rules/(frontend/accessibility|gotchas)\.md ' .claude/agents/*.md
```

Expected: no output (no refs that attach §section directly to barrel). Refs that only mention the barrel filename (e.g., `project-reviewer.md:66 .claude/rules/server-actions.md` without a §) are OK to keep (barrel refs are resolved by the autoload chain).

- [ ] **Step 8: Commit**

```bash
git add .claude/agents/accessibility-reviewer.md .claude/agents/editorial-consistency-reviewer.md .claude/agents/plan-drift-detector.md
git commit -m "docs(agents): update stale §anchor refs after C1 rule barrel split

C1 (commit 5d298e74) split frontend/accessibility.md and gotchas.md
Because the barrel-index split caused agent body §section anchors to drift to barrel refs instead of sub-files, we corrected them.

- accessibility-reviewer: §Touch targets → frontend/accessibility/touch-text.md
- editorial-consistency-reviewer: same as above
- plan-drift-detector: §Claude Code settings → gotchas/claude-code.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Final verification

**Files:** no changes (read-only verification)

- [ ] **Step 1: Final frontmatter sanity check for 25 files**

```bash
for f in .claude/agents/*.md; do
  echo "=== $f ==="
  awk '/^---$/{n++; next} n==1{print} n==2{exit}' "$f"
done | head -200
```

Expected: all 25 have `name:` / `description:` / `tools: …` (single comma-separated line) / `model: sonnet`. `memory: project` appears in 13 files. The `---` block is intact.

- [ ] **Step 2: Confirm no duplicate `name`**

```bash
grep -hE '^name: ' .claude/agents/*.md | sort | uniq -d
```

Expected: no output (no duplicate names)

- [ ] **Step 3: Final visual check of functional differences (detect duplicates/dead)**

Extract and read only the first line of each agent's `description` to check for functional overlap:

```bash
for f in .claude/agents/*.md; do
  desc=$(awk '/^description: >/{flag=1; next} flag && /^[[:space:]]/{print; exit}' "$f")
  echo "$(basename "$f"): $desc"
done
```

Expected result (matches pre-audit):

- All 25 scopes do not overlap
- `accessibility-reviewer` (WCAG standards) and `editorial-consistency-reviewer` (Editorial Magazine tokens) are separate axes
- `test-runner` (per-test diagnosis) and `verification` (build/type-check/lint umbrella) are separate axes
- `test-writer` (bun:test) and `e2e-test-writer` (Playwright) are separate axes
- `design-memory` (persistent memory with Write) and `editorial-consistency-reviewer` (read-only violation detection) are separate axes

Only if duplicates/dead are detected, delete them in an additional commit. If none, no extra commit is needed (plan ends).

- [ ] **Step 4: Review summary of all changes**

```bash
git log --oneline main..HEAD
```

Expected: 3 commits (Task 1 / Task 2 / Task 3)

```bash
git diff --stat main..HEAD -- .claude/agents/
```

Expected: ~27-30 total lines changed (25 tools normalizations + 2 memory removals + 3 anchor fixes). No new files / deletions.

- [ ] **Step 5: Verify CLAUDE.md / AGENTS.md cross-references**

CLAUDE.md has a `.claude/agents/<name>.md` line (around line 253), but no links to specific subagent names—just format description. Confirm no CLAUDE.md update is needed for this change:

```bash
grep -nE '\.claude/agents/' CLAUDE.md AGENTS.md 2>/dev/null
```

Expected: only CLAUDE.md line 253 hits (generic subagent description `frontmatter name / description / tools: (least privilege) / model: sonnet / memory: project`). No specific agent name refs, so no update needed.

- [ ] **Step 6: Final report**

Include in completion report:

- SHAs of 3 commits
- Changed file counts (25 normalizations / 2 memory removals / 3 anchor fixes; total 27-28 files touched)
- Rationale for keeping 13 backing dirs and removing 2
- Zero duplicates/dead detected

Append "✅ C2 complete" to `project_clean-break-refactor-handoff.md` in `MEMORY.md`.

---

## Self-review notes

**Spec coverage:**

- ✅ Official docs compliance → canonicalize tools in Phase 1 (comma-separated)
- ✅ Least-privilege tools → pre-audited, no change (already Read/Grep/Glob-based; write permissions only for test-writer / e2e-test-writer / design-memory)
- ✅ Proactive description pattern → trigger phrases preconfirmed in all 25, no change
- ✅ memory: project only when needed → remove 2 orphans in Phase 2
- ✅ Duplicate/dead subagents fully removed → zero detected in pre-audit, recheck in Phase 4

**Type consistency:** Identifiers used across phases (agent name / file path / § section anchor) are verified via pre-grep. Steps 2-3 re-fetch the exact sub-file name + § at runtime, avoiding hardcoded values in the plan.

**Placeholder scan:** No placeholder phrases like "TBD", "implement later", "Add appropriate". Each step includes real code and exact grep commands.

**Risk:**

- Sub-file names may differ from pre-audit by Phase 3 (if additional splits after C1) → mitigate by runtime grep in Steps 2-3
- If `description: >` block scalar indentation breaks in Phase 1, YAML parser errors; detect via the Phase 1 step 5 `---` count check

---

## Launch instructions (short prompt for implementer)

```
Execute docs/superpowers/plans/2026-04-28-agents-cleanup.md with subagent-driven-development. Proceed in Phase 1 / 2 / 3 / 4 order, commit at the final step of each phase, and run final verification in Phase 4 after all 3 commits complete.
Implementer model is sonnet, and git is restricted to add / commit only (reset / restore / stash fully prohibited).
```
