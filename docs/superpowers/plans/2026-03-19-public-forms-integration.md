# Public Forms Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire public contact and reservation forms to the domain layer, enabling real form submissions that flow into the admin dashboard with email notifications and calendar integration.

**Architecture:** Public Server Actions (no auth) with Turnstile bot protection, Zod validation, and fire-and-forget email/calendar side effects. Domain commands handle DB writes inside transactions. Admin cache is invalidated immediately via `updateTag()`.

**Tech Stack:** Next.js 16 Server Actions, Zod 4, react-hook-form + standardSchemaResolver, Prisma 7, Resend email, Google Calendar sync

---

## File Structure

### New Files

| File                                                             | Responsibility                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `src/shared/lib/validations/inquiry.ts`                          | Public inquiry Zod schema                                 |
| `src/shared/lib/validations/public-reservation.ts`               | Public reservation Zod schema                             |
| `src/app/(public)/_shared/actions/inquiry.ts`                    | Public Server Action: submit inquiry                      |
| `src/app/(public)/_shared/actions/reservation.ts`                | Public Server Action: submit reservation                  |
| `src/app/(public)/_shared/hooks/use-public-form.ts`              | Public form hook (react-hook-form + useTransition)        |
| `src/app/(public)/contact/_components/contact-form.tsx`          | Rewritten contact form (replaces ContactForm.tsx)         |
| `src/app/(public)/reservation/_components/reservation-form.tsx`  | Rewritten reservation form (replaces ReservationForm.tsx) |
| `src/app/(public)/reservation/_components/date-time-step.tsx`    | Step 1: Space + date/time selection                       |
| `src/app/(public)/reservation/_components/customer-step.tsx`     | Step 2: Customer info                                     |
| `src/app/(public)/reservation/_components/confirmation-step.tsx` | Step 3: Confirmation + submit                             |
| `__tests__/shared/domain/inquiries/commands.test.ts`             | Unit tests for createInquiryCommand                       |
| `__tests__/shared/domain/reservations/public-commands.test.ts`   | Unit tests for createPublicReservationCommand             |
| `__tests__/shared/lib/validations/inquiry.test.ts`               | Schema validation tests                                   |
| `__tests__/shared/lib/validations/public-reservation.test.ts`    | Schema validation tests                                   |

### Modified Files

| File                                         | Change                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `src/shared/domain/inquiries/commands.ts`    | Add `createInquiryCommand()`                        |
| `src/shared/domain/reservations/commands.ts` | Add `createPublicReservationCommand()`              |
| `src/app/(public)/contact/page.tsx`          | Import new contact-form, delete old ContactForm.tsx |
| `src/app/(public)/reservation/page.tsx`      | Fetch spaces in Server Component, pass as props     |

### Deleted Files

| File                                                           | Reason                                      |
| -------------------------------------------------------------- | ------------------------------------------- |
| `src/app/(public)/contact/_components/ContactForm.tsx`         | Replaced by kebab-case contact-form.tsx     |
| `src/app/(public)/reservation/_components/ReservationForm.tsx` | Replaced by kebab-case reservation-form.tsx |

---

## Task 1: Inquiry Zod Schema

**Files:**

- Create: `src/shared/lib/validations/inquiry.ts`
- Test: `__tests__/shared/lib/validations/inquiry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/shared/lib/validations/inquiry.test.ts
import { describe, test, expect } from "bun:test";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";

describe("publicInquirySchema", () => {
  test("valid input passes", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田 太郎",
      email: "test@example.com",
      subject: "スペースについて",
      message: "利用可能な日程を教えてください。",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty name", () => {
    const result = publicInquirySchema.safeParse({
      name: "",
      email: "test@example.com",
      subject: "件名",
      message: "本文",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田",
      email: "not-an-email",
      subject: "件名",
      message: "本文",
    });
    expect(result.success).toBe(false);
  });

  test("rejects message over 5000 chars", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田",
      email: "test@example.com",
      subject: "件名",
      message: "あ".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  test("optional turnstileToken", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田",
      email: "test@example.com",
      subject: "件名",
      message: "本文",
      turnstileToken: "token123",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/shared/lib/validations/inquiry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/shared/lib/validations/inquiry.ts
import { z } from "zod";

export const publicInquirySchema = z.object({
  name: z
    .string()
    .min(1, { error: "お名前は必須です" })
    .max(100, { error: "お名前は100文字以内で入力してください" }),
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  subject: z
    .string()
    .min(1, { error: "件名は必須です" })
    .max(200, { error: "件名は200文字以内で入力してください" }),
  message: z
    .string()
    .min(1, { error: "お問い合わせ内容は必須です" })
    .max(5000, { error: "お問い合わせ内容は5000文字以内で入力してください" }),
  turnstileToken: z.string().optional(),
});

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/shared/lib/validations/inquiry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/validations/inquiry.ts __tests__/shared/lib/validations/inquiry.test.ts
git commit -m "feat(inquiry): add public inquiry Zod schema with tests"
```

