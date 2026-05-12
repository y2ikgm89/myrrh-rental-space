# Rule Docs 200-Line Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce all `.claude/rules/**/*.md` files exceeding 200 lines to under 200 lines each, by splitting into path-scoped sub-rules or trimming dense bullets into semantic sub-bullets, while preserving 100% of the existing rule content (no semantic loss).

**Architecture:** Apply the same pattern proven in commit `6b429773` (Group B): when a rule has multiple coherent sub-domains, extract each into its own path-scoped file under a sibling subdirectory; when a rule is single-domain but verbose, convert dense paragraph-style bullets into semantic sub-section trees. Every new file MUST have `paths:` frontmatter (常時ロード rule ゼロ維持 per `claude-code-patterns.md`).

**Tech Stack:** Markdown, Claude Code path-scoped rule auto-load, lefthook commit-msg conventional-commits + protected-files hooks.

---

## Background

Per `.claude/rules/claude-code-patterns.md` §「公式準拠の原則」 and the `200-line target` discussed in past sessions:

- 26 of 67 rule files exceed 200 lines (15,686 total lines, ~6,400 lines over target)
- All files already comply with the 公式 5 層 structure (rule / skill / memory / agent / hook)
- All files already have `paths:` frontmatter (常時ロード rule ゼロ)
- The remaining issue is verbosity within each rule file

Auto-load impact: when Claude reads any file matching a rule's `paths`, the entire rule file is injected as a `<system-reminder>`. Long files burn context. Per measurement in `MEMORY.md` `[project_claude-config-optimization.md]`: barrel rule removal alone cut per-turn injection from ~870 to ~250 lines (-71%). Reducing in-rule verbosity should give similar context savings.

## Refactor Patterns

### Pattern A: Sub-domain split (for files with multiple coherent ## sections)

When a rule covers N independent sub-domains (e.g., Prisma enums vs JSON fields vs queries), extract each into a sibling subdirectory:

```
.claude/rules/prisma-patterns.md  (was 825 lines)
                ↓
.claude/rules/prisma-patterns.md  (~150 lines: Better Auth boundary, Decimal, Lexical, file layout, Gotchas)
.claude/rules/prisma-patterns/enums.md  (~130 lines)
.claude/rules/prisma-patterns/json-fields.md  (~160 lines)
.claude/rules/prisma-patterns/queries.md  (~180 lines)
.claude/rules/prisma-patterns/migrations.md  (~70 lines)
```

Each new file gets a narrower `paths:` to load only when relevant code is opened. Cross-references in the original use relative path: `→ prisma-patterns/enums.md`.

### Pattern B: Semantic sub-bullet trim (for single-domain files with dense paragraphs)

When a rule is single-domain but bullets contain multi-sentence paragraphs, convert each dense bullet into a header + sub-bullet tree:

```markdown
<!-- Before (dense, ~5 lines per bullet) -->

- **Foo bar** — long sentence about why, with three different concerns wrapped together. Including specific examples like X, Y, Z and their tradeoffs.

<!-- After (semantic, ~5 lines but readable) -->

- **Foo bar**
  - **Why:** long sentence about why
  - **Concerns:** wrapped together with X / Y / Z
  - **Examples:** X (tradeoff a), Y (tradeoff b), Z (tradeoff c)
```

This typically reduces the file by 20-40% because verbose connectives ("、その上で" / "また" / etc.) get removed.

### Pattern C: Leave as-is + document rationale (for files at 200-250 lines that are single-domain and dense)

For files just over 200 lines where neither A nor B yields meaningful reduction without semantic loss, leave the file and add a `<!-- @keep-length: <reason> -->` comment after the title explaining why. Justification examples:

- "Single SOP that loses cohesion if split" (e.g., a 240-line state-machine guide)
- "Already in semantic sub-bullet form, just dense"

Pattern C MUST be the exception, not the rule. Most files in Tier 3 (200-300 lines) should still attempt Pattern B.

