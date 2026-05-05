> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Skills Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 3-axis audit for handoff C3 (`.claude/skills/**` cleanup), record the results as canonical, update handoff memory with a **C3 completion mark**, and add **C3b (`paths:` auto-activation enhancement)** as a future plan in the handoff.

**Architecture:** A pre-audit (see §Audit Summary in this plan) shows all 32 skills pass the three handoff axes (description required / under 500 lines / reference/\*.md split). Zero duplicates or dead skills. No clean-break targets → this plan is a lightweight **no-op + documentation + handoff update**. Follow-up improvements (official new `paths:` field for path-scoped autoload to reduce constant context pressure) are **retained in handoff as C3b** and executed in a separate plan/session.

**Tech Stack:** Markdown + YAML frontmatter only. No code changes. One plan commit + memory updates (gitignored).

---

## Audit summary (canonical record)

### Axis 1: description required

✅ **All 32 PASS** — zero missing descriptions. Zero over the 1,536 char limit (official spec).

- Block scalar `>` multiline: **11 files** (add-prisma-enum / add-settings-field / cloud-run-debug / create-admin-page / create-page-content / create-server-action / google-calendar-debug / instagram-debug / prisma-migration / split-action-file / stripe-debug)
- Single-line format: **21 files**
- Mixed languages: Japanese (~25 files) + English "Use when ..." style (3 files: `verify-subagent-report` / `worktree-bootstrap` / `create-section-type`) → CLAUDE.md global setting requires Japanese responses, but skill descriptions are used for Claude delegation, so both are valid. **No forced unification**.

### Axis 2: under 500 lines

✅ **All 32 PASS** — complies with official recommendation "Keep SKILL.md under 500 lines".

| Top 5 (longest)        | lines |
| ---------------------- | ----- |
| seed-audit             | 188   |
| create-page-content    | 182   |
| create-server-action   | 178   |
| instagram-debug        | 171   |
| verify-subagent-report | 152   |

Longest is 188 lines, **under 38%** of the official upper bound. Plenty of margin.

### Axis 3: reference/\*.md splits

✅ **Zero forced splits** — no skills over 200 lines.

Skills that already have references (8): frontend-design / add-prisma-enum / add-settings-field / cloud-run-debug / google-calendar-debug / parallax-section / create-admin-page / lexical-{node,plugin,toolbar}

### Axis 4 (out of handoff scope, zero detected): duplicates/dead

✅ **Zero detected** — all 32 functional scopes do not overlap.

- `frontend-design` vs `ui-ux-pro-max`: former creates briefs / latter researches UI direction — separate axes
- `lexical-audit` vs `lexical-{node,plugin,toolbar}`: former is audit-only / latter are for new additions — separate axes
- `cache-audit` vs `integration-audit`: former is updateTag/revalidateTag-only / latter spans cache + customer + auth + flows — overlapping but distinct; keep

### Axis 5 (official new fields unused, move to C3b)

Defined in the official spec but currently unused:

