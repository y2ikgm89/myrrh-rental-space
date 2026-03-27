# Project Gap Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill critical feature gaps identified in the project-wide audit: email templates, search, pricing recalculation, inquiry reply, reservation soft-delete, and comment moderation visibility.

**Architecture:** Six independent features implemented as additive changes. Schema changes are batched into a single migration. Each feature follows existing project patterns (executeAdminMutationResult, 'use cache', CACHE_TAGS, Resend email, nuqs search params).

**Tech Stack:** Next.js 16, React 19, Prisma 7, Resend v6+, Better Auth 1.5.6, Zod 4, nuqs 2.8, bun:test

---

## File Structure

### New Files

| File                                                              | Responsibility                            |
| ----------------------------------------------------------------- | ----------------------------------------- |
| `src/shared/emails/inquiry-reply.tsx`                             | Inquiry reply React email template        |
| `src/shared/emails/welcome.tsx`                                   | Welcome email React email template        |
| `src/shared/emails/reservation-reminder.tsx`                      | Reservation reminder React email template |
| `src/shared/lib/email/inquiry-emails.ts`                          | `sendInquiryReplyEmail` function          |
| `src/shared/lib/email/welcome-emails.ts`                          | `sendWelcomeEmail` function               |
| `src/shared/lib/email/reminder-emails.ts`                         | `sendReservationReminderEmail` function   |
| `src/shared/domain/inquiries/reply-commands.ts`                   | `replyToInquiryCommand` domain command    |
| `src/app/api/cron/reservation-reminder/route.ts`                  | CRON endpoint for reminders               |
| `__tests__/unit/shared/domain/inquiries/reply-commands.test.ts`   | Tests for inquiry reply                   |
| `__tests__/unit/lib/email/inquiry-emails.test.ts`                 | Tests for inquiry reply email             |
| `__tests__/unit/shared/domain/reservations/soft-delete.test.ts`   | Tests for soft-delete                     |
| `__tests__/unit/shared/domain/reservations/coupon-recalc.test.ts` | Tests for coupon recalculation            |

### Modified Files

| File                                                                                   | Changes                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                 | Add Inquiry reply fields, Reservation soft-delete fields             |
| `src/shared/lib/email/types.ts`                                                        | Add `InquiryReplyEmailData`, `WelcomeEmailData`, `ReminderEmailData` |
| `src/shared/domain/inquiries/commands.ts`                                              | Add `replyToInquiryCommand`                                          |
| `src/shared/domain/inquiries/queries.ts`                                               | Include reply fields in selects                                      |
| `src/shared/domain/inquiries/types.ts`                                                 | Add reply fields to `InquiryData`                                    |
| `src/shared/domain/reservations/commands.ts`                                           | Soft-delete + restore logic                                          |
| `src/shared/domain/reservations/customer-commands.ts`                                  | Coupon recalculation (remove TODO)                                   |
| `src/shared/domain/reservations/admin-queries.ts`                                      | Exclude soft-deleted, add deleted filter                             |
| `src/shared/domain/posts/queries.ts`                                                   | Add search/category filter params                                    |
| `src/shared/domain/news/queries.ts`                                                    | Add search filter param                                              |
| `src/shared/lib/nuqs/parsers.ts`                                                       | Add news/post search params                                          |
| `src/shared/lib/constants/cache.ts`                                                    | Add INQUIRIES cache tag if missing                                   |
| `src/app/(public)/news/page.tsx`                                                       | Add search UI                                                        |
| `src/app/(public)/posts/page.tsx`                                                      | Add search/category filter UI                                        |
| `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`       | Add reply form                                                       |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`                         | Add `replyToInquiry` action                                          |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`           | Add `restoreReservation` action                                      |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationActionCell.tsx` | Add restore option                                                   |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`      | Show deleted badge                                                   |
| `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`                      | Add comment moderation link                                          |
| `src/shared/lib/auth.ts`                                                               | Add Better Auth password reset + welcome email hooks                 |

---

## Task 1: Prisma Schema Changes (Migration)

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Inquiry reply fields to Prisma schema**

In `prisma/schema.prisma`, add to the `Inquiry` model:

```prisma
model Inquiry {
  // ... existing fields ...
  replyMessage   String?
  repliedAt      DateTime?
  repliedById    String?    @db.Uuid
  repliedBy      User?      @relation("InquiryReplies", fields: [repliedById], references: [id])
}
```

