> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 1 — Admin Bulk Actions Implementation Plan

> **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase1-design.md`
> **Scope**: add bulk publish/unpublish/delete to spaces / events / news (3 areas)
> **Bundle structure**: 3 Bundles (A/B/C) = 3 commits; each bundle can be dispatched in parallel

## Context

Align bulk actions on `/admin` list pages for spaces / events / news, following `posts` / `pages` / `reservations` / `faq`. This is a straight symmetry task: copy the existing `PostBulkActions` pattern (`PostBulkActions.tsx` 141 lines + `bulk-commands.ts` + `actions/post/bulk.ts`) as the reference implementation.

Each bundle targets an independent resource with **no file conflicts**, so parallel dispatch is possible. The controller only performs git verification after dispatch.

---

## Bundle A — Spaces Bulk

**Commit message**: `feat(admin): bulk publish/delete actions for spaces`

### Files to create

1. `src/shared/domain/spaces/bulk-commands.ts` (new)
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/space/bulk.ts` (new)
3. `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceBulkActions.tsx` (new)
4. `__tests__/unit/domain/spaces/bulk-commands.test.ts` (new)
5. `__tests__/integration/actions/admin/space-bulk.test.ts` (new)

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx` — row checkboxes + `selectedIds` state + place `<SpaceBulkActions />`
2. `src/app/(admin)/admin/(dashboard)/spaces/_components/space-table-desktop.tsx` — desktop variant adjustments as needed
3. `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` — add `bulk.ts` re-export (if barrel pattern is used)
4. `package.json` — add `bun test __tests__/unit/domain/spaces/bulk-commands.test.ts` to `test:unit` batch

### Tasks

#### A1. domain command (`bulk-commands.ts`)

Reference implementation: `src/shared/domain/posts/bulk-commands.ts`

```typescript
import "server-only";

import { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";

export type BulkPublishResult = {
  count: number;
  isPublished: boolean;
  affectedSlugs: string[];
};

export type BulkDeleteResult = {
  count: number;
  skipped: number;
  affectedSlugs: string[];
};

export async function bulkTogglePublishedSpacesCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishResult> {
  if (ids.length === 0)
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  const now = new Date();
  // updateMany cannot return updated slugs, so fetch slugs first → updateMany
  const targets = await prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const result = await prisma.space.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isPublished: publish, publishedAt: publish ? now : null },
  });
  return {
    count: result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

export async function bulkDeleteSpacesCommand(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { count: 0, skipped: 0, affectedSlugs: [] };
  const targets = await prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  let count = 0;
  let skipped = 0;
  const affectedSlugs: string[] = [];
  // Delete sequentially to catch individual P2003 FK constraints (Reservation.spaceId)
  for (const target of targets) {
    try {
      await prisma.space.delete({ where: { id: target.id } });
      count += 1;
      affectedSlugs.push(target.slug);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { count, skipped, affectedSlugs };
}
```

**Discipline**:

- `import "server-only"` is required
- The `Prisma` namespace should go through the `@/shared/lib/validations/enums/prisma-types` gateway (since `PrismaClientKnownRequestError` is not a runtime sentinel, gateway is OK). If only types are needed, `import type { Prisma }` is fine
- However, `Prisma.PrismaClientKnownRequestError` is used for **value checks** (`instanceof`), so a runtime import is required. Implementers should import directly via `import { Prisma } from "@generated/prisma/client"` (domain layer is not prohibited). Verify whether `instanceof` works through the gateway

#### A2. Server Action (`actions/space/bulk.ts`)

Reference implementation: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts`

```typescript
"use server";

import { z } from "zod";
import {
  bulkTogglePublishedSpacesCommand,
  bulkDeleteSpacesCommand,
  type BulkPublishResult,
  type BulkDeleteResult,
} from "@/shared/domain/spaces/bulk-commands";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateSpaceCaches } from "@/shared/lib/cache/space-cache"; // existing helper
import { createValidationError } from "@/admin/types/server-actions";
import type { MutationResult } from "@/shared/lib/mutation-result";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "Invalid ID" }))
    .min(1, { error: "Select at least 1 item" })
    .max(100, { error: "You can process up to 100 items at once" }),
});

export const bulkTogglePublishedSpaces = async (
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationError(parsed.error);
  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    execute: async () =>
      bulkTogglePublishedSpacesCommand(parsed.data.ids, publish),
    afterSuccess: async (data) => {
      // CACHE_TAGS.SPACES + per-slug detail tag cascade
      for (const slug of data.affectedSlugs) {
        // follow existing helper or invalidateSpaceCaches(undefined, slug) pattern
      }
    },
  });
};

export const bulkDeleteSpaces = async (
  ids: string[],
): Promise<MutationResult<BulkDeleteResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationError(parsed.error);
  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    execute: async () => bulkDeleteSpacesCommand(parsed.data.ids),
    afterSuccess: async (data) => {
      for (const slug of data.affectedSlugs) {
        // cache invalidation
      }
    },
  });
};
```

**Implementer notes**:

- Confirm the exact `invalidateSpaceCaches` signature in `src/shared/lib/cache/space-cache.ts`. If no bulk version exists, loop ids and call the existing helper
- Confirm the import path for `createValidationError` in `@/admin/types/server-actions`
- `executeAdminMutationResult` `action` must be a value in the `Action` enum (`@/admin/lib/admin-resources` or `permissions.ts`) — verify `publish` / `delete` exist

#### A3. UI (`SpaceBulkActions.tsx`)

Reference implementation: duplicate `src/app/(admin)/admin/(dashboard)/posts/_components/PostBulkActions.tsx`.

Differences:

- `bulkTogglePostPublished` → `bulkTogglePublishedSpaces`
- `bulkDeletePosts` → `bulkDeleteSpaces`
- toast: `${count} spaces published` / `${count} published, ${skipped} skipped (FK constraints)`
- delete toast: `${count} deleted, ${skipped} skipped (linked reservations)`
- pre-delete confirmation: integrate `DeleteConfirmDialog` (see `pages/_components/BulkActions.tsx`)

#### A4. Table refactor (`SpaceTable.tsx` / `space-table-desktop.tsx`)

1. Confirm `"use client"` (already client)
2. Add `selectedIds` via `useState<string[]>([])`
3. Add all-select `CheckboxCell` in header row
4. Add `<TableCell onClick={stopRowClick}><CheckboxCell aria-label={`Select ${space.name}`} ... /></TableCell>` at the start of each data row
5. Place `<SpaceBulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />` outside the table (end of return fragment)

If `ClickableTableRow` is used, prevent row click navigation via `onClick={stopRowClick}` on the checkbox cell.

#### A5. Tests

**Unit** (`__tests__/unit/domain/spaces/bulk-commands.test.ts`):

- Empty array → count: 0 / no DB calls
- Publish multiple items succeeds / `affectedSlugs` captured
- One P2003 FK constraint increments skipped
- All P2003 → count: 0 / skipped: N

**Integration** (`__tests__/integration/actions/admin/space-bulk.test.ts`):

- Unauthenticated → `MutationError`
- VIEWER role → permission denied
- Over 100 items → validation error
- Happy path calls `executeAdminMutationResult` mock
- Replace mock via `mock.module("@/admin/lib/admin-action", ...)`

**package.json**:

```json
"test:unit": "... && bun test __tests__/unit/domain/spaces/bulk-commands.test.ts ...",
"test:integration": "... && bun test __tests__/integration/actions/admin/space-bulk.test.ts ..."
```

(Append to existing batch; do not break the existing script order)

### Verification (Bundle A)

- `bun run type-check` exit 0
- `bun test __tests__/unit/domain/spaces/bulk-commands.test.ts` exit 0
- `bun test __tests__/integration/actions/admin/space-bulk.test.ts` exit 0
- `git status --short` shows expected modified/new files
- `git diff --stat HEAD` line counts are reasonable (domain ~80 + action ~70 + UI ~150 + table ~30 + tests ~250 ≈ 580 lines)

---

## Bundle B — Events Bulk

**Commit message**: `feat(admin): bulk publish/delete actions for events`

### Files to create

1. `src/shared/domain/events/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/events/_components/EventBulkActions.tsx`
4. `__tests__/unit/domain/events/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/event-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/events/_components/EventTable.tsx`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/event/index.ts` (add barrel re-export; skip if missing)
3. `package.json`

### Tasks

#### B1. domain command (event-specific: status filter + soft delete)

```typescript
import "server-only";

import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";

export type BulkPublishEventsResult = {
  count: number;
  skipped: number;
  isPublished: boolean;
  affectedSlugs: string[];
};

const PUBLISH_FROM_STATUSES = [EventStatus.DRAFT] as const;
const UNPUBLISH_FROM_STATUSES = [EventStatus.PUBLISHED] as const;

export async function bulkPublishEventsCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishEventsResult> {
  if (ids.length === 0)
    return { count: 0, skipped: 0, isPublished: publish, affectedSlugs: [] };
  const allowedStatuses = publish
    ? PUBLISH_FROM_STATUSES
    : UNPUBLISH_FROM_STATUSES;
  const now = new Date();

  const targets = await prisma.event.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: { in: [...allowedStatuses] },
    },
    select: { id: true, slug: true },
  });

  const result = await prisma.event.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      status: publish ? EventStatus.PUBLISHED : EventStatus.DRAFT,
      publishedAt: publish ? now : null,
    },
  });

  return {
    count: result.count,
    skipped: ids.length - result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

export async function bulkSoftDeleteEventsCommand(
  ids: string[],
  actor: { id: string },
): Promise<{ count: number; affectedSlugs: string[] }> {
  if (ids.length === 0) return { count: 0, affectedSlugs: [] };
  const targets = await prisma.event.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, slug: true },
  });
  const result = await prisma.event.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { deletedAt: new Date(), deletedById: actor.id },
  });
  return { count: result.count, affectedSlugs: targets.map((t) => t.slug) };
}
```

**Discipline**:

- `EventStatus` enum can be imported from the gateway (`prisma-types`)
- `actor: { id: string }` is passed from `executeAdminMutationResult` via `execute(user)` (`{ id: user.id, role: user.role }` pattern; CLAUDE.md requires `{ id: string; role: Role }` object)

#### B2. Server Action

Reference implementation: post/bulk.ts, but must pass actor:

```typescript
return executeAdminMutationResult({
  resource: "event",
  action: "delete",
  execute: async (user) =>
    bulkSoftDeleteEventsCommand(parsed.data.ids, { id: user.id }),
  afterSuccess: async (data) => {
    for (const slug of data.affectedSlugs) {
      // call invalidateEventCaches(id, slug)
    }
  },
});
```

#### B3. UI (`EventBulkActions.tsx`)

PostBulkActions pattern + show skipped count. Toasts:

- Publish: `${count} events published${skipped > 0 ? ` (${skipped} skipped due to status)` : ""}`
- Delete: `${count} events deleted`

#### B4. Table refactor (`EventTable.tsx`)

Same pattern as Bundle A. Use `aria-label` = `Select ${event.title}`.

#### B5. Tests

- Empty array / multiple items / status filter (CANCELLED events not publishable) / soft delete (`deletedAt` + `deletedById` set)

### Verification (Bundle B)

Same as Bundle A. Estimated line count ≈ 600 lines.

---

## Bundle C — News Bulk

**Commit message**: `feat(admin): bulk publish/delete actions for news`

### Files to create

1. `src/shared/domain/news/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/news/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/news/_components/NewsBulkActions.tsx`
4. `__tests__/unit/domain/news/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/news-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/news/_components/NewsTable.tsx`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts` (add barrel re-export)
3. `package.json`