| Field                       | Current use | Planned use in C3b                                                                                                                                  |
| --------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paths:`                    | **0**       | Use path-scoped autoload to reduce constant context pressure (e.g., `prisma-migration` → `prisma/schema.prisma`, `lexical-*` → `src/**/lexical/**`) |
| `when_to_use:`              | 0           | Split triggers for long descriptions to improve readability                                                                                         |
| `arguments:`                | 0           | Complex skills using `$N` named positional args (currently none)                                                                                    |
| `argument-hint:`            | 9           | Already used                                                                                                                                        |
| `disable-model-invocation:` | 3           | Already used (adr-create / create-section-type / worktree-bootstrap)                                                                                |

**Conclusion:** The clean-break scope of this plan is definitively no-op. Improvements moved to C3b are a separate plan with clear ROI (reducing context pressure).

---

## File Structure

**Changes:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md` (add C3 completion mark + C3b launch command example)
- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md` (update C1–C4 progress line to show C3 complete)

**Create:**

- (none — this plan file `docs/superpowers/plans/2026-04-27-skills-cleanup.md` is the canonical audit record)

**Not created:**

- New SKILL.md (all 32 passed on 3 axes; no changes needed)
- New reference/\*.md (zero split targets)
- C3b plan file itself (only add launch command example to handoff; plan body created in another session)

---

## Task 1: Mark handoff memory C3 complete + add C3b

**Files:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md`

> Note: memory files under `~/.claude/` live in the user dir and are git-untracked. Not part of commits.

- [ ] **Step 1: Confirm current C3 block in handoff memory**

```bash
grep -nE '⬜ \*\*C3\*\*|^## Progress|^- ✅ \*\*C[12]' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md
```

- [ ] **Step 2: Mark C3 complete + add C3b future enhancement**

Replace the following block using the `Edit` tool:

Before:

```
- ⬜ **C3** — `.claude/skills/**` cleanup
- ⬜ **C4** — `docs/**` cleanup
```

After:

````
- ✅ **C3 complete (2026-04-27)** — `.claude/skills/**` cleanup audit (all 3 axes PASS, no-op)
  - Axis 1 description required: all 32 OK (within 1,536 char limit, max ~600 char)
  - Axis 2 under 500 lines: all 32 OK (max 188 lines = `seed-audit`, 38% of limit)
  - Axis 3 reference/*.md split: zero targets (no skills over 200 lines)
  - Duplicates/dead skill detection: zero
  - Canonical audit record: `docs/superpowers/plans/2026-04-27-skills-cleanup.md`
  - **No clean-break targets → zero refactor commits** (no implementation changes, plan + memory updates only)
  - **Unstarted → move to C3b**: official new `paths:` field path-scoped autoload to reduce context pressure (see below)
- ⬜ **C3b** — `.claude/skills/**` `paths:` enhancement (use official spec new field, reduce context pressure)
  - Scope: add `paths:` to path-bound skills such as prisma-migration / cache-audit / integration-audit / lexical-* (audit/node/plugin/toolbar) / use-server-audit / audit-settings-sections / adr-drift-audit / seed-audit / ssot-audit / verify-subagent-report
  - Effect: path-scoped autoload means descriptions only load when editing matching files → reduce always-on auto-load for the path-bound subset of all skill descriptions (~32 × 200-600 char ≒ 10-19KB)
  - Size: medium (~10-15 skills edited, 1 plan / 1 session, 5-10 commits expected)
  - Launch command example:
    ```
    Start the `.claude/skills/**` paths field auto-activation enhancement via the writing-plans skill.
    Plan location: docs/superpowers/plans/2026-04-XX-skills-paths-enhancement.md.
    Add the official spec paths field to each path-bound skill (prisma-migration / cache-audit / lexical-* / use-server-audit, etc.) to reduce context pressure.
    Decide each skill's path scope after reading the SKILL.md description / coverage.
    ```
- ⬜ **C4** — `docs/**` cleanup
````

- [ ] **Step 3: Post-edit verification**

```bash
grep -nE '✅ \*\*C3 complete|⬜ \*\*C3b|⬜ \*\*C4' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md
```

Expected: all three lines (C3 complete / C3b / C4) hit.

---

## Task 2: Update MEMORY.md C1-C4 progress line

**Files:**

- Modify: `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md`

- [ ] **Step 1: Confirm current C1-C4 line**

```bash
grep -nE 'Clean-Break Refactor C1-C4|project_clean-break-refactor-handoff' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md
```

- [ ] **Step 2: Update C2 completion line to include C3 completion**

Using the `Edit` tool:

Before:

```
- [project_clean-break-refactor-handoff.md](project_clean-break-refactor-handoff.md) — C1 complete (commits `ca0efd7e`–`5d298e74`, 6 commits) + C2 complete (commits `2c1b4efd`–`ca1727a5`, 3 commits, 25 agent files canonicalized). C3 (`.claude/skills/**`) / C4 (`docs/**`) untouched
```

After:

```
- [project_clean-break-refactor-handoff.md](project_clean-break-refactor-handoff.md) — C1 complete (commits `ca0efd7e`–`5d298e74`, 6 commits) + C2 complete (commits `2c1b4efd`–`ca1727a5`, 3 commits, 25 agent files canonicalized) + C3 complete (2026-04-27, no-op audit, all 3 axes PASS, zero refactor commits, canonical record in `docs/superpowers/plans/2026-04-27-skills-cleanup.md`). C3b (skills paths enhancement) / C4 (`docs/**`) untouched
```

- [ ] **Step 3: Post-edit verification**

```bash
grep -nE 'C3 complete|C3b' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md
```

Expected: one line hits both "C3 complete" and "C3b".

---

## Task 3: Commit the plan file

**Files:**

- New: `docs/superpowers/plans/2026-04-27-skills-cleanup.md` (this plan file itself)

- [ ] **Step 1: Check current git status**

```bash
git status --short docs/superpowers/plans/
```

Expected: `?? docs/superpowers/plans/2026-04-27-skills-cleanup.md` (untracked)

- [ ] **Step 2: Commit the plan**

```bash
git add docs/superpowers/plans/2026-04-27-skills-cleanup.md
git commit -m "$(cat <<'EOF'
docs(plan): record C3 skills audit (3 axes all PASS, no-op clean break)

Record the canonical audit results for handoff C3 (`.claude/skills/**` cleanup).
Pre-audit results: all 32 PASS across all three axes with zero refactor targets:

- Axis 1 description required: all 32 OK
- Axis 2 under 500 lines: all 32 OK (max 188 lines)
- Axis 3 reference/*.md split: zero targets
- Duplicates/dead skill detection: zero

Record the unused official new `paths:` field (path-scoped autoload to reduce context pressure) as future enhancement C3b in handoff.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verification**

```bash
git log --oneline -1
```

Expected: `<SHA> docs(plan): record C3 skills audit (3 axes all PASS, no-op clean break)`

---

## Task 4: Final verification

- [ ] **Step 1: Verify handoff memory consistency**

```bash
grep -E '^- (✅|⬜) \*\*C[1-4]' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md
```

Expected: five lines appear in order: C1 complete / C2 complete / C3 complete / C3b ⬜ / C4 ⬜.

- [ ] **Step 2: Verify MEMORY.md consistency**

```bash
grep -A 1 'Clean-Break Refactor C1-C4' ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/MEMORY.md
```

Expected: one line contains "C1 complete" + "C2 complete" + "C3 complete" + "C3b".

- [ ] **Step 3: Confirm the plan file is git tracked**

```bash
git ls-files docs/superpowers/plans/2026-04-27-skills-cleanup.md
```

Expected: a file path prints (non-empty).

- [ ] **Step 4: Check overall commit log**

```bash
git log --oneline -5
```

Expected: the latest 5 commits include this plan's commit.

---

## Self-review notes

**Spec coverage:**

- ✅ Official docs compliance (`code.claude.com/docs/en/skills`) → no-op with all axes 1-3 PASS
- ✅ Description required → all 32 OK
- ✅ Under 500 lines → all 32 OK
- ✅ reference/\*.md split → none
- ✅ Duplicate/dead skills fully removed → zero detected
- ✅ Handoff memory C3 completion mark → Task 1
- ✅ C3b future enhancement → retained in handoff

**Type consistency:** memory file path / plan file path / commit message are unified across all tasks.

**Placeholder scan:** No placeholders like "TBD", "implement later", "Add appropriate". Each step includes real commands and exact output.

**Risk:**

- Low — zero implementation changes, one commit (plan file) + memory updates (gitignored)
- Only risk: handoff memory Edit string collides with other text → Step 2 sets `old_string` to a sufficiently unique block

---

## Launch instructions (controller / implementer)

This plan is small (fewer than 3 commits, all non-destructive), so **inline execution** is recommended:

```
Run docs/superpowers/plans/2026-04-27-skills-cleanup.md via inline execution
(superpowers:executing-plans skill). Proceed in Task 1 → 2 → 3 → 4 order,
and finish with commit + verification.
```
