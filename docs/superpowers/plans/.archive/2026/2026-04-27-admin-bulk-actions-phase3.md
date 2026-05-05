> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 3 — Admin Bulk Actions (bulk status changes + email notifications) Implementation Plan

> **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase3-design.md`
> **Scope**: bulk status changes for customers / inquiries / events + related email notifications
> **Bundle structure**: 3 Bundles (G/H/I) = 3 commits, 3-way parallel dispatch possible
> **Reference base**: fully follow Phase 2 plan (`docs/superpowers/plans/2026-04-27-admin-bulk-actions-phase2.md`)

## Context

Extend the Phase 1/2 `bulkDelete*` / `bulkToggleActive*` patterns with status transition maps and email notifications. Each bundle targets independent resources and extends existing Phase 1/2 components, so 3-way parallel dispatch is possible without file conflicts.

**Discipline established in Phase 2** (repeated here, required for all bundles):

- 🚫 No git commands (`add` / `commit` / `push` / `reset` / `checkout` / `restore` / `stash`)
- 🚫 Do not include task references like "Phase 3", "P19", "Bundle X" in JSDoc/comments
- ✅ No double prefix in import aliases (`@/admin/X`, not `@/admin/_shared/X`)
- ✅ Read reference implementations (Phase 2 Bundle D customers / Bundle E inquiries / Phase 1 Bundle B events) before implementing
- ✅ Verify plan API names in real files (`getCacheTag.<resource>.detail` / `Action` enum / `createValidationMutationError`)
- ✅ **Cloudflare mocks + email mocks start with full export stubs** (avoid the same silent bug as Phase 1 reactive fix `aebc3052`)

---

## Common: Add status transition maps to `enums/helpers.ts`

**Bundled in Bundle G** (lightest start, minimal cascade impact):

```typescript
// src/shared/lib/validations/enums/helpers.ts

import {
  CustomerStatus,
  InquiryStatus,
  EventStatus,
} from "@generated/prisma/enums";

/**
 * Customer status transition rules (free transitions, internal CRM)
 * All 5 states allow transitions; no-op handled by caller for same-state changes.
 */
export const CUSTOMER_STATUS_TRANSITIONS: Readonly<
  Record<CustomerStatus, readonly CustomerStatus[]>
> = {
  [CustomerStatus.NEW]: [
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.REGULAR]: [
    CustomerStatus.NEW,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.VIP]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.INACTIVE]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.BLACKLIST]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
  ],
};

/**
 * Inquiry status transition rules (forward only)
 */
export const INQUIRY_STATUS_TRANSITIONS: Readonly<
  Record<InquiryStatus, readonly InquiryStatus[]>
> = {
  [InquiryStatus.NEW]: [
    InquiryStatus.IN_PROGRESS,
    InquiryStatus.RESOLVED,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.IN_PROGRESS]: [InquiryStatus.RESOLVED, InquiryStatus.CLOSED],
  [InquiryStatus.RESOLVED]: [InquiryStatus.CLOSED],
  [InquiryStatus.CLOSED]: [],
};

/**
 * Event status transition rules
 */
export const EVENT_STATUS_TRANSITIONS: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  [EventStatus.DRAFT]: [
    EventStatus.PUBLISHED,
    EventStatus.CANCELLED,
    EventStatus.ARCHIVED,
  ],
  [EventStatus.PUBLISHED]: [EventStatus.CANCELLED, EventStatus.ARCHIVED],
  [EventStatus.CANCELLED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
};
```

**Bundle G/H/I implementers**: Since the maps are added in Bundle G, dispatch Bundle H/I **after Bundle G completes**. Bundles could partially add (Customer/Inquiry/Event only) in parallel, but to avoid conflicts (`enums/helpers.ts` concurrent edits), **Bundle G should add all 3 maps**.

---

## Bundle G — Customers Bulk Status

**Commit message**: `feat(admin): bulk status change for customers (5-state internal CRM transitions)`

### Files to create

1. `src/shared/domain/customers/bulk-status-commands.ts` (new file, separated from `bulk-commands.ts`)
2. `__tests__/unit/domain/customers/bulk-status-commands.test.ts`

### Files to modify

1. `src/shared/lib/validations/enums/helpers.ts` — add all 3 maps above (Customer/Inquiry/Event)
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts` — append `bulkSetStatusCustomers` (add export in existing file)
3. `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx` — add status change DropdownMenu
4. `__tests__/integration/actions/admin/customer-bulk.test.ts` — add `bulkSetStatusCustomers` tests

### Tasks