## File Tier Classification

### Tier 1: Top offenders, candidates for Pattern A split (12 files, all >500 lines)

| Lines | File                                | Tentative split                                   |
| ----- | ----------------------------------- | ------------------------------------------------- |
| 825   | `prisma-patterns.md`                | core / enums / json-fields / queries / migrations |
| 805   | `auth-patterns.md`                  | core / admin / customer-social / session-roles    |
| 683   | `frontend/admin-ui/forms.md`        | core / field-patterns / validation-ui             |
| 570   | `test-quality.md`                   | core / unit / integration / e2e                   |
| 548   | `ops/deployment-patterns.md`        | core / cloudbuild / probes / migrations           |
| 519   | `frontend/seo-patterns.md`          | core / metadata / structured-data / sitemap-feeds |
| 514   | `frontend/admin-ui/tables.md`       | core / sortable / pagination / actions            |
| 509   | `error-handling.md`                 | core / mutation-result / domain-error / logging   |
| 508   | `frontend/project-design-config.md` | (analyze: may be Pattern B)                       |
| 504   | `type-safety.md`                    | core / type-guards / zod-narrowing / dom-typing   |
| 503   | `bun-patterns.md`                   | core / test-runner / mock-module / scripts        |
| 500   | `frontend/lexical/nodes.md`         | core / decorator / inline / block                 |

### Tier 2: Mid offenders, mix of Pattern A/B (6 files, 300-500 lines)

| Lines | File                                 | Likely pattern                                  |
| ----- | ------------------------------------ | ----------------------------------------------- |
| 476   | `nuqs-patterns.md`                   | A (parsers / loaders / search-state) or B       |
| 454   | `react/compiler.md`                  | B (single-domain)                               |
| 362   | `zod-patterns/validation-schemas.md` | B                                               |
| 341   | `frontend/gsap/matchmedia.md`        | B                                               |
| 338   | `tailwind-patterns/theme-tokens.md`  | B                                               |
| 319   | `react/hooks.md`                     | A (form-hooks / lifecycle / data-fetching) or B |

### Tier 3: Slight offenders, Pattern B or C (8 files, 200-300 lines)

| Lines | File                                  | Likely pattern                                      |
| ----- | ------------------------------------- | --------------------------------------------------- |
| 271   | `server-actions/implementation.md`    | B                                                   |
| 260   | `frontend/admin-ui-patterns.md`       | B                                                   |
| 249   | `server-actions/use-cache.md`         | B                                                   |
| 238   | `frontend/accessibility/semantics.md` | B                                                   |
| 230   | `implementation-patterns.md`          | B (already partial-refactored in commit `6b429773`) |
| 219   | `ical-patterns.md`                    | C plausible                                         |
| 214   | `code-quality.md`                     | C plausible (just created in commit `6b429773`)     |
| 208   | `frontend/gsap/core.md`               | C plausible                                         |

## Verification (Per File)

After each file refactor, run:

- [ ] `wc -l .claude/rules/<file>` — main file < 200 lines
- [ ] `wc -l .claude/rules/<file-or-subdir>/*.md` — all new sub-files < 200 lines
- [ ] `bun run validate` — exit 0 (compile no impact, but confirms hooks not broken)
- [ ] `head -10 <new-file>` — has `paths:` frontmatter
- [ ] Grep cross-refs not broken: `grep -r "<old-rule-relative-path>" .claude/ AGENTS.md CLAUDE.md docs/` — only intentional references remain

---

## Task 1: Refactor `prisma-patterns.md` (825 → ~150 lines)

**Files:**

- Modify: `.claude/rules/prisma-patterns.md`
- Create: `.claude/rules/prisma-patterns/enums.md`
- Create: `.claude/rules/prisma-patterns/json-fields.md`
- Create: `.claude/rules/prisma-patterns/queries.md`
- Create: `.claude/rules/prisma-patterns/migrations.md`