Add the reverse relation to `User`:

```prisma
model User {
  // ... existing relations ...
  inquiryReplies  Inquiry[]  @relation("InquiryReplies")
}
```

- [ ] **Step 2: Add Reservation soft-delete fields to Prisma schema**

In `prisma/schema.prisma`, add to the `Reservation` model:

```prisma
model Reservation {
  // ... existing fields ...
  deletedAt      DateTime?
  deletedById    String?    @db.Uuid
  deletedBy      User?      @relation("ReservationDeletions", fields: [deletedById], references: [id])
}
```

Add the reverse relation to `User`:

```prisma
model User {
  // ... existing relations ...
  reservationDeletions  Reservation[]  @relation("ReservationDeletions")
}
```

Add index for soft-delete queries:

```prisma
@@index([deletedAt])
```

- [ ] **Step 3: Generate and apply migration**

```bash
bunx --bun prisma migrate dev --name add_inquiry_reply_and_reservation_soft_delete
```

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(prisma): add inquiry reply fields and reservation soft-delete"
```

---

## Task 2: Email Types & Templates

**Files:**

- Modify: `src/shared/lib/email/types.ts`
- Create: `src/shared/emails/inquiry-reply.tsx`
- Create: `src/shared/emails/welcome.tsx`
- Create: `src/shared/emails/reservation-reminder.tsx`

- [ ] **Step 1: Add email data types**

In `src/shared/lib/email/types.ts`, add:

```typescript
export type InquiryReplyEmailData = {
  inquiryId: string;
  customerName: string;
  customerEmail: string;
  originalSubject: string;
  originalMessage: string;
  replyMessage: string;
  repliedByName: string;
};

export type WelcomeEmailData = {
  customerName: string;
  customerEmail: string;
  loginUrl: string;
};

export type ReminderEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  location: string | undefined;
  notes: string | undefined;
};
```

- [ ] **Step 2: Create inquiry reply email template**

Create `src/shared/emails/inquiry-reply.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  customerName: string;
  originalSubject: string;
  originalMessage: string;
  replyMessage: string;
  repliedByName: string;
  siteName: string;
};