#### G1. domain command (`bulk-status-commands.ts`)

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { CustomerStatus } from "@generated/prisma/enums";
import { CUSTOMER_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

export type BulkSetStatusCustomersResult = {
  count: number;
  newStatus: CustomerStatus;
  affectedIds: string[];
  rejectedIds: string[];
};

export async function bulkSetStatusCustomersCommand(
  ids: string[],
  newStatus: CustomerStatus,
): Promise<BulkSetStatusCustomersResult> {
  if (ids.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds: [] };
  }
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });

  const allowedIds: string[] = [];
  const rejectedIds: string[] = [];
  for (const t of targets) {
    if (t.status === newStatus) continue; // no-op skip
    const allowed = CUSTOMER_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) allowedIds.push(t.id);
    else rejectedIds.push(t.id);
  }

  if (allowedIds.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds };
  }

  const result = await prisma.customer.updateMany({
    where: { id: { in: allowedIds } },
    data: { status: newStatus },
  });

  return {
    count: result.count,
    newStatus,
    affectedIds: allowedIds,
    rejectedIds,
  };
}
```

#### G2. Server Action (append to `actions/customer/bulk.ts`)

Reference: existing `bulkToggleActiveCustomers` / `bulkDeleteCustomers` (Phase 2 Bundle D).

```typescript
import { CustomerStatus } from "@generated/prisma/enums";
import {
  bulkSetStatusCustomersCommand,
  type BulkSetStatusCustomersResult,
} from "@/shared/domain/customers/bulk-status-commands";

const bulkStatusInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  newStatus: z.enum(CustomerStatus),
});

export const bulkSetStatusCustomers = async (
  ids: string[],
  newStatus: CustomerStatus,
): Promise<MutationResult<BulkSetStatusCustomersResult>> => {
  const parsed = bulkStatusInputSchema.safeParse({ ids, newStatus });
  if (!parsed.success) return createValidationMutationError(parsed.error);
  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () =>
      bulkSetStatusCustomersCommand(parsed.data.ids, parsed.data.newStatus),
    afterSuccess: async (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      for (const id of data.affectedIds)
        updateTag(getCacheTag.customers.detail(id));
    },
  });
};
```

#### G3. UI extension (`CustomerBulkActions.tsx`)

Add a **status change DropdownMenu** to existing `CustomerBulkActions.tsx` (Phase 2 Bundle D).

- Icons: `IconUserStar` (VIP) / `IconUserExclamation` (BLACKLIST) / `IconUser`, etc.
- Expand `CUSTOMER_STATUS_LABELS` (`enums/helpers.ts`) into Dropdown items
- After selection, confirm via `confirm()` or `BulkConfirmDialog` (same as `DeleteConfirmDialog`) → run `bulkSetStatusCustomers(selectedIds, status)`
- Toast: "Changed status for N items to <label> (<rejected> skipped due to invalid transitions)"

#### G4. Tests

**Unit** (`bulk-status-commands.test.ts`):

- Empty array → count: 0
- Skip same-status (no-op) confirmed
- Arbitrary transitions across 5 statuses succeed
- rejectedIds: in current map, only same-status is no-op; all other transitions allowed
- Map violation pattern (e.g., ensure future BLACKLIST → BLACKLIST does not get rejectedIds; no-op path)

**Integration** (extend `customer-bulk.test.ts`):

- Auth / permissions / Zod validation (`newStatus` enum required) / mock executeAdminMutationResult / mock fireAndForget
- Cloudflare mock **continues existing 11 export stubs** (established in Phase 2; copy/paste)

---

## Bundle H — Inquiries Bulk Status + Email

**Commit message**: `feat(admin): bulk status change for inquiries with notification email`

### Files to create

1. `src/shared/domain/inquiries/bulk-status-commands.ts`
2. `src/shared/emails/inquiry-status-notification.tsx` (new React Email template)
3. `__tests__/unit/domain/inquiries/bulk-status-commands.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry/bulk.ts` — append `bulkSetStatusInquiries`
2. `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryBulkActions.tsx` — add status DropdownMenu
3. `src/shared/lib/email/inquiry-emails.ts` — append `sendInquiryStatusNotificationToAll`
4. `__tests__/integration/actions/admin/inquiry-bulk.test.ts` — add `bulkSetStatusInquiries` tests

### Tasks

#### H1. domain command

Same as Customer Bundle G G1. Validate forward-only via `INQUIRY_STATUS_TRANSITIONS`. Return type: `BulkSetStatusInquiriesResult { count, newStatus, affectedIds, rejectedIds }`.

#### H2. New React Email template (`inquiry-status-notification.tsx`)

Copy structure from `event-cancelled-notification.tsx`.

```typescript
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

type Props = {
  customerName: string;
  inquirySubject: string;
  newStatus: "RESOLVED" | "CLOSED";
  siteName: string;
};

const HEADINGS: Record<Props["newStatus"], string> = {
  RESOLVED: "Your inquiry has been resolved",
  CLOSED: "Your inquiry has been closed",
};

