# ActionResult / createSuccess / createFailure rule docs drift resolution Implementation Plan

> **In Progress: 2026-04-29** — Waiting on a single commit to resolve helper/type/import drift across 8 files under `.claude/rules/`. No `src/` implementation changes, no ADR needed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align helper/type/import references across the 8 `.claude/rules/` files with the implementation (`executeAdminMutationResult` + `MutationResult<T>`), and fully remove references to fictional symbols like `createSuccess` / `createFailure` / `ActionResult`.

**Architecture:** One commit / batch update of 8 files / apply Patterns A–F / 5 grep verifications / no `src/` changes / no ADR.

**Tech Stack:** Markdown (rule docs only), bash grep verification, lefthook pre-commit (prettier-fix only).

**Spec:** `docs/superpowers/specs/2026-04-28-action-result-rule-docs-drift-design.md` (commits `3b02387d` + `082719ee`)

---

## File Structure

Target files (see spec § Modification Targets):

| #   | File                                           | Applied Pattern               |
| --- | ---------------------------------------------- | ----------------------------- |
| 1   | `.claude/rules/error-handling.md`              | A, B, C, D, E                 |
| 2   | `.claude/rules/auth-patterns.md`               | A, B, D                       |
| 3   | `.claude/rules/frontend/admin-ui-patterns.md`  | Delete section (related to D) |
| 4   | `.claude/rules/code-quality.md`                | A, B, D                       |
| 5   | `.claude/rules/test-quality.md`                | A, D                          |
| 6   | `.claude/rules/server-actions/prohibitions.md` | A                             |
| 7   | `.claude/rules/server-actions/use-cache.md`    | A                             |
| 8   | `.claude/rules/type-safety.md`                 | F (delete §4)                 |

**Pattern list** (see spec for details):

- **A**: Remove `success: (result) => createSuccess(...)` callbacks inside `executeAdminMutationResult` (no `success` property in implementation)
- **B**: `createFailure("...")` → `createMutationError("...")`
- **C**: `createValidationError` → `createValidationMutationError`
- **D**: Replace imports from `@/admin/types/server-actions` / `@/shared/types/server-actions` (nonexistent) with `@/shared/lib/mutation-result` / `@/admin/lib/admin-action` / `@/shared/lib/action-helpers` (existing)
- **E**: `error-handling.md` only — replace the `ActionResult<TData>` section with `MutationResult<T> = T | MutationError`
- **F**: `type-safety.md` §4 exception section (“TypeScript 6.0 conditional types (`as unknown as T`)”) fully removed (uses fictional `ActionSuccess<T>`)

---

## Tasks

### Task 1: Baseline grep count (pre-change snapshot)

**Files:** None (read-only verification)

**Goal:** Record the count of forbidden symbols before changes to justify the Task 10 "0 hits" verification.

- [ ] **Step 1: Grep all forbidden symbols and count by file**

```bash
grep -rnE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/ | wc -l
```

Expected: **71 hits** (current baseline at commit `da3e2ede`)

- [ ] **Step 2: Capture per-file counts**

```bash
grep -rcE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/ | grep -v ":0$"
```

Expected (order may vary):

- `.claude/rules/auth-patterns.md:11`
- `.claude/rules/error-handling.md:34`
- `.claude/rules/code-quality.md:4`
- `.claude/rules/frontend/admin-ui-patterns.md:8`
- `.claude/rules/server-actions/use-cache.md:2`
- `.claude/rules/test-quality.md:9`
- `.claude/rules/server-actions/prohibitions.md:1`
- `.claude/rules/type-safety.md:2`

Total: 71 hits / 8 files.

If the numbers differ, rule docs were updated on another branch before this plan started. Record the measured baseline in Task 1 and proceed (Task 10 verification stays fixed to "0 forbidden patterns," not the measured baseline).

---

### Task 2: Update `error-handling.md` (establish canonical SSoT section first)

**Files:**

- Modify: `.claude/rules/error-handling.md`