---

## Task 2: createInquiryCommand Domain Command

**Files:**

- Modify: `src/shared/domain/inquiries/commands.ts`
- Test: `__tests__/shared/domain/inquiries/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/shared/domain/inquiries/commands.test.ts
import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock prisma before importing commands
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: {
      create: mock(() =>
        Promise.resolve({
          id: "test-uuid-1234",
          name: "山田 太郎",
          email: "test@example.com",
          subject: "テスト件名",
          message: "テスト本文",
          status: "NEW",
          createdAt: new Date("2026-03-19"),
          updatedAt: new Date("2026-03-19"),
        }),
      ),
      findUnique: mock(() => Promise.resolve({ id: "test-uuid-1234" })),
      update: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
    },
  },
}));

const { createInquiryCommand } =
  await import("@/shared/domain/inquiries/commands");

describe("createInquiryCommand", () => {
  test("creates inquiry and returns id", async () => {
    const result = await createInquiryCommand({
      name: "山田 太郎",
      email: "test@example.com",
      subject: "テスト件名",
      message: "テスト本文",
    });

    expect(result).toEqual({
      id: "test-uuid-1234",
      emailData: {
        inquiryId: "test-uuid-1234",
        name: "山田 太郎",
        email: "test@example.com",
        subject: "テスト件名",
        message: "テスト本文",
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/shared/domain/inquiries/commands.test.ts`
Expected: FAIL — `createInquiryCommand` is not a function

- [ ] **Step 3: Add createInquiryCommand to commands.ts**

Add to `src/shared/domain/inquiries/commands.ts` (after existing functions):

```typescript
type CreateInquiryInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

type CreateInquiryResult = {
  id: string;
  emailData: {
    inquiryId: string;
    name: string;
    email: string;
    subject: string;
    message: string;
  };
};

export async function createInquiryCommand(
  input: CreateInquiryInput,
): Promise<CreateInquiryResult> {
  const inquiry = await prisma.inquiry.create({
    data: {
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      status: InquiryStatus.NEW,
    },
  });

  return {
    id: inquiry.id,
    emailData: {
      inquiryId: inquiry.id,
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/shared/domain/inquiries/commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/inquiries/commands.ts __tests__/shared/domain/inquiries/commands.test.ts
git commit -m "feat(inquiry): add createInquiryCommand domain command"
```

---

## Task 3: Public Form Hook (usePublicForm)

**Files:**

- Create: `src/app/(public)/_shared/hooks/use-public-form.ts`

A lightweight alternative to the admin's `useFormAction` — no sonner toast, no admin router logic. Returns `MutationResult` for the component to handle success/error UI.

- [ ] **Step 1: Write the hook**

```typescript
// src/app/(public)/_shared/hooks/use-public-form.ts
"use client";

import { useTransition } from "react";
import {
  useForm,
  type FieldValues,
  type DefaultValues,
  type Path,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";

type UsePublicFormOptions<TInput extends FieldValues> = {
  defaultValues?: DefaultValues<TInput>;
};

export function usePublicForm<TInput extends FieldValues, TOutput = null>(
  schema: StandardSchemaV1<TInput, TInput>,
  action: (data: TInput) => Promise<MutationResult<TOutput>>,
  options?: UsePublicFormOptions<TInput>,
) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<TInput>({
    resolver: standardSchemaResolver(schema),
    ...(options?.defaultValues !== undefined && {
      defaultValues: options.defaultValues,
    }),
  });

  const onSubmit = form.handleSubmit((data: TInput) => {
    startTransition(async () => {
      const result = await action(data);

      if (isMutationError(result)) {
        if (result.fieldErrors) {
          const currentValues = form.getValues();
          for (const [field, errors] of Object.entries(result.fieldErrors)) {
            if (errors && errors.length > 0 && field in currentValues) {
              const firstError = errors[0];
              form.setError(field as Path<TInput>, {
                type: "server",
                ...(firstError !== undefined && { message: firstError }),
              });
            }
          }
        }
      }
    });
  });

  return { form, isPending, onSubmit };
}
```

