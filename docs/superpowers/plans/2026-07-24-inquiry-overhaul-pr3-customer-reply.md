# Inquiry Overhaul PR3 — Customer Reply + Admin Notify

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Logged-in customers can append CUSTOMER replies on mypage; admins get in-app + email notifications. CLOSED/SPAM blocked; RESOLVED/FLAGGED reopen to IN_PROGRESS.

**Depends on:** PR1 (authorCustomerId) + PR2 (thread UI) merged to main.

**Spec:** `docs/superpowers/specs/2026-07-24-inquiry-overhaul-completion-design.md` §4, §6.1, §8

## Global Constraints

- Clean-break; no dual-read
- Member only (`verifyCustomerSession` + ownership via `customerId`)
- Status: allow NEW/IN_PROGRESS/RESOLVED/FLAGGED; reject CLOSED/SPAM
- Reopen: RESOLVED/FLAGGED → IN_PROGRESS with history reason `customer-reply-reopen`
- Create assert: CUSTOMER → `authorCustomerId` set, `authorId` null
- Soft limit ~300 lines / 10 files — split commits/PRs if needed
- Tests via `bun scripts/run-tests.ts`
- Conventional Commits + `[ai-gen]`

---

### Task 1: Settings — notifyInquiryCustomerReply

**Files:**

- Modify: `prisma/schema.prisma` (`SettingsNotification`)
- Create: migration add `notifyInquiryCustomerReply Boolean @default(true)`
- Modify: settings commands/queries/admin-queries/form schemas/NotificationSection UI
- Tests: extend notification gating tests pattern from `contact-emails-gating.test.ts`

Follow prisma-migration skill. Column on `settings_notifications` only.

---

### Task 2: Domain — replyToInquiryAsCustomerCommand

**Files:**

- Modify: `src/shared/domain/inquiries/commands.ts`
- Test: `__tests__/unit/domain/inquiries/commands.test.ts` (or new `customer-reply.test.ts`)

**Produces:**

```ts
replyToInquiryAsCustomerCommand(
  inquiryId: string,
  customerId: string,
  body: string,
): Promise<{ inquiryId: string; replyId: string; emailContext: {...} }>
```

Guards: not found / deleted / anonymized / wrong owner / CLOSED|SPAM → DomainError.  
Tx: create reply CUSTOMER + optional status reopen + history.

---

### Task 3: Notification type + admin email

**Files:**

- Modify: `NOTIFICATION_TYPE` (+ LABELS/ICONS/BADGE) in `helpers.ts`
- Create: `src/shared/emails/inquiry-customer-reply-admin.tsx` + fixture
- Modify: registry; `src/shared/lib/email/inquiry-emails.ts` → `sendInquiryCustomerReplyAdminEmail`
- Gate on `notifyInquiryCustomerReply` like `notifyNewInquiry`

---

### Task 4: Public action + mypage form

**Files:**

- Modify or create: public/mypage inquiry reply Server Action (session → customer → command → fireAndForget notify + email → updateTag)
- Modify: `mypage/inquiries/[id]/page.tsx` or client form component — show form unless CLOSED/SPAM
- E2E optional smoke if fixtures allow

---

### Task 5: validate + PR vs main

`bun run validate` + unit tests for command/email gating. Ship PR to main.
