> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 2 — Admin Bulk Actions Implementation Plan

> **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase2-design.md`
> **Scope**: bulk delete for customers / inquiries / coupons (+ customers/coupons include isActive toggle)
> **Bundle structure**: 3 Bundles (D/E/F) = 3 commits; bundles can be dispatched in parallel
> **Reference base**: fully follow Phase 1 `docs/superpowers/plans/2026-04-27-admin-bulk-actions-phase1.md`

## Context

Apply the Phase 1 (spaces / events / news) `PostBulkActions` pattern symmetrically to 3 areas in Phase 2. Phase 2 **excludes status transitions**, and is limited to `bulkDelete*Command` + `bulkToggleActive*Command` (when applicable). **Cloudflare mocks should start with all 11 export stubs** (learning from Phase 1 commit `aebc3052`).

Each bundle targets an independent resource with no file conflicts, so 3-way parallel dispatch is possible.

---

## Bundle D — Customers Bulk

**Commit message**: `feat(admin): bulk delete and active-toggle actions for customers`

### Files to create

1. `src/shared/domain/customers/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx`
4. `__tests__/unit/domain/customers/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/customer-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerTable.tsx` — row checkboxes + selectedIds + `<CustomerBulkActions />`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` (existing single file) is untouched (import `@/admin/actions/customer/bulk` directly)
3. `package.json` — no addition needed (covered by existing directory batch, same as Phase 1)

### Tasks

#### D1. domain command (`bulk-commands.ts`)

Reference: `src/shared/domain/spaces/bulk-commands.ts` (Phase 1 Bundle A)

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkToggleActiveCustomersResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkDeleteCustomersResult = {
  count: number;
  affectedIds: string[];
};

export async function bulkToggleActiveCustomersCommand(
  ids: string[],
  isActive: boolean,
): Promise<BulkToggleActiveCustomersResult> {
  if (ids.length === 0) return { count: 0, isActive, affectedIds: [] };
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const result = await prisma.customer.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isActive },
  });
  return {
    count: result.count,
    isActive,
    affectedIds: targets.map((t) => t.id),
  };
}

export async function bulkDeleteCustomersCommand(
  ids: string[],
): Promise<BulkDeleteCustomersResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  // Reservation.customerId uses onDelete: SetNull, so no FK conflicts
  const result = await prisma.customer.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return { count: result.count, affectedIds: targets.map((t) => t.id) };
}
```

#### D2. Server Action (`actions/customer/bulk.ts`)

Reference: `src/app/(admin)/admin/(dashboard)/_shared/actions/space/bulk.ts`

```typescript
"use server";

import { z } from "zod";
import {
  bulkToggleActiveCustomersCommand,
  bulkDeleteCustomersCommand,
  type BulkToggleActiveCustomersResult,
  type BulkDeleteCustomersResult,
} from "@/shared/domain/customers/bulk-commands";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "Invalid ID" }))
    .min(1, { error: "Select at least 1 item" })
    .max(100, { error: "You can process up to 100 items at once" }),
});

export const bulkToggleActiveCustomers = async (
  ids: string[],
  isActive: boolean,
): Promise<MutationResult<BulkToggleActiveCustomersResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);
  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () =>
      bulkToggleActiveCustomersCommand(parsed.data.ids, isActive),
    afterSuccess: async (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      for (const id of data.affectedIds) {
        updateTag(getCacheTag.customers.detail(id));
      }
    },
  });
};

export const bulkDeleteCustomers = async (
  ids: string[],
): Promise<MutationResult<BulkDeleteCustomersResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);
  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    execute: async () => bulkDeleteCustomersCommand(parsed.data.ids),
    afterSuccess: async (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      for (const id of data.affectedIds) {
        updateTag(getCacheTag.customers.detail(id));
      }
    },
  });
};
```

**Implementer notes**:

- Confirm the exact signature of `getCacheTag.customers.detail` in `@/shared/lib/constants`
- Verify `update` / `delete` exist in the `Action` type used by `executeAdminMutationResult`
- Align with existing cache invalidation patterns in `actions/customer.ts`

#### D3. UI (`CustomerBulkActions.tsx`)

Reference: `SpaceBulkActions.tsx` (Bundle A)

Differences:

- import: `bulkToggleActiveCustomers` / `bulkDeleteCustomers`
- toast: use "Customer" wording
- Replace "Publish/Unpublish" labels with "Activate/Deactivate"
- Icons: `IconUserCheck` / `IconUserOff` / `IconTrash`
- Integrate pre-delete `DeleteConfirmDialog`

#### D4. Table refactor (`CustomerTable.tsx`)

Same pattern as Phase 1:

1. Confirm `"use client"`
2. Add `selectedIds` via `useState<string[]>([])`
3. Header all-select `CheckboxCell`
4. Row head `<TableCell onClick={stopRowClick}><CheckboxCell aria-label={`Select ${customer.lastName} ${customer.firstName}`} ... /></TableCell>`
5. Place `<CustomerBulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />` outside the table

If `ClickableTableRow` is used, apply `stopRowClick` to the checkbox cell.

#### D5. Tests

**Unit** (`__tests__/unit/domain/customers/bulk-commands.test.ts`):

- Empty array → count: 0 / no DB calls
- Multiple isActive toggles succeed
- Delete succeeds / `affectedIds` captured

**Integration** (`__tests__/integration/actions/admin/customer-bulk.test.ts`):

- Auth / permission / Zod validation / mock executeAdminMutationResult / mock fireAndForget
- **Cloudflare mocks start with all 11 export stubs** (see Phase 1 commit `aebc3052` template)

```typescript
const noopPurge = (): Promise<{ success: boolean }> =>
  Promise.resolve({ success: true });
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: mock(noopPurge),
  purgeCloudflareCacheByPrefix: mock(noopPurge),
  purgeAllCloudflareCache: mock(noopPurge),
  purgeCloudflareByPaths: mock(noopPurge),
  purgeSpaceCache: mock(noopPurge),
  purgePostCache: mock(noopPurge),
  purgeNewsCache: mock(noopPurge),
  purgePageCache: mock(noopPurge),
  purgeHomeCache: mock(noopPurge),
  purgeFaqCache: mock(noopPurge),
  purgeTermsCache: mock(noopPurge),
}));
```

### Verification (Bundle D)

- `bun run type-check` exit 0
- `bun test __tests__/unit/domain/customers/bulk-commands.test.ts` exit 0
- `bun test __tests__/integration/actions/admin/customer-bulk.test.ts` exit 0
- `git status --short` shows expected modified/new files
- Estimated line count ≈ 500 lines

---

## Bundle E — Inquiries Bulk

**Commit message**: `feat(admin): bulk delete actions for inquiries`

### Files to create

1. `src/shared/domain/inquiries/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryBulkActions.tsx`
4. `__tests__/unit/domain/inquiries/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/inquiry-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryTable.tsx`
2. `package.json` — no addition needed

### Tasks

#### E1. domain command

`Inquiry` has no `isActive`, so **delete only**:

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type BulkDeleteInquiriesResult = {
  count: number;
  affectedIds: string[];
};

export async function bulkDeleteInquiriesCommand(
  ids: string[],
): Promise<BulkDeleteInquiriesResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };
  const targets = await prisma.inquiry.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const result = await prisma.inquiry.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return { count: result.count, affectedIds: targets.map((t) => t.id) };
}
```