### Tasks

#### C1. domain command (same as spaces, but no FK constraints)

```typescript
export async function bulkTogglePublishedNewsCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean; affectedSlugs: string[] }> {
  if (ids.length === 0)
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  const targets = await prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const result = await prisma.news.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isPublished: publish, publishedAt: publish ? new Date() : null },
  });
  return {
    count: result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

export async function bulkDeleteNewsCommand(
  ids: string[],
): Promise<{ count: number; affectedSlugs: string[] }> {
  if (ids.length === 0) return { count: 0, affectedSlugs: [] };
  const targets = await prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const result = await prisma.news.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return { count: result.count, affectedSlugs: targets.map((t) => t.slug) };
}
```

#### C2. Server Action

Follow the post/bulk.ts pattern. Confirm `invalidateNewsCaches` exists; if not, call `updateTag(CACHE_TAGS.NEWS)` + per-slug `getCacheTag.news.detail(slug)` directly.

#### C3. UI (`NewsBulkActions.tsx`)

Duplicate PostBulkActions. Toast uses "News" wording; no skip concept, so a minimal version is OK.

#### C4. Table refactor (`NewsTable.tsx`)

Same pattern as Bundle A.

#### C5. Tests

Minimal set based on Bundle A spaces version, excluding FK skip cases.

