# Inquiry Overhaul PR1 — authorCustomerId Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type-safe CUSTOMER reply authorship via `InquiryReply.authorCustomerId`, with DB CHECK that forbids cross-side FK pollution, and query-layer `authorName` resolution for both STAFF and CUSTOMER.

**Architecture:** Additive Prisma column + Customer relation + CHECK constraint. Update shared `REPLY_SELECT_INTERNAL` / `flattenReply` so admin and mypage reads resolve display names without dual-read. No UI write paths yet (customer reply is PR3).

**Tech Stack:** Prisma 7, PostgreSQL CHECK, Bun test via `scripts/run-tests.ts`

**Spec:** `docs/superpowers/specs/2026-07-24-inquiry-overhaul-completion-design.md` §5.1 (corrected CHECK)

**Umbrella:** Later PRs 2–6 remain in the same spec §10. Separate plans per PR after this ships.

## Global Constraints

- Clean-break: no dual-read / shim for author identity
- CHECK must tolerate `authorId` / `authorCustomerId` SetNull after parent delete
- App create paths must still require the correct FK on insert
- Soft limit ~300 lines / 10 files per PR
- Tests only via `bun scripts/run-tests.ts …`
- Migration via prisma-migration skill; do not edit applied SQL
- Conventional Commits + `[ai-gen]` when primarily AI-generated

---

### Task 1: Schema — authorCustomerId + Customer relation

**Files:**

- Modify: `prisma/schema.prisma` (`InquiryReply`, `Customer`)

**Interfaces:**

- Produces: `InquiryReply.authorCustomerId: String?`, relation `authorCustomer`, Customer reverse `authoredInquiryReplies`

- [ ] **Step 1: Edit InquiryReply**

Replace the author comment and add fields:

```prisma
model InquiryReply {
  id         String                 @id @default(uuid()) @db.Uuid
  inquiryId  String                 @db.Uuid
  authorType InquiryReplyAuthorType
  /// STAFF → User.id (User 削除で SetNull)。CUSTOMER では null。
  authorId   String?                @db.Uuid
  /// CUSTOMER → Customer.id (Customer 削除で SetNull)。STAFF では null。
  authorCustomerId String?          @db.Uuid
  body       String                 @db.Text
  createdAt  DateTime               @default(now())
  updatedAt  DateTime               @updatedAt

  inquiry        Inquiry             @relation(fields: [inquiryId], references: [id], onDelete: Cascade)
  author         User?               @relation("InquiryReplyAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  authorCustomer Customer?           @relation("InquiryReplyAuthorCustomer", fields: [authorCustomerId], references: [id], onDelete: SetNull)
  attachments    InquiryAttachment[]

  @@index([inquiryId, createdAt])
  @@index([authorId])
  @@index([authorCustomerId])
  @@map("inquiry_replies")
}
```

- [ ] **Step 2: Edit Customer relations**

Add next to `uploadedInquiryAttachments`:

```prisma
  authoredInquiryReplies InquiryReply[] @relation("InquiryReplyAuthorCustomer")
```

- [ ] **Step 3: Generate client**

Run: `bun run db:generate`  
Expected: exit 0

---

### Task 2: Migration + CHECK

**Files:**

- Create: `prisma/migrations/<timestamp>_inquiry_reply_author_customer/migration.sql`

**Interfaces:**

- Consumes: Task 1 schema
- Produces: applied migration with `inquiry_replies_author_side_check`

- [ ] **Step 1: Create migration (create-only then edit if needed)**

Run: `bun run db:migrate --create-only --name inquiry_reply_author_customer`

Ensure SQL includes ADD COLUMN `authorCustomerId`, FK to `customers`, index, and append:

```sql
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK (
  ( "authorType" = 'STAFF' AND "authorCustomerId" IS NULL )
  OR
  ( "authorType" = 'CUSTOMER' AND "authorId" IS NULL )
);
```

- [ ] **Step 2: squawk lint**

Run: `bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql`  
Expected: exit 0 (additive; no DROP)

- [ ] **Step 3: Apply migration**

Run: `bun run db:migrate`  
Expected: applied / in sync