**Apply Patterns:** A, B, C, D, E

**Goal:** Replace the core drift section (“`ActionResult` type definition + createSuccess/createFailure helpers”) with `MutationResult<T>` + `createMutationError`. Tasks 3–9 will cross-reference this file.

- [ ] **Step 1: Locate current drift with grep**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/error-handling.md
```

Expected: 34 hits (Task 1 baseline)

- [ ] **Step 2: Replace the “ActionResult” section (including `### createSuccess / createFailure`)**

Replace the entire `## ActionResult` section (`### createSuccess / createFailure`, type definitions, and example code) with the following new section:

````markdown
## MutationResult<T>

### createMutationError / isMutationError

Always use helpers from `@/shared/lib/mutation-result`. Do not return object literals directly:

```typescript
import {
  createMutationError,
  isMutationError,
  type MutationResult,
  type MutationError,
} from "@/shared/lib/mutation-result";

// NG: return object literal directly
return { error: "Error" };
return { error: "...", fieldErrors: { ... } };

// OK: helper usage (failure path)
return createMutationError("An error occurred");
return createMutationError("There are errors in the input", { email: ["Invalid email"] }); // with fieldErrors

// OK: success path returns T directly (no wrapper)
return { id: post.id };
```
````

Type definitions:

```typescript
// Failure
type MutationError = {
  readonly error: string;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
};

// Union (success: T | failure: MutationError)
type MutationResult<T = null> = T | MutationError;

// Predicate
function isMutationError(result: unknown): result is MutationError;
```

`executeAdminMutationResult` returns `MutationResult<TData>`. The `execute` return value `TData` is the success path (no wrapper), while a `DomainError` throw is automatically converted to `MutationError` (failure path).

````

- [ ] **Step 3: Standardize validation helper name with Pattern C**

```typescript
// Old
import { createValidationError } from "@/shared/lib/action-helpers";
const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationError(parsed.error);
}

// New
import { createValidationMutationError } from "@/shared/lib/action-helpers";
const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationMutationError(parsed.error);
}
````

- [ ] **Step 4: Rewrite examples in “Server Actions error patterns” and “Auth error (executeAdminMutationResult — recommended pattern)” using Patterns A + B + D**

```typescript
"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export const createPost = async (input: CreatePostInput) => {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

Update the text describing `executeAdminMutationResult` automatic handling:

- `Catch DomainError → convert with createFailure(error.message)` → `Catch DomainError → auto-convert to MutationError ({ error: error.message, code: error.code })`

- [ ] **Step 5: Apply Patterns A + B to examples in “Database error,” “Business logic error (early return),” and “Domain-specific error (ReservationOverlapError)”**

Apply these replacements (find via grep for `createSuccess` / `createFailure`):

```typescript
// Old
success: () => createSuccess("Space updated"),
success: () => createSuccess("Published"),

// New (Pattern A: remove success callback)
// (delete only — return value from execute directly)

// Old
return createFailure(error.message);
return createFailure("Failed to create reservation");
return createFailure("Operation failed");

// New (Pattern B)
return createMutationError(error.message);
return createMutationError("Failed to create reservation");
return createMutationError("Operation failed");
```

- [ ] **Step 6: Update “Prohibitions” §4**

```markdown
4. **Do not return MutationResult via object literals**
   - failure path: use `createMutationError()`
   - success path: return domain command result `T` directly (no wrapper)
```

- [ ] **Step 7: Confirm `@/admin/lib/admin-action` / `@/shared/lib/mutation-result` entries in the “File placement” table (skip if already correct)**

- [ ] **Step 8: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/error-handling.md
```

Expected: 0 hits

---

### Task 3: Update `auth-patterns.md`

**Files:**

- Modify: `.claude/rules/auth-patterns.md`

**Apply Patterns:** A, B, D

**Goal:** Align `executeAdminMutationResult` examples and NG patterns in auth-patterns.md with the implementation.

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "createSuccess|createFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/auth-patterns.md
```

Expected: 11 hits