- [ ] **Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(public)/_shared/hooks/use-public-form.ts'
git commit -m "feat: add usePublicForm hook for public page forms"
```

---

## Task 4: Public Inquiry Server Action

**Files:**

- Create: `src/app/(public)/_shared/actions/inquiry.ts`

- [ ] **Step 1: Write the Server Action**

```typescript
// src/app/(public)/_shared/actions/inquiry.ts
"use server";

import { updateTag } from "next/cache";
import {
  publicInquirySchema,
  type PublicInquiryInput,
} from "@/shared/lib/validations/inquiry";
import {
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createInquiryCommand } from "@/shared/domain/inquiries/commands";
import {
  sendContactConfirmationEmail,
  sendContactAdminNotification,
} from "@/shared/lib/email-service";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import { DomainError } from "@/shared/domain/domain-error";

export async function submitInquiry(
  input: PublicInquiryInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Validate input
  const parsed = publicInquirySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 2. Turnstile verification
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3. Create inquiry
  try {
    const result = await createInquiryCommand({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    // 4. Invalidate admin cache
    updateTag(CACHE_TAGS.INQUIRIES, CACHE_LIFE.DYNAMIC_DATA);
    updateTag(getCacheTag.inquiries.list(), CACHE_LIFE.DYNAMIC_DATA);

    // 5. Send emails (fire-and-forget)
    fireAndForget(sendContactConfirmationEmail(result.emailData), {
      operation: "sendContactConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
    });
    fireAndForget(sendContactAdminNotification(result.emailData), {
      operation: "sendContactAdminNotification",
      category: ErrorCategory.EXTERNAL_API,
    });

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
```

- [ ] **Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(public)/_shared/actions/inquiry.ts'
git commit -m "feat(inquiry): add public submitInquiry Server Action"
```

---

## Task 5: Rewrite Contact Form

**Files:**

- Create: `src/app/(public)/contact/_components/contact-form.tsx`
- Delete: `src/app/(public)/contact/_components/ContactForm.tsx`
- Modify: `src/app/(public)/contact/page.tsx`

- [ ] **Step 1: Write the new contact form component**

```typescript
// src/app/(public)/contact/_components/contact-form.tsx
"use client";

import { useState, type ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { MagneticButton } from "@/public/components/animations/magnetic-button";
import { Input, Textarea } from "@/public/components/design-system";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import { submitInquiry } from "@/public/actions/inquiry";
import { isMutationError } from "@/shared/lib/mutation-result";

export function ContactForm(): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { form, isPending, onSubmit } = usePublicForm(
    publicInquirySchema,
    async (data) => {
      setErrorMessage(null);
      const result = await submitInquiry(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setSubmitted(true);
      }
      return result;
    },
  );

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface p-8 text-center">
          <h2 className="font-heading text-xl tracking-tight">
            お問い合わせを受け付けました
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            確認メールをお送りしましたのでご確認ください。
            <br />
            担当者より改めてご連絡いたします。
          </p>
        </div>
      </ScrollReveal>
    );
  }

  return (
    <ScrollReveal>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="contact-name"
            label="お名前"
            type="text"
            placeholder="山田 太郎"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Input
            id="contact-email"
            label="メールアドレス"
            type="email"
            placeholder="mail@example.com"
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
        </div>

        <Input
          id="contact-subject"
          label="件名"
          type="text"
          placeholder="お問い合わせの件名"
          error={form.formState.errors.subject?.message}
          {...form.register("subject")}
        />

        <Textarea
          id="contact-message"
          label="お問い合わせ内容"
          rows={5}
          placeholder="お問い合わせ内容をご記入ください"
          error={form.formState.errors.message?.message}
          {...form.register("message")}
        />

        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="pt-2">
          <MagneticButton strength={0.2} disabled={isPending}>
            {isPending ? "送信中..." : "送信する"}
          </MagneticButton>
        </div>
      </form>
    </ScrollReveal>
  );
}
```

- [ ] **Step 2: Update contact page.tsx import**

In `src/app/(public)/contact/page.tsx`, change:

```typescript
// Before
import { ContactForm } from "./_components/ContactForm";
// After
import { ContactForm } from "./_components/contact-form";
```

- [ ] **Step 3: Delete old ContactForm.tsx**

```bash
git rm 'src/app/(public)/contact/_components/ContactForm.tsx'
```

- [ ] **Step 4: Check design system Input/Textarea accept ref and register props**

Read `src/app/(public)/_shared/components/design-system/input.tsx` and `textarea.tsx` to verify they accept `ref` prop (React 19 pattern) and spread props. If they don't accept `ref`/`name`/`onChange`/`onBlur` (needed by react-hook-form `register()`), update them to accept `...rest` props.

**Important:** The public design system components may need to be updated to forward refs and accept react-hook-form's register props. Check and update if needed before proceeding.

- [ ] **Step 5: Run type check + dev server check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(public)/contact/_components/contact-form.tsx' 'src/app/(public)/contact/page.tsx'
git commit -m "feat(contact): rewrite contact form with real submission

- Replace dummy form with react-hook-form + Zod validation
- Submit via Server Action → DB → email notifications
- Success state shows confirmation message
- Delete old PascalCase ContactForm.tsx"
```

---

## Task 6: Public Reservation Zod Schema

**Files:**

- Create: `src/shared/lib/validations/public-reservation.ts`
- Test: `__tests__/shared/lib/validations/public-reservation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/shared/lib/validations/public-reservation.test.ts
import { describe, test, expect } from "bun:test";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";

describe("publicReservationSchema", () => {
  const validInput = {
    spaceId: "550e8400-e29b-41d4-a716-446655440000",
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "13:00",
    numberOfGuests: 10,
    lastName: "山田",
    firstName: "太郎",
    email: "test@example.com",
    phoneNumber: "03-1234-5678",
    notes: "",
    agreeToTerms: true,
  };

  test("valid input passes", () => {
    const result = publicReservationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("rejects missing spaceId", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      spaceId: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid date format", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      date: "2026/04/01",
    });
    expect(result.success).toBe(false);
  });

  test("rejects agreeToTerms=false", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      agreeToTerms: false,
    });
    expect(result.success).toBe(false);
  });

  test("rejects endTime before startTime", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      startTime: "17:00",
      endTime: "13:00",
    });
    expect(result.success).toBe(false);
  });

  test("phoneNumber is optional", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      phoneNumber: "",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/shared/lib/validations/public-reservation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/shared/lib/validations/public-reservation.ts
import { z } from "zod";

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  error: "日付の形式が正しくありません（YYYY-MM-DD）",
});

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, {
  error: "時間の形式が正しくありません（HH:MM）",
});