### Verification (Bundle C)

Same as Bundle A. Estimated line count ≈ 500 lines (lighter without FK handling).

---

## Overall verification (Phase 1 complete)

1. `bun run validate` exit 0
2. `bun run test:unit` exit 0 (including new batch)
3. `bun run test:integration` exit 0
4. `git log --oneline main..HEAD` shows 3 commits
5. `git show --stat HEAD~N` per commit confirms target files + line counts

Manual checks in dev server (optional, follow `feedback_dev-server-manual.md` for user-led verification):

- `/admin/spaces`: multi-select → bulk publish → published status badge updates
- `/admin/events`: multi-select → bulk delete → soft delete (removed from list; verify trash if applicable)
- `/admin/news`: multi-select → bulk unpublish → published status updates

---

## Subagent dispatch discipline

### Parallel dispatch (recommended)

Bundles A / B / C have no file conflicts, so use **3 parallel dispatches** for context isolation + faster completion:

```
controller → 3 parallel agents (general-purpose, sonnet)
  - Bundle A prompt: pass the full text of "Bundle A" above
  - Bundle B prompt: pass the full text of "Bundle B" above
  - Bundle C prompt: pass the full text of "Bundle C" above
```

### Dispatch prompt common notes

- 🚫 `git add / commit / push / reset / checkout / restore / stash` strictly forbidden
- 🚫 Do not include task references like "Phase X.Y", "P19", "Bundle A" in JSDoc/comments
- ✅ Implementers only edit; controller commits per bundle after completion
- ✅ Import aliases are limited to `@/admin/*` / `@/public/*` / `@/shared/*` (no double `_shared/` prefixes)
- ✅ Preserve plan type specs (e.g., return type `affectedSlugs: string[]`); escalate reductions to controller
- ✅ Report suspected official pattern violations as justified deviations
- ✅ Before implementation, `Read` the reference implementation (PostBulkActions / posts/bulk-commands.ts / actions/post/bulk.ts)
- ✅ Confirm exact signatures of cache helpers like `invalidateSpaceCaches` by reading implementation files
- ✅ Pre-verify that `executeAdminMutationResult` `action: "publish" | "delete"` exists in the `Action` type in `@/admin/lib/admin-resources`

### Controller verification after bundle completion

After receiving each bundle completion report:

1. `git status --short` to confirm actual changed files
2. `wc -l <new-files>` to compare line counts vs implementer report
3. `grep -E "^export" <new-files>` to confirm expected symbols
4. `bun run type-check` for type consistency
5. If OK, controller runs `git add <files> && git commit -m "<plan message>"` to stage + commit

### Update handoff memory

After all 3 bundles complete + commit, append the following to `~/.claude/projects/<slug>/memory/project_p17-19-sequential-handoff.md`:

```markdown
## P19 Phase 1 completion status (reference only) ✅ 2026-04-27

- **Plan**: `docs/superpowers/plans/2026-04-27-admin-bulk-actions-phase1.md`
- **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase1-design.md`
- **commit range**: `<base SHA>` → `<final SHA>` (3 commits: Bundle A/B/C)
- **not pushed**: direct commits on main; `git push` not executed
- **next phase**: Phase 2 (customers / inquiries / coupons) implemented in a separate plan
```

---

## Carryover to Phases 2 / 3 (reference)

- **Phase 2**: bulk actions for customers / inquiries / coupons (same pattern, separate plan)
- **Phase 3**: bulk status changes (CANCEL events + attendee notifications, state transition map)
- **Phase 4**: bulk category moves / tagging (cross-resource feature)