- [ ] **Step 2: Rewrite the “executeAdminMutationResult (write path — standard pattern)” example**

```typescript
// Old
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createSuccess } from "@/admin/types/server-actions";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    success: (result) => createSuccess("Created", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};

// New (Pattern A + D + C)
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
// Return type: MutationResult<{ id: string }> = { id: string } | MutationError
```

- [ ] **Step 3: Apply Pattern A to the “EDITOR role resource access control” example**

```typescript
// Old
return executeAdminMutationResult({
  resource: "page",
  action: "update",
  resourceId: id,
  checkResourceAccess: true,
  execute: async (user) => updatePageCommand(id, parsed.data),
  success: (result) => createSuccess("Updated", result),
});

// New
return executeAdminMutationResult({
  resource: "page",
  action: "update",
  resourceId: id,
  checkResourceAccess: true,
  execute: async (user) => updatePageCommand(id, parsed.data),
});
```

- [ ] **Step 4: Replace `createFailure("You do not have permission")` using Pattern B**

```typescript
// Old
if (session?.user.role !== "SUPER_ADMIN")
  return createFailure("You do not have permission");

// New
if (session?.user.role !== "SUPER_ADMIN")
  return createMutationError("You do not have permission");
```

- [ ] **Step 5: Replace `createFailure` import + usage in “Server Actions (cache() unused)” with Pattern B + D**

```typescript
// Old
import { createFailure } from "@/shared/types/server-actions";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createFailure("Login required");
  }
}

// New
import { createMutationError } from "@/shared/lib/mutation-result";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createMutationError("Login required");
  }
}
```

- [ ] **Step 6: Apply the same pattern to remaining sections (e.g., `/admin/api/(auth)/login` Server Action)**

Use `grep -nE "createSuccess|createFailure" .claude/rules/auth-patterns.md` to find remaining instances and apply Patterns A + B.

- [ ] **Step 7: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/auth-patterns.md
```

Expected: 0 hits

---

### Task 4: Update `frontend/admin-ui-patterns.md` (delete section)

**Files:**

- Modify: `.claude/rules/frontend/admin-ui-patterns.md`

**Apply Patterns:** D (delete section)

**Goal:** The “Server Actions type imports” section is dead because the `@/admin/types/server-actions` path does not exist. Remove the entire section.

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "createSuccess|createFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/frontend/admin-ui-patterns.md
```

Expected: 8 hits (all within the “Server Actions type imports” section and “Prohibitions #5”)

- [ ] **Step 2: Delete the entire “Server Actions type imports” section**

Delete this section completely (from the heading to the next `---` or `##`):

````markdown
## Server Actions type imports

In the admin app, **all files** (Server Actions, `'use client'` components, hooks, and type definition files) should import from `@/admin/types/server-actions`:

```typescript
// OK: Admin-only (Server Actions, 'use client' components, hooks)
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";

// NG: Import shared types directly (forbidden in admin app)
import { createSuccess, createFailure } from "@/shared/types/server-actions";
```
````

`@/admin/types/server-actions` re-exports `@/shared/types/server-actions` and also provides `AuditUser`.

---

````

- [ ] **Step 3: Remove “Prohibitions #5: Do not use `@/shared/types/server-actions` directly in admin”**

Delete the line and shift subsequent prohibition numbers up (#5 → #6 → #5, etc.).

- [ ] **Step 4: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/frontend/admin-ui-patterns.md
````

Expected: 0 hits

---

### Task 5: Update `code-quality.md`

**Files:**

- Modify: `.claude/rules/code-quality.md`

**Apply Patterns:** A, B

**Goal:** Apply Patterns A + B to example code.

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "createSuccess|createFailure" .claude/rules/code-quality.md
```

Expected: 4 hits

- [ ] **Step 2: Rewrite the OK example in §1 “No hollow implementations”**

```typescript
// Old
export async function deleteItem(id: string) {
  return executeAdminMutationResult({
    resource: "item",
    action: "delete",
    execute: async () => {
      const item = await prisma.item.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!item) return createFailure("Item not found");

      await prisma.item.delete({ where: { id } });
      updateTag(CACHE_TAGS.ITEMS);
      return createSuccess("Deleted");
    },
  });
}

// New (Pattern A + B)
export async function deleteItem(id: string) {
  return executeAdminMutationResult({
    resource: "item",
    action: "delete",
    resourceId: id,
    execute: async () => {
      const item = await prisma.item.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!item) throw new DomainError("Item not found", "NOT_FOUND");

      await prisma.item.delete({ where: { id } });
      return { id };
    },
    afterSuccess: () => updateTag(CACHE_TAGS.ITEMS),
  });
}
```

(Note: `if (!item) return createFailure(...)` is not canonical inside the `execute` callback of `executeAdminMutationResult`; throw `DomainError` instead. `createMutationError` is for returning directly from a Server Action outside the callback.)

- [ ] **Step 3: Rewrite the error handling example in §“Must-have items” §4 using Pattern B**

```typescript
// Old
import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "deleteItem" },
  });
  return createFailure("Operation failed");
}