- [ ] **Step 4: Commit schema + migration**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(inquiry): add InquiryReply.authorCustomerId [ai-gen]"
```

---

### Task 3: Query flattenReply resolves CUSTOMER authorName

**Files:**

- Modify: `src/shared/domain/inquiries/queries.ts` (`REPLY_SELECT_INTERNAL`, `RawReply`, `flattenReply`)
- Modify: `src/shared/domain/inquiries/types.ts` (comment on `authorName` if needed)
- Create: `__tests__/unit/domain/inquiries/flatten-reply.test.ts`

**Interfaces:**

- Consumes: Prisma select with `author` + `authorCustomer`
- Produces: `flattenReply` → `authorName` from User.name (STAFF) or `lastName+firstName` (CUSTOMER)

- [ ] **Step 1: Failing unit test**

```ts
import { describe, test, expect } from "bun:test";
import { flattenReply } from "@/shared/domain/inquiries/queries";

describe("flattenReply", () => {
  test("STAFF uses author.name", () => {
    expect(
      flattenReply({
        id: "r1",
        body: "hi",
        authorType: "STAFF",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: { name: "Admin" },
        authorCustomer: null,
      }).authorName,
    ).toBe("Admin");
  });

  test("CUSTOMER uses lastName+firstName", () => {
    expect(
      flattenReply({
        id: "r2",
        body: "thanks",
        authorType: "CUSTOMER",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: null,
        authorCustomer: { lastName: "山田", firstName: "太郎" },
      }).authorName,
    ).toBe("山田 太郎");
  });

  test("CUSTOMER with null authorCustomer falls back to null", () => {
    expect(
      flattenReply({
        id: "r3",
        body: "x",
        authorType: "CUSTOMER",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: null,
        authorCustomer: null,
      }).authorName,
    ).toBeNull();
  });
});
```

Note: `queries.ts` is `server-only`. If import fails in unit test, extract `flattenReply` + types to `src/shared/domain/inquiries/reply-display.ts` (no server-only) and re-export from queries — clean-break preferred over mocking server-only.

- [ ] **Step 2: Run test — expect FAIL**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/inquiries/flatten-reply.test.ts`

- [ ] **Step 3: Implement select + flatten**

```ts
export const REPLY_SELECT_INTERNAL = {
  id: true,
  body: true,
  authorType: true,
  createdAt: true,
  author: { select: { name: true } },
  authorCustomer: { select: { lastName: true, firstName: true } },
} as const;

export function flattenReply(r: RawReply): InquiryReplyItem {
  const authorName =
    r.authorType === "CUSTOMER"
      ? r.authorCustomer
        ? `${r.authorCustomer.lastName} ${r.authorCustomer.firstName}`
        : null
      : (r.author?.name ?? null);
  return {
    id: r.id,
    body: r.body,
    authorType: r.authorType,
    authorName,
    createdAt: r.createdAt,
  };
}
```

Use exhaustive handling if comparing enum: prefer `InquiryReplyAuthorType` from generated enums via prisma-types gateway in app layers; domain may import `@generated/prisma/enums`.

- [ ] **Step 4: Run tests PASS + staff reply unit still green**

Run:
`bun scripts/run-tests.ts __tests__/unit/domain/inquiries/flatten-reply.test.ts __tests__/unit/domain/inquiries/commands.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/inquiries/ __tests__/unit/domain/inquiries/flatten-reply.test.ts
git commit -m "feat(inquiry): resolve CUSTOMER reply authorName [ai-gen]"
```

---

### Task 4: Staff reply create assert + validate

**Files:**

- Modify: `src/shared/domain/inquiries/commands.ts` (`replyToInquiryCommand` create data — ensure `authorCustomerId` omitted/null)
- Modify: `__tests__/unit/domain/inquiries/commands.test.ts` if create payload assertions need `authorCustomerId: null` or absent

- [ ] **Step 1: Confirm create payload**

`replyToInquiryCommand` must pass only STAFF fields (`authorType: STAFF`, `authorId: userId`). Do not set `authorCustomerId`.

- [ ] **Step 2: validate + test:db:migrate**

```bash
bun run test:db:migrate
bun run validate
```

Expected: exit 0

- [ ] **Step 3: Final commit if any fixups; push PR**

Branch: `feat/inquiry-reply-author-customer`  
PR title: `feat(inquiry): add authorCustomerId for reply authorship`  
Base: `main`  
Then `gh pr merge --auto --squash --delete-branch`

---

## Spec coverage (PR1 only)

| Spec item                        | Task               |
| -------------------------------- | ------------------ |
| authorCustomerId + relation      | T1                 |
| CHECK (corrected side-check)     | T2                 |
| authorName STAFF/CUSTOMER        | T3                 |
| App create assert for STAFF path | T4                 |
| Customer reply command           | out of scope (PR3) |
| Thread UI                        | out of scope (PR2) |