export function InquiryReplyEmail({
  customerName,
  originalSubject,
  originalMessage,
  replyMessage,
  repliedByName,
  siteName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>お問い合わせへの回答: {originalSubject}</Preview>
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container
          style={{
            margin: "0 auto",
            padding: "20px 0 48px",
            maxWidth: "580px",
          }}
        >
          <Heading
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              marginBottom: "24px",
            }}
          >
            お問い合わせへの回答
          </Heading>
          <Text>{customerName} 様</Text>
          <Text>
            お問い合わせいただきありがとうございます。以下の通り回答いたします。
          </Text>
          <Section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              padding: "24px",
              marginBottom: "24px",
            }}
          >
            <Text style={{ fontWeight: "bold", marginBottom: "8px" }}>
              回答内容:
            </Text>
            <Text style={{ whiteSpace: "pre-wrap" }}>{replyMessage}</Text>
          </Section>
          <Hr />
          <Section
            style={{
              backgroundColor: "#f0f0f0",
              borderRadius: "8px",
              padding: "16px",
              marginTop: "16px",
            }}
          >
            <Text
              style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}
            >
              元のお問い合わせ:
            </Text>
            <Text style={{ fontSize: "12px", color: "#666" }}>
              件名: {originalSubject}
            </Text>
            <Text
              style={{
                fontSize: "12px",
                color: "#666",
                whiteSpace: "pre-wrap",
              }}
            >
              {originalMessage}
            </Text>
          </Section>
          <Text style={{ fontSize: "12px", color: "#999", marginTop: "24px" }}>
            担当: {repliedByName} | {siteName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Create welcome email template**

Create `src/shared/emails/welcome.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

type Props = {
  customerName: string;
  loginUrl: string;
  siteName: string;
};

export function WelcomeEmail({ customerName, loginUrl, siteName }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{siteName}へようこそ</Preview>
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container
          style={{
            margin: "0 auto",
            padding: "20px 0 48px",
            maxWidth: "580px",
          }}
        >
          <Heading style={{ fontSize: "24px", fontWeight: "bold" }}>
            {siteName}へようこそ
          </Heading>
          <Text>{customerName} 様</Text>
          <Text>
            アカウント登録が完了しました。マイページから予約の管理やお問い合わせ履歴の確認ができます。
          </Text>
          <Button
            href={loginUrl}
            style={{
              backgroundColor: "#000",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "bold",
              padding: "12px 24px",
              textDecoration: "none",
            }}
          >
            マイページへ
          </Button>
          <Text style={{ fontSize: "12px", color: "#999", marginTop: "24px" }}>
            {siteName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 4: Create reservation reminder email template**

Create `src/shared/emails/reservation-reminder.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

type Props = {
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  location: string | undefined;
  notes: string | undefined;
  siteName: string;
};

export function ReservationReminderEmail({
  customerName,
  spaceName,
  startTime,
  endTime,
  location,
  notes,
  siteName,
}: Props) {
  const dateStr = format(startTime, "yyyy年M月d日(E)", { locale: ja });
  const timeStr = `${format(startTime, "HH:mm")} - ${format(endTime, "HH:mm")}`;

  return (
    <Html>
      <Head />
      <Preview>明日のご予約リマインダー: {spaceName}</Preview>
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container
          style={{
            margin: "0 auto",
            padding: "20px 0 48px",
            maxWidth: "580px",
          }}
        >
          <Heading style={{ fontSize: "24px", fontWeight: "bold" }}>
            ご予約リマインダー
          </Heading>
          <Text>{customerName} 様</Text>
          <Text>明日のご予約についてお知らせいたします。</Text>
          <Section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              padding: "24px",
            }}
          >
            <Text>
              <strong>スペース:</strong> {spaceName}
            </Text>
            <Text>
              <strong>日時:</strong> {dateStr} {timeStr}
            </Text>
            {location && (
              <Text>
                <strong>場所:</strong> {location}
              </Text>
            )}
            {notes && (
              <Text>
                <strong>備考:</strong> {notes}
              </Text>
            )}
          </Section>
          <Text style={{ fontSize: "12px", color: "#999", marginTop: "24px" }}>
            {siteName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email/types.ts src/shared/emails/
git commit -m "feat(email): add inquiry reply, welcome, and reminder email templates"
```

---

## Task 3: Email Send Functions

**Files:**

- Create: `src/shared/lib/email/inquiry-emails.ts`
- Create: `src/shared/lib/email/welcome-emails.ts`
- Create: `src/shared/lib/email/reminder-emails.ts`

- [ ] **Step 1: Create inquiry reply email send function**

Create `src/shared/lib/email/inquiry-emails.ts`:

```typescript
import "server-only";
import { render } from "@react-email/render";
import { sendEmail } from "./send";
import type { EmailResult, InquiryReplyEmailData } from "./types";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { getSiteSettings } from "@/shared/domain/settings/queries/site";

export async function sendInquiryReplyEmail(
  data: InquiryReplyEmailData,
): Promise<EmailResult> {
  const settings = await getSiteSettings();
  const siteName = settings?.siteName ?? "Myrrh Rental Space";

  return sendEmail(
    async (resend, from) => {
      return resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【お問い合わせ回答】${data.originalSubject}`,
        react: InquiryReplyEmail({
          customerName: data.customerName,
          originalSubject: data.originalSubject,
          originalMessage: data.originalMessage,
          replyMessage: data.replyMessage,
          repliedByName: data.repliedByName,
          siteName,
        }),
      });
    },
    { operation: "sendInquiryReplyEmail", inquiryId: data.inquiryId },
  );
}
```

- [ ] **Step 2: Create welcome email send function**

Create `src/shared/lib/email/welcome-emails.ts`:

```typescript
import "server-only";
import { sendEmail } from "./send";
import type { EmailResult, WelcomeEmailData } from "./types";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { getSiteSettings } from "@/shared/domain/settings/queries/site";

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
): Promise<EmailResult> {
  const settings = await getSiteSettings();
  const siteName = settings?.siteName ?? "Myrrh Rental Space";

  return sendEmail(
    async (resend, from) => {
      return resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【${siteName}】ご登録ありがとうございます`,
        react: WelcomeEmail({
          customerName: data.customerName,
          loginUrl: data.loginUrl,
          siteName,
        }),
      });
    },
    { operation: "sendWelcomeEmail", email: data.customerEmail },
  );
}
```

- [ ] **Step 3: Create reminder email send function**

Create `src/shared/lib/email/reminder-emails.ts`:

```typescript
import "server-only";
import { sendEmail } from "./send";
import type { EmailResult, ReminderEmailData } from "./types";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { getSiteSettings } from "@/shared/domain/settings/queries/site";