// New
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { createMutationError } from "@/shared/lib/mutation-result";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "deleteItem" },
  });
  return createMutationError("Operation failed");
}
```

- [ ] **Step 4: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/code-quality.md
```

Expected: 0 hits

---

### Task 6: Update `test-quality.md`

**Files:**

- Modify: `.claude/rules/test-quality.md`

**Apply Patterns:** A, D

**Goal:** Replace the `createSuccess` inference samples with `MutationResult<T>` inference samples.

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "createSuccess|ActionSuccess" .claude/rules/test-quality.md
```

Expected: 9 hits (all `createSuccess` inference samples + ActionSuccess references)

- [ ] **Step 2: Replace the “type inference” example section (around test-quality.md:253)**

```typescript
// Old
return createSuccess({ name }); // type may not infer
return createSuccess({ name });
const success = createSuccess(); // ActionSuccess<void>

// New (Pattern A + D)
return { name }; // execute callback return, type becomes MutationResult<{ name: string }>
return { name };
return null; // void success path: MutationResult<null> = null | MutationError
```

Read the surrounding context and rewrite while preserving meaning. Explicitly note that `MutationResult<T = null>` uses `null` as the success-path sentinel.

- [ ] **Step 3: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/test-quality.md
```

Expected: 0 hits

---

### Task 7: Update `server-actions/prohibitions.md`

**Files:**

- Modify: `.claude/rules/server-actions/prohibitions.md`

**Apply Patterns:** A

**Goal:** Rewrite one example.

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "createSuccess|createFailure" .claude/rules/server-actions/prohibitions.md
```

Expected: 1 hit (around line 77)

- [ ] **Step 2: Rewrite the example using Pattern A**

```typescript
// Old
return createSuccess("Deleted");

// New (success path returns T directly; for deletions null = MutationResult<null> default)
return null;
```

Depending on context, you can replace with a meaningful return like `return { id }`. Use `Read` to check surrounding context before deciding.

- [ ] **Step 3: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/server-actions/prohibitions.md
```

Expected: 0 hits

---

### Task 8: Update `server-actions/use-cache.md`

**Files:**

- Modify: `.claude/rules/server-actions/use-cache.md`

**Apply Patterns:** A

**Goal:** Rewrite two example blocks.

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "createSuccess|createFailure" .claude/rules/server-actions/use-cache.md
```

Expected: 2 hits (around lines 142 and 153)

- [ ] **Step 2: Rewrite the examples using Pattern A**

```typescript
// Old (around line 142)
return createSuccess("Post created", { id: post.id });

// New
return { id: post.id };

// Old (around line 153)
return createSuccess("Post deleted");

// New
return null;
```

- [ ] **Step 3: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/server-actions/use-cache.md
```

Expected: 0 hits

---

### Task 9: Apply Pattern F to `type-safety.md` (delete §4)

**Files:**