- [ ] **Step 1: Read full file**

```bash
wc -l .claude/rules/prisma-patterns.md
```

Expected: 825

- [ ] **Step 2: Create `enums.md`** (lines 37-164 of original, ~130 lines)

Frontmatter `paths:`:

```yaml
paths:
  - src/shared/lib/validations/enums.ts
  - src/shared/generated/prisma/**
  - src/**/actions/**/*.ts
  - src/**/queries/**/*.ts
```

Move sections: `## Enum パターン`, `### 1〜8` subsections.

- [ ] **Step 3: Create `json-fields.md`** (lines 166-326, ~160 lines)

Frontmatter `paths:`:

```yaml
paths:
  - src/shared/db/**
  - src/shared/domain/**/*.ts
  - src/**/queries/**/*.ts
```

Move: `## JSON フィールドの型安全化` and all subsections including Date serialization.

- [ ] **Step 4: Create `queries.md`** (lines 447-625, ~180 lines)

Frontmatter `paths:`:

```yaml
paths:
  - src/**/queries/**/*.ts
  - src/shared/domain/**/*.ts
  - src/app/api/**
```

Move: `## クエリパターン` and all subsections including upsert race condition, select/include, list types, transactions.

- [ ] **Step 5: Create `migrations.md`** (lines 628-691 + relevant禁止事項, ~70 lines)

Frontmatter `paths:`:

```yaml
paths:
  - prisma/migrations/**
  - prisma/schema.prisma
```

Move: `## Prisma 7 CLI 変更`, `## Field rename`, `## Relation 追加時の scalar field 名前衝突`.

- [ ] **Step 6: Trim original to core**

Keep in `prisma-patterns.md`:

- frontmatter (broaden `paths:` slightly to retain `src/shared/db/**` + `src/app/api/**`)
- `## Better Auth との境界`
- `## Prisma クライアントの組み立て`
- `## PageContent`
- `## Decimal 自動変換`
- `## Lexical JSON Primary パターン`
- Updated `## 禁止事項` (entries not migrated to sub-files)
- `## ファイル配置`
- `## Gotchas` (Prisma + adapter-pg)

Add at end of relevant `##` heading: `> 詳細は \`prisma-patterns/<sub>.md\` を参照（path-scoped auto-load）。`

- [ ] **Step 7: Verify line counts**

```bash
wc -l .claude/rules/prisma-patterns.md .claude/rules/prisma-patterns/*.md
```

Expected: main < 200, each sub < 200, total ≈ 825 ± 20 lines (small overhead for new frontmatter blocks).

- [ ] **Step 8: Verify validate**

```bash
bun run validate
```

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add .claude/rules/prisma-patterns.md .claude/rules/prisma-patterns/
git commit -m "docs(rules): split prisma-patterns into 4 path-scoped sub-rules

825 → ~150 lines main + 4 sub-rules each <200, all path-scoped to
narrower auto-load triggers.

- prisma-patterns/enums.md: Prisma 7 mapped enums + 型ガード SSoT
- prisma-patterns/json-fields.md: Zod runtime validation + Date serialization
- prisma-patterns/queries.md: select/include/transaction/upsert
- prisma-patterns/migrations.md: 7 CLI changes + field rename + relation collision

Main keeps cross-domain core: Better Auth boundary / client extension /
Decimal / Lexical / 禁止事項 / Gotchas.
"
```

---

## Task 2: Refactor `auth-patterns.md` (805 → ~180 lines)

**Files:**

- Modify: `.claude/rules/auth-patterns.md`
- Create: `.claude/rules/auth-patterns/admin.md`
- Create: `.claude/rules/auth-patterns/customer-social.md`
- Create: `.claude/rules/auth-patterns/session-roles.md`

- [ ] **Step 1: Identify sections via grep**

```bash
grep -nE '^##' .claude/rules/auth-patterns.md
```

- [ ] **Step 2: Create `admin.md`** (move `## Server Action の認証パターン`, `## 監査ログ`, ~280 lines worth)