#### E2. Server Action

Duplicate Bundle D `bulkDeleteCustomers` for `Inquiry`. Use `CACHE_TAGS.INQUIRIES` + `getCacheTag.inquiries.detail(id)`.

#### E3. UI (`InquiryBulkActions.tsx`)

Reference `PostBulkActions` (minimal version, 141 lines). No toggle button, delete only. Toast uses "Inquiry" wording.

#### E4. Table refactor

Same pattern as Phase 1. `aria-label` = `Select ${inquiry.subject}`.

#### E5. Tests

Minimal set (delete only). **Cloudflare mocks start with all 11 export stubs**.

### Verification (Bundle E)

Estimated line count ≈ 350 lines (delete only, no isActive toggle).

---

## Bundle F — Coupons Bulk

**Commit message**: `feat(admin): bulk delete and active-toggle actions for coupons`

### Files to create

1. `src/shared/domain/coupons/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/coupon/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponBulkActions.tsx`
4. `__tests__/unit/domain/coupons/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/coupon-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponTable.tsx`
2. `package.json` — no addition needed

### Tasks

#### F1. domain command

Same as Bundle D customers (isActive toggle + delete):

```typescript
export type BulkToggleActiveCouponsResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkDeleteCouponsResult = {
  count: number;
  affectedIds: string[];
};

// implement bulkToggleActiveCouponsCommand / bulkDeleteCouponsCommand
// Reservation.couponId uses onDelete: SetNull (no FK conflict); delete allowed even if Coupon.usageCount > 0
```

#### F2. Server Action

Duplicate Bundle D customers Server Action for `coupon`. Use `CACHE_TAGS.COUPONS` + `getCacheTag.coupons.detail(id)`.

#### F3. UI (`CouponBulkActions.tsx`)

Same as CustomerBulkActions (active toggle + delete). Use "Coupon" wording, icons: `IconTicket` / `IconTicketOff` / `IconTrash`.

#### F4. Table refactor

Same pattern as Phase 1. `aria-label` = `Select ${coupon.name}`.

#### F5. Tests

Same as Bundle D. **Cloudflare mocks start with all 11 export stubs**.

### Verification (Bundle F)

Estimated line count ≈ 500 lines.

---

## Overall verification (Phase 2 complete)

1. `bun run validate` exit 0
2. `bun test __tests__/integration/actions/admin` (admin batch) passes (ensure Phase 2 cloudflare mock pollution does not occur)
3. `git log --oneline main..HEAD` shows 3 commits
4. `git show --stat HEAD~N` per commit confirms target files + line counts

---

## Subagent dispatch discipline

Same as Phase 1:

- 3 parallel general-purpose (sonnet) dispatch
- 🚫 no git commands (controller commits after completion)
- 🚫 no task references like "Phase", "P19", "Bundle X" in JSDoc/comments
- ✅ no double prefix in import aliases
- ✅ read reference implementations (Bundle A spaces / Bundle C news) before implementing
- ✅ verify plan API names in real files (`getCacheTag.customers.detail` / `Action` enum / `createValidationMutationError`)
- ✅ **Cloudflare mocks start with all 11 export stubs** (prevent Phase 1 reactive fix `aebc3052` regression)

---

## Carryover to Phase 3

- Bulk customer status changes (BLACKLIST / VIP promotion)
- Bulk inquiry status changes (RESOLVED) + auto-reply email
- Bulk event CANCEL + attendee notification emails (excluded in Phase 1)
- State transition map setup (`CUSTOMER_STATUS_TRANSITIONS` / `INQUIRY_STATUS_TRANSITIONS`, etc.)
- Phase 3 starts with **brainstorming + spec creation** (outside this plan’s pure symmetry scope)