export const publicReservationSchema = z
  .object({
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    numberOfGuests: z
      .number()
      .int()
      .min(1, { error: "利用人数は1名以上です" })
      .max(500, { error: "利用人数は500名以下です" }),
    lastName: z
      .string()
      .min(1, { error: "姓は必須です" })
      .max(50, { error: "姓は50文字以内で入力してください" }),
    firstName: z
      .string()
      .min(1, { error: "名は必須です" })
      .max(50, { error: "名は50文字以内で入力してください" }),
    email: z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" }),
    phoneNumber: z
      .string()
      .max(20, { error: "電話番号は20文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    notes: z
      .string()
      .max(2000, { error: "備考は2000文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    agreeToTerms: z.literal(true, {
      error: "利用規約への同意が必要です",
    }),
    turnstileToken: z.string().optional(),
  })
  .refine(
    (data) => {
      const start = Number(data.startTime.replace(":", ""));
      const end = Number(data.endTime.replace(":", ""));
      return end > start;
    },
    { error: "終了時間は開始時間より後にしてください", path: ["endTime"] },
  );

export type PublicReservationInput = z.input<typeof publicReservationSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/shared/lib/validations/public-reservation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/validations/public-reservation.ts __tests__/shared/lib/validations/public-reservation.test.ts
git commit -m "feat(reservation): add public reservation Zod schema with tests"
```

---

## Task 7: createPublicReservationCommand Domain Command

**Files:**

- Modify: `src/shared/domain/reservations/commands.ts`
- Test: `__tests__/shared/domain/reservations/public-commands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/shared/domain/reservations/public-commands.test.ts
import { describe, test, expect, mock } from "bun:test";

const mockCreate = mock(() =>
  Promise.resolve({
    id: "res-uuid-1234",
    customer: {
      lastName: "山田",
      firstName: "太郎",
      email: "test@example.com",
    },
  }),
);
const mockFindFirst = mock(() => Promise.resolve(null)); // no overlap
const mockCustomerFindUnique = mock(() => Promise.resolve(null)); // new customer
const mockCustomerCreate = mock(() =>
  Promise.resolve({ id: "cust-uuid-1234" }),
);
const mockCustomerUpdate = mock(() =>
  Promise.resolve({ id: "cust-uuid-1234" }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findUnique: mock(() =>
        Promise.resolve({
          id: "space-1",
          name: "会議室A",
          address: "東京都渋谷区",
          hourlyPrice: 8000,
        }),
      ),
    },
    reservation: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
      create: mockCustomerCreate,
      update: mockCustomerUpdate,
    },
    $transaction: mock((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        reservation: { findFirst: mockFindFirst, create: mockCreate },
        customer: {
          findUnique: mockCustomerFindUnique,
          create: mockCustomerCreate,
          update: mockCustomerUpdate,
        },
      }),
    ),
  },
}));