Frontmatter `paths:`:

```yaml
paths:
  - src/admin/lib/auth/**
  - src/**/actions/**/*.ts
  - src/app/(admin)/**
  - src/app/api/admin/**
```

- [ ] **Step 3: Create `customer-social.md`** (move `## 公開顧客認証` and all OAuth/encryption/ensureCustomerLinked subsections, ~280 lines)

Frontmatter `paths:`:

```yaml
paths:
  - src/customer/lib/auth/**
  - src/app/(public)/**
  - src/app/api/customer/**
  - src/**/actions/public/**
```

- [ ] **Step 4: Create `session-roles.md`** (move `## セッション取得パターン`, `## 型安全な Role 取得`, ~140 lines)

Frontmatter `paths:`:

```yaml
paths:
  - src/**/lib/auth/**
  - src/**/actions/**/*.ts
  - src/app/**/layout.tsx
  - src/app/**/page.tsx
```

- [ ] **Step 5: Trim main** (keep `## Better Auth 公式パターン`, `## 権限階層`, `## 禁止事項`, `## ファイル配置`)

- [ ] **Step 6-8: Verify + commit** (use Task 1 verify pattern + matching commit message)

---

## Task 3: Refactor `frontend/admin-ui/forms.md` (683 → ~180 lines)

**Files:**

- Modify: `.claude/rules/frontend/admin-ui/forms.md`
- Create: `.claude/rules/frontend/admin-ui/forms/field-patterns.md`
- Create: `.claude/rules/frontend/admin-ui/forms/validation-ui.md`

- [ ] **Step 1: Identify sub-domains via grep `^##` then read each section**

- [ ] **Step 2: Create `field-patterns.md`** (specific field types: AutoImageField, AutoSelectField, datetime-local, etc.)

- [ ] **Step 3: Create `validation-ui.md`** (Zod resolver, error display, submit-on-enter, etc.)

- [ ] **Step 4: Trim main** to form-shell architecture + AutoSectionForm + cross-cutting concerns

- [ ] **Step 5-7: Verify + commit**

---

## Task 4: Refactor `test-quality.md` (570 → ~180 lines)

**Files:**

- Modify: `.claude/rules/test-quality.md`
- Create: `.claude/rules/test-quality/unit.md`
- Create: `.claude/rules/test-quality/integration.md`
- Create: `.claude/rules/test-quality/e2e.md`

- [ ] **Steps 1-7:** Same pattern as Task 1. Pay attention to `paths:` for each sub-rule:
  - `unit.md`: `paths: __tests__/unit/**`
  - `integration.md`: `paths: __tests__/integration/**`
  - `e2e.md`: `paths: e2e/**`

---

## Task 5: Refactor `ops/deployment-patterns.md` (548 → ~180 lines)

**Files:**

- Modify: `.claude/rules/ops/deployment-patterns.md`
- Create: `.claude/rules/ops/deployment/cloudbuild.md`
- Create: `.claude/rules/ops/deployment/probes.md`
- Create: `.claude/rules/ops/deployment/migrations.md`

- [ ] **Steps 1-7:** Pattern A split. Probes paths: `src/app/api/{live,health}/**` + `src/middleware.ts`. Cloudbuild paths: `cloudbuild.yaml`, `Dockerfile`, `.github/workflows/**`. Migrations paths: `prisma/migrations/**`.

---

## Task 6: Refactor `frontend/seo-patterns.md` (519 → ~180 lines)

**Files:**

- Modify: `.claude/rules/frontend/seo-patterns.md`
- Create: `.claude/rules/frontend/seo/metadata.md`
- Create: `.claude/rules/frontend/seo/structured-data.md`
- Create: `.claude/rules/frontend/seo/sitemap-feeds.md`