- Modify: `.claude/rules/type-safety.md`

**Apply Patterns:** F

**Goal:** Remove the §4 exception section “TypeScript 6.0 conditional types (`as unknown as T`)” (uses fictional `ActionSuccess<T>`).

- [ ] **Step 1: Locate targets with grep**

```bash
grep -nE "ActionSuccess" .claude/rules/type-safety.md
```

Expected: 2 hits (around lines 209–210)

- [ ] **Step 2: Delete the entire §4 exception block**

Delete the following block (around lines 205–211) from `type-safety.md`:

````markdown
**4. TypeScript 6.0 conditional types (`as unknown as T`)**

```typescript
// OK: assignment into conditional types (stricter in TS 6.0)
// ActionSuccess<T> is conditional, so a direct `as` is invalid; use two-step cast
return result as unknown as ActionSuccess<T>;
```
````

````

After deletion, keep the numbering of `**5. keysOf / entriesOf / omitUndefined**` as-is (remain `5.` for grep compatibility).

- [ ] **Step 3: Check for cross-references to §4**

Verify that no other sections reference it:

`grep -n "§4\|Exception 4" .claude/rules/type-safety.md`

Expected: 0 cross-references (update any referencing text if found).

- [ ] **Step 4: Verify 0 hits after update**

```bash
grep -nE "createSuccess|createFailure|createValidationError\b|ActionResult|ActionSuccess|ActionFailure|@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/type-safety.md
````

Expected: 0 hits

---

### Task 10: Overall verification (grep ground truth for drift resolution)

**Files:** None (read-only verification)

**Goal:** Confirm drift resolution using the five grep commands in spec § Verification.

- [ ] **Step 1: Confirm 0 hits for forbidden symbols**

```bash
grep -rnE "createSuccess|createFailure|ActionResult|ActionSuccess|ActionFailure" .claude/rules/
```

Expected: **0 hits**

- [ ] **Step 2: Confirm 0 hits for forbidden import paths**

```bash
grep -rnE "@/admin/types/server-actions|@/shared/types/server-actions" .claude/rules/
```

Expected: **0 hits**

- [ ] **Step 3: Confirm naming normalization**

```bash
grep -rnE "createValidationError\b" .claude/rules/
```

Expected: **0 hits** (canonical is `createValidationMutationError`)

```bash
grep -rnE "createValidationMutationError" .claude/rules/
```

Expected: **1+ hits** (canonical references)

- [ ] **Step 4: Sanity-check canonical helpers/types are present**

```bash
grep -rnE "createMutationError|MutationResult<|isMutationError" .claude/rules/
```

Expected: hits present (exact count not required; expect multiple hits from `error-handling.md` MutationResult<T> section + examples)

```bash
grep -rnE "@/admin/lib/admin-action|@/shared/lib/mutation-result" .claude/rules/
```

Expected: hits present

- [ ] **Step 5: Confirm no new symbols were added in implementation (no src changes)**

```bash
git diff --stat src/
```

Expected: **0 files changed**

- [ ] **Step 6: Sanity-check overall diff**

```bash
git diff --stat .claude/rules/
```

Expected: 8 files changed (matches Modification Targets)

```bash
git status --short
```

Expected: all 8 files show ` M` (modified); no `??` (untracked) or `D` (deleted)

---

### Task 11: Commit (all 8 files in one commit)

**Files:** None (commit only)

**Goal:** Consolidate the drift fix into a single commit. Avoid intermediate drift states.

- [ ] **Step 1: Stage only the 8 target files (avoid other untracked/modified files)**

```bash
git add .claude/rules/error-handling.md .claude/rules/auth-patterns.md .claude/rules/frontend/admin-ui-patterns.md .claude/rules/code-quality.md .claude/rules/test-quality.md .claude/rules/server-actions/prohibitions.md .claude/rules/server-actions/use-cache.md .claude/rules/type-safety.md
```

- [ ] **Step 2: Final staged diff check**

```bash
git diff --cached --stat
```

Expected: 8 files changed, no `src/` / `package.json` / `bun.lock` / `prisma/migrations/`.

- [ ] **Step 3: Commit (Conventional Commits; lefthook enforces type)**

```bash
git commit -m "$(cat <<'EOF'
docs(rules): align createSuccess/createFailure drift with MutationResult/createMutationError