mock.module("@/shared/lib/reservation", () => ({
  checkReservationOverlap: mock(() => Promise.resolve({ hasOverlap: false })),
}));

const { createPublicReservationCommand } =
  await import("@/shared/domain/reservations/commands");

describe("createPublicReservationCommand", () => {
  test("creates reservation with new customer", async () => {
    const result = await createPublicReservationCommand({
      spaceId: "space-1",
      date: "2026-04-01",
      startTime: "10:00",
      endTime: "13:00",
      numberOfGuests: 10,
      lastName: "山田",
      firstName: "太郎",
      email: "test@example.com",
      phoneNumber: "03-1234-5678",
    });

    expect(result.id).toBe("res-uuid-1234");
    expect(result.notification.customerName).toBe("山田 太郎");
    expect(result.notification.spaceName).toBe("会議室A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/shared/domain/reservations/public-commands.test.ts`
Expected: FAIL — `createPublicReservationCommand` is not a function

- [ ] **Step 3: Add createPublicReservationCommand**

Add to end of `src/shared/domain/reservations/commands.ts`:

```typescript
type PublicReservationInput = {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  notes?: string | null | undefined;
};

export async function createPublicReservationCommand(
  input: PublicReservationInput,
) {
  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  // Validate space exists
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId, isActive: true, isPublished: true },
    select: { id: true, name: true, address: true, hourlyPrice: true },
  });

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  // Check overlap (optimistic)
  const overlapCheck = await checkReservationOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
  });

  if (overlapCheck.hasOverlap) {
    throw new DomainError(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      "CONFLICT",
    );
  }

  // Calculate price
  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const basePrice = Math.floor(Number(space.hourlyPrice) * hours);

  // Transaction: pessimistic overlap check + customer upsert + reservation create
  const reservation = await prisma.$transaction(async (tx) => {
    // Pessimistic overlap check
    const overlapCheckTx = await checkReservationOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );
    if (overlapCheckTx.hasOverlap) {
      throw new DomainError(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
        "CONFLICT",
      );
    }

    // Find or create customer
    let customer = await tx.customer.findUnique({
      where: { email: input.email },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          lastName: input.lastName,
          firstName: input.firstName,
          email: input.email,
          phoneNumber: input.phoneNumber || null,
        },
      });
    } else {
      // Update name/phone if changed
      customer = await tx.customer.update({
        where: { email: input.email },
        data: {
          lastName: input.lastName,
          firstName: input.firstName,
          phoneNumber: input.phoneNumber || customer.phoneNumber,
        },
      });
    }

    // Create reservation as PENDING
    const created = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId: customer.id,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: basePrice,
        basePrice,
        status: ReservationStatus.PENDING,
        notes: input.notes || null,
      },
      include: {
        customer: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    // Update customer stats
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalReservations: { increment: 1 },
        lastReservationAt: new Date(),
        ...(!customer.firstReservationAt && {
          firstReservationAt: new Date(),
        }),
      },
    });

    return created;
  });

  const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;

  return {
    id: reservation.id,
    notification: {
      reservationId: reservation.id,
      customerEmail: reservation.customer.email,
      customerName,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: basePrice,
      notes: input.notes ?? undefined,
      location: space.address ?? undefined,
    } satisfies ReservationNotificationPayload,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/shared/domain/reservations/public-commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/reservations/commands.ts __tests__/shared/domain/reservations/public-commands.test.ts
git commit -m "feat(reservation): add createPublicReservationCommand

- Customer auto-creation (find by email or create NEW)
- Pessimistic overlap check in transaction
- Price: hourlyPrice * hours (no coupons/discounts)
- Status: PENDING (admin confirms manually)"
```

---

## Task 8: Public Reservation Server Action

**Files:**

- Create: `src/app/(public)/_shared/actions/reservation.ts`

- [ ] **Step 1: Write the Server Action**

```typescript
// src/app/(public)/_shared/actions/reservation.ts
"use server";

import { updateTag } from "next/cache";
import {
  publicReservationSchema,
  type PublicReservationInput,
} from "@/shared/lib/validations/public-reservation";
import {
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createPublicReservationCommand } from "@/shared/domain/reservations/commands";
import { sendReservationAdminNotification } from "@/shared/lib/email-service";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import { DomainError } from "@/shared/domain/domain-error";

export async function submitReservation(
  input: PublicReservationInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Validate
  const parsed = publicReservationSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 2. Turnstile
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3. Create reservation
  try {
    const result = await createPublicReservationCommand({
      spaceId: parsed.data.spaceId,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      numberOfGuests: parsed.data.numberOfGuests,
      lastName: parsed.data.lastName,
      firstName: parsed.data.firstName,
      email: parsed.data.email,
      phoneNumber: parsed.data.phoneNumber,
      notes: parsed.data.notes,
    });

    // 4. Invalidate admin cache
    updateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
    updateTag(getCacheTag.reservations.list(), CACHE_LIFE.DYNAMIC_DATA);
    updateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);
    updateTag(CACHE_TAGS.CUSTOMERS, CACHE_LIFE.DYNAMIC_DATA);

    // 5. Send admin notification (fire-and-forget)
    // Note: Customer confirmation is sent when admin changes status to CONFIRMED
    fireAndForget(
      sendReservationAdminNotification(result.notification, "new"),
      {
        operation: "sendReservationAdminNotification",
        category: ErrorCategory.EXTERNAL_API,
      },
    );

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "CONFLICT") {
        return createMutationError(error.message);
      }
      return createMutationError(error.message);
    }
    throw error;
  }
}
```

- [ ] **Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(public)/_shared/actions/reservation.ts'
git commit -m "feat(reservation): add public submitReservation Server Action"
```

---

## Task 9: Rewrite Reservation Form (Multi-Step)

**Files:**

- Create: `src/app/(public)/reservation/_components/reservation-form.tsx`
- Create: `src/app/(public)/reservation/_components/date-time-step.tsx`
- Create: `src/app/(public)/reservation/_components/customer-step.tsx`
- Create: `src/app/(public)/reservation/_components/confirmation-step.tsx`
- Delete: `src/app/(public)/reservation/_components/ReservationForm.tsx`
- Modify: `src/app/(public)/reservation/page.tsx`

This is a large task — implement each sub-component sequentially.

- [ ] **Step 1: Update reservation page.tsx to fetch spaces**

```typescript
// src/app/(public)/reservation/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultReservationContent } from "@/public/lib/content/defaults/reservation";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Container } from "@/public/components/design-system/container";
import { getPublishedSpaces } from "@/shared/domain/spaces/public-queries";
import { toPlainObject } from "@/shared/lib/serialize";
import { ReservationForm } from "./_components/reservation-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("reservation");
}

export default async function ReservationPage(): Promise<ReactElement> {
  await connection();

  const [content, rawSpaces] = await Promise.all([
    getPageContent("reservation", simplePageContentSchema, defaultReservationContent),
    getPublishedSpaces(),
  ]);

  // Convert Prisma Decimal to number, serialize for Client Component
  const spaces = rawSpaces.map((s) =>
    toPlainObject({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      hourlyPrice: Number(s.hourlyPrice),
      mainImageUrl: s.mainImageUrl,
    }),
  );

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />
      <section className="py-[var(--spacing-section)]">
        <Container variant="narrow">
          <ReservationForm spaces={spaces} />
        </Container>
      </section>
      <SiteCTA heading="お問い合わせ" body="ご不明点はお気軽にご相談ください" />
    </>
  );
}
```

- [ ] **Step 2: Create date-time-step.tsx**

Component for Step 1: Select space, date, time, guests.
Uses `Input`, `Select` from design system. Receives `spaces` prop for the space dropdown.
Receives react-hook-form's `form` object via props for controlled inputs.

- [ ] **Step 3: Create customer-step.tsx**

Component for Step 2: lastName, firstName, email, phone, notes.
Uses `Input`, `Textarea` from design system. Receives `form` from parent.

- [ ] **Step 4: Create confirmation-step.tsx**

Component for Step 3: Read-only summary of all fields. Shows calculated price (hourlyPrice \* hours).
Submit button triggers the form submission. Shows terms agreement checkbox.

- [ ] **Step 5: Create reservation-form.tsx (orchestrator)**

```typescript
// src/app/(public)/reservation/_components/reservation-form.tsx
"use client";

import { useState, useRef, type ReactElement } from "react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { StepIndicator } from "@/public/components/ui/step-indicator";
import { DURATION, EASE } from "@/public/lib/animations";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import { submitReservation } from "@/public/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DateTimeStep } from "./date-time-step";
import { CustomerStep } from "./customer-step";
import { ConfirmationStep } from "./confirmation-step";

type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string | null;
};

export function ReservationForm({
  spaces,
}: {
  readonly spaces: readonly SpaceOption[];
}): ReactElement {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const motionOk = useMotionPreference();

  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data) => {
      setErrorMessage(null);
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setSubmitted(true);
      }
      return result;
    },
  );

  const animateTransition = () => {
    const content = contentRef.current;
    if (!content) return;
    const stepContent = content.querySelector("[data-step]");
    if (!stepContent) return;
    const reduced = !motionOk.current;
    gsap.fromTo(
      stepContent,
      { opacity: 0, y: reduced ? 0 : 20 },
      {
        opacity: 1,
        y: 0,
        duration: reduced ? DURATION.fast : DURATION.normal,
        ease: EASE.outQuart,
      },
    );
  };

  const goNext = async () => {
    // Validate current step fields before proceeding
    let fieldsToValidate: string[] = [];
    if (step === 1) {
      fieldsToValidate = ["spaceId", "date", "startTime", "endTime", "numberOfGuests"];
    } else if (step === 2) {
      fieldsToValidate = ["lastName", "firstName", "email", "phoneNumber", "notes"];
    }

    const isValid = await form.trigger(fieldsToValidate as any);
    if (!isValid) return;

    setStep((prev) => Math.min(3, prev + 1));
    animateTransition();
  };

  const goBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    animateTransition();
  };

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface p-8 text-center">
          <h2 className="font-heading text-xl tracking-tight">
            ご予約を受け付けました
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            予約内容を確認の上、担当者よりご連絡いたします。
            <br />
            確定後に確認メールをお送りします。
          </p>
        </div>
      </ScrollReveal>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-10 md:mb-12">
        <StepIndicator currentStep={step} />
      </div>

      <div ref={contentRef}>
        <div data-step="">
          {step === 1 && (
            <DateTimeStep form={form} spaces={spaces} onNext={goNext} />
          )}
          {step === 2 && (
            <CustomerStep form={form} onNext={goNext} onBack={goBack} />
          )}
          {step === 3 && (
            <ConfirmationStep
              form={form}
              spaces={spaces}
              isPending={isPending}
              errorMessage={errorMessage}
              onBack={goBack}
            />
          )}
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Delete old ReservationForm.tsx**