- [ ] **Steps 1-7:** Pattern A split. Metadata paths: `**/page.tsx`, `**/layout.tsx`, `**/metadata.ts`. Structured-data paths: `src/**/JsonLd*.tsx`, `src/**/structured-data/**`. Sitemap-feeds paths: `src/app/{sitemap.xml,robots.txt,feed.xml}/**`.

---

## Task 7: Refactor `frontend/admin-ui/tables.md` (514 → ~180 lines)

**Files:**

- Modify: `.claude/rules/frontend/admin-ui/tables.md`
- Create: `.claude/rules/frontend/admin-ui/tables/sortable.md`
- Create: `.claude/rules/frontend/admin-ui/tables/pagination.md`
- Create: `.claude/rules/frontend/admin-ui/tables/actions.md`

- [ ] **Steps 1-7:** Pattern A split.

---

## Task 8: Refactor `error-handling.md` (509 → ~180 lines)

**Files:**

- Modify: `.claude/rules/error-handling.md`
- Create: `.claude/rules/error-handling/mutation-result.md`
- Create: `.claude/rules/error-handling/domain-error.md`
- Create: `.claude/rules/error-handling/logging.md`

- [ ] **Steps 1-7:** Pattern A split.

---

## Task 9: Refactor `frontend/project-design-config.md` (508 → ~180 lines)

- [ ] **Step 1: Read** to determine if Pattern A (split into design-tokens / breakpoints / typography / theme-application) or Pattern B (single-domain trim) applies.

- [ ] **Step 2-7:** Apply chosen pattern.

---

## Task 10: Refactor `type-safety.md` (504 → ~180 lines)

**Files:**

- Modify: `.claude/rules/type-safety.md`
- Create: `.claude/rules/type-safety/type-guards.md`
- Create: `.claude/rules/type-safety/zod-narrowing.md`
- Create: `.claude/rules/type-safety/dom-typing.md`

- [ ] **Steps 1-7:** Pattern A split.

---

## Task 11: Refactor `bun-patterns.md` (503 → ~180 lines)

**Files:**

- Modify: `.claude/rules/bun-patterns.md`
- Create: `.claude/rules/bun-patterns/test-runner.md`
- Create: `.claude/rules/bun-patterns/mock-module.md`
- Create: `.claude/rules/bun-patterns/scripts.md`

- [ ] **Steps 1-7:** Pattern A split. test-runner paths: `__tests__/**`. mock-module paths: `__tests__/**`. scripts paths: `scripts/**`, `prisma/seed.ts`.

---

## Task 12: Refactor `frontend/lexical/nodes.md` (500 → ~180 lines)

**Files:**

- Modify: `.claude/rules/frontend/lexical/nodes.md`
- Create: `.claude/rules/frontend/lexical/nodes/decorator.md`
- Create: `.claude/rules/frontend/lexical/nodes/inline.md`
- Create: `.claude/rules/frontend/lexical/nodes/block.md`

- [ ] **Steps 1-7:** Pattern A split.

---

## Task 13: Refactor `nuqs-patterns.md` (476 → ~180 lines)

- [ ] **Step 1: Decide A vs B.** Likely A: parsers / loaders / search-state.

- [ ] **Steps 2-7:** Execute chosen pattern.

---

## Task 14: Refactor `react/compiler.md` (454 → ~180 lines)

- [ ] **Step 1:** Likely Pattern B (single-domain compiler rules). Convert dense bullets to semantic sub-bullets.

- [ ] **Steps 2-7:** Pattern B trim.

---

## Task 15: Refactor `zod-patterns/validation-schemas.md` (362 → ~180 lines)

- [ ] **Steps 1-7:** Likely Pattern B trim.

---

## Task 16: Refactor `frontend/gsap/matchmedia.md` (341 → ~180 lines)

- [ ] **Steps 1-7:** Pattern B trim.