export async function sendReservationReminderEmail(
  data: ReminderEmailData,
): Promise<EmailResult> {
  const settings = await getSiteSettings();
  const siteName = settings?.siteName ?? "Myrrh Rental Space";

  return sendEmail(
    async (resend, from) => {
      return resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【ご予約リマインダー】${data.spaceName}`,
        react: ReservationReminderEmail({
          customerName: data.customerName,
          spaceName: data.spaceName,
          startTime: data.startTime,
          endTime: data.endTime,
          location: data.location,
          notes: data.notes,
          siteName,
        }),
      });
    },
    {
      operation: "sendReservationReminderEmail",
      reservationId: data.reservationId,
    },
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/email/inquiry-emails.ts src/shared/lib/email/welcome-emails.ts src/shared/lib/email/reminder-emails.ts
git commit -m "feat(email): add send functions for inquiry reply, welcome, and reminder"
```

---

## Task 4: Reservation Reminder CRON

**Files:**

- Create: `src/app/api/cron/reservation-reminder/route.ts`

- [ ] **Step 1: Create CRON route handler**

Create `src/app/api/cron/reservation-reminder/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/shared/lib/cron-auth";
import { prisma } from "@/shared/db/prisma";
import { sendReservationReminderEmail } from "@/shared/lib/email/reminder-emails";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = verifyCronAuth(request);
  if (!authResult.success) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find reservations starting tomorrow (within 24-48 hour window)
  const startOfWindow = new Date(tomorrow);
  startOfWindow.setHours(0, 0, 0, 0);
  const endOfWindow = new Date(tomorrow);
  endOfWindow.setHours(23, 59, 59, 999);

  const reservations = await prisma.reservation.findMany({
    where: {
      startTime: { gte: startOfWindow, lte: endOfWindow },
      status: { in: ACTIVE_RESERVATION_STATUSES },
      deletedAt: null,
      customer: { email: { not: null } },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      notes: true,
      customer: { select: { firstName: true, lastName: true, email: true } },
      space: {
        select: {
          name: true,
          location: { select: { name: true } },
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const reservation of reservations) {
    const email = reservation.customer?.email;
    if (!email) {
      skipped++;
      continue;
    }

    try {
      await sendReservationReminderEmail({
        reservationId: reservation.id,
        customerEmail: email,
        customerName:
          `${reservation.customer?.lastName ?? ""} ${reservation.customer?.firstName ?? ""}`.trim() ||
          "お客様",
        spaceName: reservation.space.name,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        location: reservation.space.location?.name,
        notes: reservation.notes ?? undefined,
      });
      sent++;
    } catch (error) {
      logError(error, {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "reservationReminder",
          reservationId: reservation.id,
        },
      });
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, total: reservations.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/reservation-reminder/
git commit -m "feat(cron): add reservation reminder email CRON endpoint"
```

---

## Task 5: Inquiry Reply Feature

**Files:**

- Modify: `src/shared/domain/inquiries/types.ts`
- Modify: `src/shared/domain/inquiries/commands.ts`
- Modify: `src/shared/domain/inquiries/queries.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`

- [ ] **Step 1: Write failing test for reply command**

Create `__tests__/unit/shared/domain/inquiries/reply-commands.test.ts` with tests for `replyToInquiryCommand` — validate it updates inquiry with reply message, sets repliedAt, sets status to IN_PROGRESS.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/unit/shared/domain/inquiries/reply-commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Update inquiry types**

In `src/shared/domain/inquiries/types.ts`, add reply fields to `InquiryData`:

```typescript
// Add to the InquiryData type
replyMessage: string | null;
repliedAt: string | null; // serialized Date
repliedByName: string | null;
```

- [ ] **Step 4: Update inquiry queries to include reply fields**

In `src/shared/domain/inquiries/queries.ts`, add to the select objects:

```typescript
replyMessage: true,
repliedAt: true,
repliedBy: { select: { name: true } },
```

- [ ] **Step 5: Add replyToInquiry command**

In `src/shared/domain/inquiries/commands.ts`, add:

```typescript
export async function replyToInquiryCommand(
  inquiryId: string,
  replyMessage: string,
  userId: string,
): Promise<{ id: string }> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { id: true, status: true },
  });
  if (!inquiry) throw new DomainError("お問い合わせが見つかりません");

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: {
      replyMessage,
      repliedAt: new Date(),
      repliedById: userId,
      status: "IN_PROGRESS",
    },
  });

  return { id: inquiryId };
}
```

- [ ] **Step 6: Add replyToInquiry Server Action**

In `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`, add:

```typescript
export async function replyToInquiry(
  inquiryId: string,
  replyMessage: string,
): Promise<MutationResult<{ id: string }>> {
  if (!replyMessage.trim()) {
    return { error: "回答内容を入力してください" };
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: inquiryId,
    execute: async (user) => {
      const result = await replyToInquiryCommand(
        inquiryId,
        replyMessage,
        user.id,
      );

      // Send reply email (fire-and-forget)
      const inquiry = await prisma.inquiry.findUnique({
        where: { id: inquiryId },
        select: {
          name: true,
          email: true,
          subject: true,
          message: true,
        },
      });

      if (inquiry) {
        fireAndForget(
          sendInquiryReplyEmail({
            inquiryId,
            customerName: inquiry.name,
            customerEmail: inquiry.email,
            originalSubject: inquiry.subject,
            originalMessage: inquiry.message,
            replyMessage,
            repliedByName: user.name ?? "スタッフ",
          }),
          {
            operation: "sendInquiryReplyEmail",
            category: ErrorCategory.EXTERNAL_API,
          },
        );
      }

      return result;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}
```

- [ ] **Step 7: Update InquiryDetail UI with reply form**

In `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`, add a reply section:

- Show existing reply if `replyMessage` exists (read-only card with repliedAt timestamp)
- Show reply form (Textarea + SubmitButton) if no reply yet
- Use `useTransition` + `replyToInquiry` action
- After success, show toast and refresh

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test __tests__/unit/shared/domain/inquiries/reply-commands.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/shared/domain/inquiries/ src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/inquiry.ts src/app/'(admin)'/admin/'(dashboard)'/inquiries/ __tests__/
git commit -m "feat(inquiry): add reply feature with email notification"
```

---

## Task 6: News & Blog Search/Filter

**Files:**

- Modify: `src/shared/domain/news/queries.ts`
- Modify: `src/shared/domain/posts/queries.ts`
- Modify: `src/shared/lib/nuqs/parsers.ts`
- Modify: `src/app/(public)/news/page.tsx`
- Modify: `src/app/(public)/posts/page.tsx`

- [ ] **Step 1: Add search params for news and posts**

In `src/shared/lib/nuqs/parsers.ts`, add:

```typescript
// News search params
export const newsSearchParamsParsers = {
  page: parseAsPage,
  q: parseAsQuery,
};
const newsSearchParamsCache = createSearchParamsCache(newsSearchParamsParsers);
export async function loadNewsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await newsSearchParamsCache.parse(searchParams);
  return newsSearchParamsCache.all();
}

// Post search params (with category)
export const postSearchParamsParsers = {
  page: parseAsPage,
  q: parseAsQuery,
  category: parseAsString.withDefault(""),
};
const postSearchParamsCache = createSearchParamsCache(postSearchParamsParsers);
export async function loadPostSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await postSearchParamsCache.parse(searchParams);
  return postSearchParamsCache.all();
}
```

- [ ] **Step 2: Update news query with search parameter**

In `src/shared/domain/news/queries.ts`, update `getPublishedNewsList`:

```typescript
export async function getPublishedNewsList(
  page: number = 1,
  search: string = "",
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.NEWS);

  const where: Prisma.NewsWhereInput = {
    isPublished: true,
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.news.findMany({
      select: newsListSelect,
      where,
      orderBy: { publishedAt: "desc" },
      skip: (Math.max(1, page) - 1) * ITEM_PER_PAGE,
      take: ITEM_PER_PAGE,
    }),
    prisma.news.count({ where }),
  ]);

  return {
    items: toPlainArray(items),
    totalPages: Math.ceil(totalCount / ITEM_PER_PAGE),
    currentPage: page,
  };
}
```

- [ ] **Step 3: Update posts query with search and category**

In `src/shared/domain/posts/queries.ts`, update `getPublishedPostsList`:

```typescript
export async function getPublishedPostsList(
  page: number = 1,
  search: string = "",
  categorySlug: string = "",
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS);

  const where: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { excerpt: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
  };

  const [posts, totalCount] = await Promise.all([
    prisma.post.findMany({
      select: postListSelect,
      where,
      orderBy: { publishedAt: "desc" },
      skip: (Math.max(1, page) - 1) * POST_PER_PAGE,
      take: POST_PER_PAGE,
    }),
    prisma.post.count({ where }),
  ]);

  return {
    posts: toPlainArray(posts),
    totalPages: Math.ceil(totalCount / POST_PER_PAGE),
    currentPage: page,
  };
}
```

Add a categories query if not exists:

```typescript
export async function getPostCategories() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS);

  const categories = await prisma.postCategory.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return toPlainArray(categories);
}
```

- [ ] **Step 4: Update news page with search UI**

In `src/app/(public)/news/page.tsx`:

```typescript
import { loadNewsSearchParams } from "@/shared/lib/nuqs";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { page, q } = await loadNewsSearchParams(searchParams);
  const { items, totalPages, currentPage } = await getPublishedNewsList(
    page,
    q,
  );
  // ... render with SearchInput + existing list
}
```

Add a client SearchInput component that uses `useQueryStates(newsSearchParamsParsers)`.

- [ ] **Step 5: Update posts page with search + category filter**

In `src/app/(public)/posts/page.tsx`:

```typescript
import { loadPostSearchParams } from "@/shared/lib/nuqs";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { page, q, category } = await loadPostSearchParams(searchParams);
  const [postsResult, categories] = await Promise.all([
    getPublishedPostsList(page, q, category),
    getPostCategories(),
  ]);
  // ... render with SearchInput + CategoryFilter + existing grid
}
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/domain/news/ src/shared/domain/posts/ src/shared/lib/nuqs/ src/app/'(public)'/news/ src/app/'(public)'/posts/
git commit -m "feat(public): add search and category filter to news and posts pages"
```

---

## Task 7: Coupon/Duration Discount Recalculation

**Files:**

- Modify: `src/shared/domain/reservations/customer-commands.ts`
- Test: `__tests__/unit/shared/domain/reservations/coupon-recalc.test.ts`

- [ ] **Step 1: Write failing test**

Create test that verifies: when customer updates reservation times, the coupon and duration discounts are recalculated using `calculateReservationPrice`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/unit/shared/domain/reservations/coupon-recalc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement recalculation in updateCustomerReservation**

In `src/shared/domain/reservations/customer-commands.ts`, replace the TODO with actual recalculation:

```typescript
// Remove the TODO comment and the early return for manual discounts
// Instead, recalculate using calculateReservationPrice:

import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";

// Inside updateCustomerReservation, after detecting time changes:
const priceResult = calculateReservationPrice({
  hourlyPrice: space.hourlyPrice,
  hours: differenceInHours(newEndTime, newStartTime),
  spaceDiscount: space.discountSettings ?? undefined,
  durationDiscountEnabled: settings.durationDiscountEnabled,
  durationRules: parseDurationDiscountRules(settings.durationDiscountRules),
  coupon: originalReservation.coupon ?? undefined,
  combinationMode: settings.discountCombinationMode,
});

// Update with recalculated values
await tx.reservation.update({
  where: { id: reservationId },
  data: {
    startTime: newStartTime,
    endTime: newEndTime,
    basePrice: priceResult.basePrice,
    totalPrice: priceResult.totalPrice,
    spaceDiscountAmount: priceResult.spaceDiscount,
    durationDiscountAmount: priceResult.durationDiscount,
    couponDiscountAmount: priceResult.couponDiscount,
    // Recalculate tax
    taxAmount: priceResult.totalPrice * Number(originalReservation.taxRate),
    totalPriceWithTax:
      priceResult.totalPrice * (1 + Number(originalReservation.taxRate)),
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/unit/shared/domain/reservations/coupon-recalc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/reservations/customer-commands.ts __tests__/
git commit -m "feat(reservation): implement coupon and duration discount recalculation on customer update"
```

---

## Task 8: Reservation Soft-Delete & Restore

**Files:**

- Modify: `src/shared/domain/reservations/commands.ts`
- Modify: `src/shared/domain/reservations/admin-queries.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`

- [ ] **Step 1: Write failing test for soft-delete**

Create `__tests__/unit/shared/domain/reservations/soft-delete.test.ts` — test that `deleteReservationCommand` sets `deletedAt` instead of hard-deleting, and `restoreReservationCommand` clears it.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Modify deleteReservationCommand to soft-delete**

In `src/shared/domain/reservations/commands.ts`, change `deleteReservationCommand`:

```typescript
export async function deleteReservationCommand(
  id: string,
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, couponId: true },
    });
    if (!reservation) throw new DomainError("予約が見つかりません");

    // Soft-delete
    await tx.reservation.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    // Decrement coupon usage
    if (reservation.couponId) {
      await tx.coupon.updateMany({
        where: { id: reservation.couponId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
  });
}
```

- [ ] **Step 4: Add restoreReservationCommand**

In `src/shared/domain/reservations/commands.ts`:

```typescript
export async function restoreReservationCommand(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, couponId: true },
    });
    if (!reservation) throw new DomainError("予約が見つかりません");
    if (!reservation.deletedAt)
      throw new DomainError("この予約は削除されていません");

    await tx.reservation.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });

    // Re-increment coupon usage
    if (reservation.couponId) {
      await tx.coupon.update({
        where: { id: reservation.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }
  });
}
```

- [ ] **Step 5: Update all reservation queries to exclude soft-deleted**

In `src/shared/domain/reservations/admin-queries.ts`, add `deletedAt: null` to all `where` clauses. Add an optional `includeDeleted` parameter for the admin list.

- [ ] **Step 6: Add restoreReservation Server Action**

In `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`:

```typescript
export async function restoreReservation(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await restoreReservationCommand(id);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(id));
      updateTag(getCacheTag.reservations.calendar());
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
  });
}
```

- [ ] **Step 7: Update ReservationActionCell with restore option**

Add conditional "復元" menu item when `deletedAt` is truthy.

- [ ] **Step 8: Update ReservationTable with deleted badge**

Show "削除済み" badge with opacity styling (following PostComment pattern).

- [ ] **Step 9: Run test to verify it passes**

- [ ] **Step 10: Commit**

```bash
git add src/shared/domain/reservations/ src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/reservation/ src/app/'(admin)'/admin/'(dashboard)'/reservations/ __tests__/
git commit -m "feat(reservation): implement soft-delete and restore with coupon usage management"
```

---

## Task 9: Comment Moderation Sidebar Link

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`