```bash
git rm 'src/app/(public)/reservation/_components/ReservationForm.tsx'
```

- [ ] **Step 7: Run type check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add 'src/app/(public)/reservation/_components/reservation-form.tsx' \
  'src/app/(public)/reservation/_components/date-time-step.tsx' \
  'src/app/(public)/reservation/_components/customer-step.tsx' \
  'src/app/(public)/reservation/_components/confirmation-step.tsx' \
  'src/app/(public)/reservation/page.tsx'
git commit -m "feat(reservation): rewrite reservation form with real submission

- 3-step form: Space+DateTime → CustomerInfo → Confirmation
- Real space data from Server Component
- Price calculated from hourlyPrice * hours
- Customer auto-created on submission
- Admin notified via email, status starts as PENDING
- GSAP step transitions preserved"
```

---

## Task 10: Design System Component Updates (if needed)

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/input.tsx`
- Modify: `src/app/(public)/_shared/components/design-system/textarea.tsx`
- Modify: `src/app/(public)/_shared/components/design-system/select.tsx`

Check if these components accept `ref`, `name`, `onChange`, `onBlur` props needed by react-hook-form's `register()`. If not, update to forward these props.

- [ ] **Step 1: Read current components**

Read all three files. Check if they accept `...rest` props and `ref` (React 19 pattern).