Eight files under .claude/rules/ referenced createSuccess / createFailure / ActionResult<TData>
and the @/admin/types/server-actions path, which do not exist in src. The implementation
uses MutationResult<T> = T | MutationError and createMutationError. Update the rule docs
to match implementation per Patterns A–F. No implementation changes, no ADR.

Spec: docs/superpowers/specs/2026-04-28-action-result-rule-docs-drift-design.md
Closes: Clean-Break Refactor C5 Phase 4 Finding 2 carryover
EOF
)"
```

Expected: lefthook prettier-fix / protected-files / conventional-commits pass, commit succeeds.

- [ ] **Step 4: Final check after commit**

```bash
git log --oneline -1
```

Expected: commit message starts with `docs(rules): createSuccess/createFailure drift ...`, SHA recorded.

```bash
git diff HEAD~1 --stat
```

Expected: 8 files changed, insertions/deletions align with expected rule doc edit size (approx. 200–300 lines).

- [ ] **Step 5: Mark Finding 2 as completed in handoff memory**

Add a completion note to the `## Carryover: Finding 2` section in `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-c5-handoff.md`:

```markdown
### Carryover: Finding 2 (createSuccess / createFailure drift)

✅ **Completed: 2026-04-28** — resolved in `docs/superpowers/plans/2026-04-28-action-result-rule-docs-drift-fix.md`, commit `<NEW SHA>`. Approach 1 (align rule docs to implementation) updated 8 files, no implementation changes, no ADR.

(Keep the existing content below.)
```

---

## Self-Review

**1. Spec coverage:**

- Spec § Modification Targets: all 8 files covered in Tasks 2–9 ✅
- Spec § Replacement Patterns A–F: all applied within tasks ✅
- Spec § Verification 5 grep cmds: covered in Task 10 Steps 1–5 ✅
- Spec § Phase / Commit Plan (1 commit): implemented in Task 11 ✅

**2. Placeholder scan:** TBD / TODO / "implement later" / "Similar to Task N" none ✅

**3. Type consistency:**

- `createMutationError` / `createValidationMutationError` / `MutationResult<T>` / `MutationError` / `executeAdminMutationResult` / `isMutationError` naming is consistent across all tasks ✅
- Import paths (`@/shared/lib/mutation-result` / `@/admin/lib/admin-action` / `@/shared/lib/action-helpers`) are consistent across all tasks ✅

**4. Intermediate type-check state:** Only rule docs are updated, so no impact on type-check/lint. No intermediate commits needed (single commit).

---

## Execution Notes

### Notes for subagent dispatch

- **Git strictly forbidden** (add / commit / push / reset / checkout / restore / stash) — controller executes Task 11 commit
- **Import alias families** — `@/admin/*` / `@/public/*` / `@/shared/*` (used in rule doc examples; ensure subagent does not add wrong prefixes)
- **Plan deviation policy** — if extra fixes beyond Patterns A–F are needed, report as justified deviation (e.g., when context makes a replacement nonsensical, confirm via Read)
- **Bundle recommended** — Tasks 2–9 are tightly coupled (single commit), so dispatch to one implementer. Tasks 10–11 are executed by controller (verification + commit)

### Risk

- Rule doc examples can be long, so exact `old_string` matches may fail due to lint/prettier differences. If it fails, re-Read and retry with a longer context window.
- When deleting §4 in `type-safety.md`, blank-line counts will be auto-adjusted by prettier-fix; Step 2 does not require strict whitespace.

### Out-of-scope confirmation (matches spec § Out of Scope)

- No `src/` implementation changes
- No ADR numbering
- AGENTS.md / docs/architecture / docs/guides are handled in a separate plan