const MESSAGES: Record<Props["newStatus"], string> = {
  RESOLVED: "We have completed the response to your inquiry.\nPlease feel free to contact us if you have any questions.",
  CLOSED: "Your inquiry has been closed.\nIf you need further assistance, please submit a new inquiry.",
};

export function InquiryStatusNotificationEmail({ customerName, inquirySubject, newStatus, siteName }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{HEADINGS[newStatus]} - {inquirySubject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{HEADINGS[newStatus]}</Heading>
          <Text style={text}>Dear {customerName},</Text>
          <Section style={detailsSection}>
            <Text style={detailsHeading}>Inquiry details</Text>
            <Hr style={hr} />
            <Text style={detailItem}><strong>Subject:</strong> {inquirySubject}</Text>
          </Section>
          <Hr style={hr} />
          <Text style={text}>{MESSAGES[newStatus]}</Text>
          <Text style={footer}>{siteName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

// styles: copy the same inline styles from event-cancelled-notification.tsx
```

#### H3. send helper (append to `inquiry-emails.ts`)

```typescript
export async function sendInquiryStatusNotificationToAll(
  inquiryIds: string[],
  newStatus: "RESOLVED" | "CLOSED",
): Promise<void> {
  if (inquiryIds.length === 0) return;
  const inquiries = await prisma.inquiry.findMany({
    where: { id: { in: inquiryIds } },
    select: { id: true, name: true, email: true, subject: true },
  });
  if (inquiries.length === 0) return;
  const siteName = await getSiteName();

  const results = await Promise.allSettled(
    inquiries.map((inquiry) =>
      sendEmail({
        payload: {
          to: inquiry.email,
          subject: `[Inquiry ${newStatus === "RESOLVED" ? "Resolved" : "Closed"}] ${inquiry.subject}`,
          react: InquiryStatusNotificationEmail({
            customerName: inquiry.name,
            inquirySubject: inquiry.subject,
            newStatus,
            siteName,
          }),
        },
        idempotencyKey: `inquiry-status/${inquiry.id}/${newStatus}`,
        operation: "sendInquiryStatusNotificationToAll",
        context: { inquiryId: inquiry.id, email: inquiry.email },
      }),
    ),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const inquiry = inquiries[i];
      if (inquiry) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendInquiryStatusNotificationToAll",
            inquiryId: inquiry.id,
            email: inquiry.email,
          },
        });
      }
    }
  }
}
```

Add imports: `prisma` / `logError` / `normalizeError` / `ErrorCategory` / `ErrorSeverity` / `InquiryStatusNotificationEmail`.

#### H4. Server Action

Same as Bundle G G2. In `afterSuccess`, call `fireAndForget(sendInquiryStatusNotificationToAll(data.affectedIds, data.newStatus), { operation: "bulkSetStatusInquiries.notify", category: ErrorCategory.EXTERNAL_API })` **only when `newStatus === "RESOLVED" || newStatus === "CLOSED"`** (do not send emails for NEW/IN_PROGRESS transitions).

#### H5. UI extension (`InquiryBulkActions.tsx`)

Add a status change DropdownMenu to existing `InquiryBulkActions.tsx` (Phase 2 Bundle E was delete-only). Expand `INQUIRY_STATUS_LABELS` into items.

#### H6. Tests

**Unit** (`bulk-status-commands.test.ts`): forward-only validation + RESOLVED → NEW/IN_PROGRESS accumulates rejectedIds; CLOSED → any transition is rejected.

**Integration** (extend `inquiry-bulk.test.ts`):

- Mock email: `mock.module("@/shared/lib/email/inquiry-emails", () => ({ sendInquiryReplyEmail: mock(() => Promise.resolve({ success: true })), sendInquiryStatusNotificationToAll: mock<(ids: string[], status: "RESOLVED" | "CLOSED") => Promise<void>>(() => Promise.resolve()) }))` covers both exports
- Verify `sendInquiryStatusNotificationToAll` is called with affectedIds only when newStatus is RESOLVED (`toHaveBeenCalledWith`, CLAUDE.md requirement: `mock<(args: T) => ...>` typing)
- Ensure email function is not called for IN_PROGRESS transitions (`expect(mockFn).not.toHaveBeenCalled()`)
- Cloudflare mocks use the same 11 export stubs as Phase 2

---

## Bundle I — Events Bulk Cancel + Email

**Commit message**: `feat(admin): bulk cancel for events with participant notification`

### Files to create

1. `src/shared/domain/events/bulk-status-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk.ts` (Phase 1 Bundle B already implemented `bulkPublishEvents` / `bulkDeleteEvents`, add new export) — **likely existing file; implementer must confirm via Read**
3. `__tests__/unit/domain/events/bulk-status-commands.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/events/_components/EventBulkActions.tsx` — add Cancel button
2. `__tests__/integration/actions/admin/event-bulk.test.ts` — add `bulkSetStatusEvents` tests

### Tasks

#### I1. domain command

Same as Bundles G/H. Reference `EVENT_STATUS_TRANSITIONS`. Use `bulkSetStatusEventsCommand(ids, newStatus)`, but in Phase 3 the UI only triggers `CANCELLED`. The map is for future expansion.

Return value: `{ count, newStatus, affectedIds, rejectedIds }`.

**Important**: Events are soft-deleted (`deletedAt`), so `findMany` must include `deletedAt: null`. Same for `updateMany`.

#### I2. Server Action

Same as Bundle G G2. In `afterSuccess`:

```typescript
afterSuccess: async (data) => {
  updateTag(CACHE_TAGS.EVENTS);
  for (const id of data.affectedIds) updateTag(getCacheTag.events.detail(id));
  if (data.newStatus === EventStatus.CANCELLED) {
    fireAndForget(
      Promise.allSettled(
        data.affectedIds.map((eventId) =>
          sendEventCancelledToAllParticipants(eventId),
        ),
      ),
      {
        operation: "bulkSetStatusEvents.cancel",
        category: ErrorCategory.EXTERNAL_API,
      },
    );
  }
};
```

`sendEventCancelledToAllParticipants` returns `void`, so wrap with `Promise.allSettled`.

Confirm the exact signature of `getCacheTag.events.detail(id)` in `@/shared/lib/constants` (follow existing pattern using id, not slug; align with Phase 1 `affectedIds` cache strategy).

#### I3. UI extension (`EventBulkActions.tsx`)

Add a "Cancel" button to existing `EventBulkActions.tsx` (Phase 1 Bundle B). Use a `DeleteConfirmDialog`-style confirmation dialog ("Cancel N events and send notification emails to participants").

#### I4. Tests

**Unit**: verify transitions per `EVENT_STATUS_TRANSITIONS`. ARCHIVED → any transition is rejected.

**Integration**:

- Mock event emails: `mock.module("@/shared/lib/email/event-emails", () => ({ sendEventRegistrationConfirmation: mock(...), sendEventRegistrationCancelled: mock(...), sendEventAdminNotification: mock(...), sendEventCancelledToAllParticipants: mock<(eventId: string) => Promise<void>>(() => Promise.resolve()), sendEventUpdatedToAllParticipants: mock(...) }))` covers all 5 exports
- Verify `sendEventCancelledToAllParticipants` is called per affectedIds only on CANCELLED transition
- Ensure soft-deleted events are not included in affectedIds
- Cloudflare mocks use the same 11 export stubs as Phase 1/2

---

## Overall verification (Phase 3 complete)

1. `bun run validate` exit 0
2. `bun test __tests__/unit/domain/{customers,inquiries,events}/bulk-status-commands.test.ts` passes
3. `bun test __tests__/integration/actions/admin` (admin batch) passes (no mock pollution; pass count exceeds Phase 2’s 1458)
4. `git log --oneline main..HEAD` shows 3 commits (G/H/I)
5. `git show --stat HEAD~N` per commit confirms target files + line counts
6. Manual UI checks are not required (CLAUDE.md feedback `dev-server-manual.md`; rely on CI)

---

## Subagent dispatch discipline (same as Phase 1/2)

- **Recommend 3 parallel general-purpose (sonnet) dispatch**, but since Bundle G adds all 3 maps in `enums/helpers.ts`, it is safest to **dispatch Bundle G first → after completion, dispatch Bundles H/I in parallel** (avoid `enums/helpers.ts` race)
- After each implementer completes, controller verifies with `git status --short` + `git diff --stat HEAD` → controller commits
- 🚫 No git commands (`add` / `commit` / `push` / `reset` / `checkout` / `restore` / `stash`)
- 🚫 No task reference comments (`Phase 3` / `Bundle G`, etc.)
- ✅ Implementers touch only files listed in the plan Files sections
- ✅ Modifying existing Phase 1/2 components must **not break existing exports** (only add status dropdown; keep delete/toggle)
- ✅ Adding 3 maps to `enums/helpers.ts` is Bundle G implementer’s responsibility; Bundles H/I are read-only

### Dispatch order

```
1. Bundle G dispatch (Customer + add 3 maps)
2. controller verify + commit
3. Bundle H + Bundle I in parallel
4. controller verify + 2 commit
```

Or:

```
1. Implement Bundle G first and include only the enums/helpers.ts maps in the first commit
2. Dispatch the rest of Bundle G (domain/UI/test) + H + I in parallel
```

The first option is simpler because the implementer owns both the enums/helpers.ts map addition and the Customer-specific implementation.

---

## Phase 3 completion finishes P19

Record the Phase 1/2/3 commit history in `project_p17-19-sequential-handoff.md` and move the handoff memory to archive candidates.