- [ ] **Step 2: Update if needed**

If components use fixed `id` + `onChange` without accepting external props:

- Add `ref` prop (React 19 pattern, NOT forwardRef)
- Add `...rest` spread to the underlying HTML element
- Ensure `name`, `onChange`, `onBlur` from register() flow through

- [ ] **Step 3: Run type check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit (if changes made)**

```bash
git add 'src/app/(public)/_shared/components/design-system/input.tsx' \
  'src/app/(public)/_shared/components/design-system/textarea.tsx' \
  'src/app/(public)/_shared/components/design-system/select.tsx'
git commit -m "fix(design-system): update Input/Textarea/Select to accept react-hook-form register props"
```

---

## Task 11: PAGE_CONTENT Cache Invalidation

**Files:**

- Modify: Admin action files that update PageContent (find via grep)

- [ ] **Step 1: Find where PageContent is updated in admin**

Search for `pageContent` or `PAGE_CONTENT` update operations in admin actions. If no admin UI exists yet for PageContent editing, add the invalidation to the domain layer so it's automatically triggered when such a UI is built.

- [ ] **Step 2: Add updateTag calls**

If admin actions exist:

```typescript
updateTag(CACHE_TAGS.PAGE_CONTENT, CACHE_LIFE.PUBLIC_CONTENT);
updateTag(getCacheTag.pageContent.detail(pageKey), CACHE_LIFE.PUBLIC_CONTENT);
```