- [ ] **Step 1: Add comment moderation to sidebar**

In `sidebar-items.tsx`, add after the "投稿" item:

```typescript
import { MessageSquare } from "lucide-react";

// After the posts item:
{
  label: "コメント管理",
  href: "/admin/posts/comments",
  icon: <MessageSquare className="h-5 w-5" />,
},
```

- [ ] **Step 2: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_components/sidebar-items.tsx
git commit -m "feat(admin): add comment moderation to sidebar navigation"
```

---

## Task 10: Welcome Email on Customer Registration

**Files:**

- Modify: `src/shared/lib/auth.ts` or customer creation flow

- [ ] **Step 1: Integrate welcome email into ensureCustomerLinked**

In the customer creation flow (where new customers are created on first social login), add a fire-and-forget welcome email after customer creation:

```typescript
import { fireAndForget } from "@/shared/lib/fire-and-forget";
import { sendWelcomeEmail } from "@/shared/lib/email/welcome-emails";
import { getAppUrl } from "@/shared/lib/env/server";

// After creating a new customer in ensureCustomerLinked:
fireAndForget(
  sendWelcomeEmail({
    customerName: customer.lastName ?? user.name ?? "お客様",
    customerEmail: user.email,
    loginUrl: `${getAppUrl()}/mypage`,
  }),
  { operation: "sendWelcomeEmail", category: ErrorCategory.EXTERNAL_API },
);
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/domain/customers/ src/shared/lib/auth.ts
git commit -m "feat(email): send welcome email on new customer registration"
```

---

## Task 11: Validation & Final Verification

- [ ] **Step 1: Run type-check**

```bash
bun run type-check
```

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

- [ ] **Step 3: Run all tests**

```bash
bun run test
```

- [ ] **Step 4: Run build**

```bash
bun run build
```

- [ ] **Step 5: Fix any issues found**

- [ ] **Step 6: Final commit**

```bash
git commit -m "fix: address validation issues from gap remediation"
```