---

## Task 17: Refactor `tailwind-patterns/theme-tokens.md` (338 → ~180 lines)

- [ ] **Steps 1-7:** Pattern B trim.

---

## Task 18: Refactor `react/hooks.md` (319 → ~180 lines)

- [ ] **Step 1:** Decide A vs B.

- [ ] **Steps 2-7:** Execute.

---

## Task 19: Refactor `server-actions/implementation.md` (271 → ~180 lines)

- [ ] **Steps 1-7:** Pattern B trim.

---

## Task 20: Refactor `frontend/admin-ui-patterns.md` (260 → ~180 lines)

- [ ] **Steps 1-7:** Pattern B trim.

---

## Task 21: Refactor `server-actions/use-cache.md` (249 → ~180 lines)

- [ ] **Steps 1-7:** Pattern B trim.

---

## Task 22: Refactor `frontend/accessibility/semantics.md` (238 → ~180 lines)

- [ ] **Steps 1-7:** Pattern B trim.

---

## Task 23: Refactor `implementation-patterns.md` (230 → ~180 lines)

- [ ] **Step 1:** Already partially refactored (`6b429773`). Check current state and trim further.

- [ ] **Steps 2-7:** Pattern B trim or Pattern C if already optimal.

---

## Task 24: Refactor `ical-patterns.md` (219 → < 200 lines)

- [ ] **Step 1:** Determine B or C.

- [ ] **Steps 2-7:** Likely Pattern B (small trim) or Pattern C (justify keep).

---

## Task 25: Refactor `code-quality.md` (214 → < 200 lines)

- [ ] **Step 1:** File just created in `6b429773`, may already be near-optimal. Determine B or C.

- [ ] **Steps 2-7:** Trim or justify keep.

---

## Task 26: Refactor `frontend/gsap/core.md` (208 → < 200 lines)

- [ ] **Step 1:** Determine B or C.

- [ ] **Steps 2-7:** Pattern B (small trim, 8 lines) or Pattern C (justify keep).

---

## Final Verification

- [ ] **Step 1: Re-list 200+ files**

```bash
find .claude/rules -name "*.md" -type f -exec wc -l {} + 2>&1 | sort -rn | awk '$1 > 200 && $2 != "total" {print}'
```

Expected: empty (or only Pattern C files with documented `<!-- @keep-length -->` comment).

- [ ] **Step 2: Validate**

```bash
bun run validate
```

Expected: exit 0.

- [ ] **Step 3: Cross-ref scan**

```bash
grep -rn "implementation-quality.md" .claude/ AGENTS.md CLAUDE.md docs/superpowers/ 2>/dev/null
```

Expected: 0 hits (already verified in commit `3e1874d6`, but re-confirm post-refactor).

- [ ] **Step 4: Total line check**

```bash
find .claude/rules -name "*.md" -type f -exec wc -l {} + | tail -1
```

Expected: total within 5% of pre-refactor 15,686 (refactor should be content-preserving; small +/- from new frontmatter blocks is expected).

## Execution Strategy

This plan has 26 independent tasks. Recommended execution:

1. **Task 1 (prisma-patterns)** — execute solo first as the canonical Pattern A example
2. **Tasks 2-12 (Tier 1 remainder, all Pattern A)** — dispatch as 3-4 parallel subagent batches (3-4 files per batch). Each subagent gets one self-contained task description.
3. **Tasks 13-18 (Tier 2)** — dispatch as 1-2 parallel batches
4. **Tasks 19-26 (Tier 3, Pattern B/C)** — dispatch as 1 batch (lighter work each)

Total estimated wall-clock: 4-6 hours with 3-4 parallel subagents. Single-session feasible only with parallelization.

**Per-batch handoff for subagent:** include this plan's URL + the specific task numbers in the subagent prompt. Subagent commits per task. Controller verifies via `git log --oneline` + line count grep after each batch.