If no admin actions exist yet, create a minimal `updatePageContentCommand` in the domain layer that includes cache invalidation.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(cache): add PAGE_CONTENT cache invalidation for admin updates"
```

---

## Task 12: Full Validation

- [ ] **Step 1: Run all tests**

```bash
bun run test:all
```

- [ ] **Step 2: Run validate**

```bash
bun run validate
```

- [ ] **Step 3: Run build**

```bash
bun run build
```

- [ ] **Step 4: Fix any issues**

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore: fix validation issues from public forms integration"
```

---

## Dependency Order

```
Task 1 (inquiry schema) → Task 2 (inquiry command) → Task 4 (inquiry action)
Task 3 (usePublicForm) → Task 5 (contact form) — also depends on Tasks 1, 4
Task 10 (design system) — can run in parallel, but must complete before Tasks 5, 9
Task 6 (reservation schema) → Task 7 (reservation command) → Task 8 (reservation action)
Task 3 (usePublicForm) → Task 9 (reservation form) — also depends on Tasks 6, 7, 8
Task 11 (PAGE_CONTENT cache) — independent
Task 12 (validation) — depends on all
```

**Parallel groups:**

- Group A: Tasks 1, 2, 3, 4, 10 → Task 5 (contact form)
- Group B: Tasks 6, 7, 8, 10 → Task 9 (reservation form)
- Group C: Task 11 (independent)
- Final: Task 12 (validation)
