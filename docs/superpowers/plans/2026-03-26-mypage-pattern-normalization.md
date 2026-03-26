# Mypage Pattern Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize mypage code patterns to match project-wide best practices: `MutationResult<T>`, `logError()`, `usePublicForm`, Date serialization, and dead code removal.

**Architecture:** Replace ad-hoc `{ success: true } | { error: string }` return types with `MutationResult<T>` across all 3 action files. Convert `useActionState` + FormData forms to `usePublicForm` + React Hook Form. Fix Date serialization in Client Components to use `string` types.

**Tech Stack:** React 19, React Hook Form, Zod 4, `MutationResult<T>`, `logError()`, `usePublicForm`

---

## File Structure

### Modified Files

| File                                                                                   | Responsibility                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/app/(public)/mypage/_shared/actions/reservation.ts`                               | Cancel + Update reservation actions -> MutationResult   |
| `src/app/(public)/mypage/_shared/actions/account.ts`                                   | Account links + delete actions -> MutationResult        |
| `src/app/(public)/mypage/_shared/actions/profile.ts`                                   | Profile update action -> MutationResult, extract schema |
| `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` | usePublicForm + numberOfGuests from reservation         |
| `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`                              | Pass numberOfGuests to form                             |
| `src/app/(public)/mypage/settings/_components/profile-form.tsx`                        | usePublicForm pattern                                   |
| `src/app/(public)/mypage/settings/_components/account-linking.tsx`                     | Remove dead `deleteUser` code                           |
| `src/app/(public)/mypage/_components/reservation-card.tsx`                             | Date type -> string                                     |
| `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`         | Date type -> string                                     |
| `src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx`              | Use isMutationError                                     |
| `src/app/(public)/mypage/reservations/[id]/page.tsx`                                   | Date serialization for detail page                      |
| `src/app/(public)/mypage/page.tsx`                                                     | Date serialization for list page                        |

### New Files

| File                                             | Responsibility                                                 |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `src/shared/lib/validations/customer-profile.ts` | Zod schema for profile form (extracted from profile.ts action) |

---

### Task 1: Server Actions -> MutationResult (reservation.ts)

**Files:**

- Modify: `src/app/(public)/mypage/_shared/actions/reservation.ts`

- [ ] **Step 1: Rewrite reservation.ts with MutationResult pattern**

Replace `{ success: true } | { error: string }` with `MutationResult<null>`. Add `logError` for the update action's try/catch. Convert `updateReservationAction` to accept typed input instead of FormData (will be called from `usePublicForm`).

```typescript
"use server";

import { getSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import {
  cancelCustomerReservation,
  updateCustomerReservation,
} from "@/shared/domain/reservations/customer-commands";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import {
  customerReservationEditSchema,
  type CustomerReservationEditInput,
} from "@/shared/lib/validations/customer-reservation";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

function invalidateReservationCache(): void {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.list());
  updateTag(getCacheTag.reservations.calendar());
}

export async function cancelReservationAction(
  reservationId: string,
): Promise<MutationResult<null>> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  const settings = await getReservationDeadlineSettings();
  const result = await cancelCustomerReservation(
    reservationId,
    customer.id,
    settings.cancellationDeadlineHours,
  );

  if (!result.success) return createMutationError(result.error);

  invalidateReservationCache();
  return null;
}

export async function updateReservationAction(
  input: CustomerReservationEditInput,
): Promise<MutationResult<null>> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  const parsed = customerReservationEditSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  const settings = await getReservationDeadlineSettings();
  const result = await updateCustomerReservation(
    parsed.data.reservationId,
    customer.id,
    parsed.data,
    settings.modificationDeadlineHours,
  );

  if (!result.success) return createMutationError(result.error);

  invalidateReservationCache();
  return null;
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: Errors in edit-reservation-form.tsx and cancel-button.tsx (they still expect old types). These will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add src/app/'(public)'/mypage/_shared/actions/reservation.ts
git commit -m "refactor(mypage): migrate reservation actions to MutationResult"
```

---

### Task 2: Server Actions -> MutationResult (account.ts)

**Files:**

- Modify: `src/app/(public)/mypage/_shared/actions/account.ts`

- [ ] **Step 1: Rewrite account.ts with MutationResult pattern**

```typescript
"use server";

import { headers } from "next/headers";
import { getSession, auth } from "@/shared/lib/auth";
import { getAccountProviders } from "@/shared/domain/users/queries";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

export async function getAccountLinksAction(): Promise<
  MutationResult<{ accounts: string[] }>
> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const providers = await getAccountProviders(session.user.id);
  return { accounts: providers };
}

export async function deleteAccountAction(): Promise<MutationResult<null>> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: {},
    });
    return null;
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "deleteAccount", userId: session.user.id },
    });
    return createMutationError("アカウントの削除に失敗しました");
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: Errors in account-linking.tsx (fixed in Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/app/'(public)'/mypage/_shared/actions/account.ts
git commit -m "refactor(mypage): migrate account actions to MutationResult + logError"
```

---

### Task 3: Extract profile schema + migrate profile.ts

**Files:**

- Create: `src/shared/lib/validations/customer-profile.ts`
- Modify: `src/app/(public)/mypage/_shared/actions/profile.ts`

- [ ] **Step 1: Create customer-profile.ts schema**

This schema will be used by both the Server Action (validation) and the `usePublicForm` hook (client-side).

```typescript
import { z } from "zod";

export const customerProfileSchema = z.object({
  lastName: z.string().min(1, { error: "姓を入力してください" }),
  firstName: z.string().min(1, { error: "名を入力してください" }),
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
});

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
```

- [ ] **Step 2: Rewrite profile.ts with MutationResult pattern**

```typescript
"use server";

import { getSession } from "@/shared/lib/auth";
import { updateCustomerProfileByUserId } from "@/shared/domain/customers/commands";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/shared/lib/validations/customer-profile";

export async function updateProfileAction(
  input: CustomerProfileInput,
): Promise<MutationResult<null>> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const parsed = customerProfileSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  await updateCustomerProfileByUserId(session.user.id, {
    lastName: parsed.data.lastName,
    firstName: parsed.data.firstName,
    phoneNumber: parsed.data.phoneNumber || null,
  });

  updateTag(CACHE_TAGS.CUSTOMERS);

  return null;
}
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Errors in profile-form.tsx (fixed in Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/validations/customer-profile.ts src/app/'(public)'/mypage/_shared/actions/profile.ts
git commit -m "refactor(mypage): extract profile schema + migrate to MutationResult"
```

---

### Task 4: Date serialization fix (reservation-card.tsx + reservation-detail.tsx)

**Files:**

- Modify: `src/app/(public)/mypage/_components/reservation-card.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`

These are Client Components receiving data from Server Components via props. Per `prisma-patterns.md`, `Date` fields crossing the SC->CC boundary become ISO 8601 strings at runtime. The types must reflect this.

- [ ] **Step 1: Fix reservation-card.tsx Date types**

Change `Date` to `string` in the `Reservation` interface. The `new Date(date)` calls in formatting functions already handle string input correctly, so the formatting logic stays.

```typescript
interface Reservation {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}
```

Update the formatting function signatures:

```typescript
function formatDateTime(date: string): string {
  const d = new Date(date);
  // ... rest unchanged
}

function formatTimeOnly(date: string): string {
  const d = new Date(date);
  // ... rest unchanged
}
```

- [ ] **Step 2: Fix reservation-detail.tsx Date types**

Change `Date` to `string` in the `ReservationDetailData` interface:

```typescript
interface ReservationDetailData {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly basePrice: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly couponId: string | null;
  readonly couponDiscountAmount: number | null;
  readonly durationDiscountAmount: number | null;
  readonly spaceDiscountAmount: number | null;
  readonly spaceId: string;
  readonly space: Space;
}
```

Update the formatting function signatures:

```typescript
function formatDate(date: string): string {
  const d = new Date(date);
  // ... rest unchanged
}

function formatTime(date: string): string {
  const d = new Date(date);
  // ... rest unchanged
}

function formatCreatedAt(date: string): string {
  const d = new Date(date);
  // ... rest unchanged
}
```

- [ ] **Step 3: Update page.tsx to serialize dates for list**

Read `src/app/(public)/mypage/page.tsx` and check if dates are serialized when passing to `ReservationList`. If `buildReservationListItems` passes `Date` objects, update the page to serialize with `.toISOString()`.

- [ ] **Step 4: Update reservations/[id]/page.tsx to serialize dates for detail**

Read `src/app/(public)/mypage/reservations/[id]/page.tsx` and ensure dates are serialized when passing to `ReservationDetail` and `CancelButton`.

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: PASS (or errors only from tasks not yet completed).

- [ ] **Step 6: Commit**

```bash
git add src/app/'(public)'/mypage/_components/reservation-card.tsx src/app/'(public)'/mypage/reservations/'[id]'/_components/reservation-detail.tsx src/app/'(public)'/mypage/page.tsx src/app/'(public)'/mypage/reservations/'[id]'/page.tsx
git commit -m "fix(mypage): correct Date serialization types for SC->CC boundary"
```

---

### Task 5: Profile form -> usePublicForm

**Files:**

- Modify: `src/app/(public)/mypage/settings/_components/profile-form.tsx`

- [ ] **Step 1: Rewrite profile-form.tsx with usePublicForm**

Replace `useActionState` + FormData with `usePublicForm` + React Hook Form. The action now accepts typed input instead of FormData.

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/shared/lib/validations/customer-profile";
import { updateProfileAction } from "../../_shared/actions/profile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  readonly defaultValues: {
    readonly lastName: string;
    readonly firstName: string;
    readonly email: string;
    readonly phoneNumber: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { form, isPending, onSubmit } = usePublicForm<CustomerProfileInput>(
    customerProfileSchema,
    async (data) => {
      setErrorMessage(null);
      setShowSuccess(false);
      const result = await updateProfileAction(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setShowSuccess(true);
      }
      return result;
    },
    {
      defaultValues: {
        lastName: defaultValues.lastName,
        firstName: defaultValues.firstName,
        phoneNumber: defaultValues.phoneNumber,
      },
    },
  );

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      {errorMessage != null && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {showSuccess && (
        <div
          className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm text-foreground"
          role="status"
        >
          プロフィールを更新しました
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="姓"
          required
          autoComplete="family-name"
          {...form.register("lastName")}
          {...(form.formState.errors.lastName?.message && {
            error: form.formState.errors.lastName.message,
          })}
        />
        <Input
          label="名"
          required
          autoComplete="given-name"
          {...form.register("firstName")}
          {...(form.formState.errors.firstName?.message && {
            error: form.formState.errors.firstName.message,
          })}
        />
      </div>

      <Input
        label="メールアドレス"
        type="email"
        value={defaultValues.email}
        disabled
        autoComplete="email"
      />
      <p className="text-xs text-muted-foreground -mt-2">
        メールアドレスはソーシャルアカウントから取得されます
      </p>

      <Input
        label="電話番号（任意）"
        type="tel"
        autoComplete="tel"
        {...form.register("phoneNumber")}
        {...(form.formState.errors.phoneNumber?.message && {
          error: form.formState.errors.phoneNumber.message,
        })}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/'(public)'/mypage/settings/_components/profile-form.tsx
git commit -m "refactor(mypage): migrate profile form to usePublicForm"
```

---

### Task 6: Edit reservation form -> usePublicForm + numberOfGuests fix

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`

- [ ] **Step 1: Update edit page.tsx to pass numberOfGuests**

In `edit/page.tsx`, add `numberOfGuests` to the props passed to `EditReservationForm`. Read from `reservation.numberOfGuests`:

Change the `EditReservationForm` call to include `numberOfGuests`:

```typescript
<EditReservationForm
  reservationId={reservation.id}
  numberOfGuests={reservation.numberOfGuests}
  spaces={spaces}
  initialValues={{
    spaceId: reservation.spaceId,
    date: dateStr,
    startTime: startTimeStr,
    endTime: endTimeStr,
  }}
/>
```

Check if `reservation` returned by `getCustomerReservationDetail` includes `numberOfGuests`. If not, add it to the query's select.

- [ ] **Step 2: Rewrite edit-reservation-form.tsx with usePublicForm**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Select } from "@/public/components/design-system/select";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  customerReservationEditSchema,
  type CustomerReservationEditInput,
} from "@/shared/lib/validations/customer-reservation";
import { updateReservationAction } from "../../../../_shared/actions/reservation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpaceOption {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly hourlyPrice: number;
}

interface InitialValues {
  readonly spaceId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

interface EditReservationFormProps {
  readonly reservationId: string;
  readonly numberOfGuests: number;
  readonly spaces: readonly SpaceOption[];
  readonly initialValues: InitialValues;
}

// ---------------------------------------------------------------------------
// Time options (09:00 - 22:00, 30 min intervals)
// ---------------------------------------------------------------------------

function generateTimeOptions(): readonly { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let hour = 9; hour <= 22; hour++) {
    for (const min of [0, 30]) {
      if (hour === 22 && min === 30) continue;
      const value = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      options.push({ value, label: value });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditReservationForm({
  reservationId,
  numberOfGuests,
  spaces,
  initialValues,
}: EditReservationFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const spaceOptions = spaces.map((s) => ({
    value: s.id,
    label: `${s.name}（定員${String(s.capacity)}名・¥${s.hourlyPrice.toLocaleString()}/h）`,
  }));

  const { form, isPending, onSubmit } =
    usePublicForm<CustomerReservationEditInput>(
      customerReservationEditSchema,
      async (data) => {
        setErrorMessage(null);
        const result = await updateReservationAction(data);
        if (isMutationError(result)) {
          setErrorMessage(result.error);
        } else {
          router.push(`/mypage/reservations/${reservationId}`);
        }
        return result;
      },
      {
        defaultValues: {
          reservationId,
          spaceId: initialValues.spaceId,
          date: initialValues.date,
          startTime: initialValues.startTime,
          endTime: initialValues.endTime,
          numberOfGuests,
        },
      },
    );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {errorMessage != null && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <Select
        label="スペース"
        options={spaceOptions}
        required
        {...form.register("spaceId")}
        {...(form.formState.errors.spaceId?.message && {
          error: form.formState.errors.spaceId.message,
        })}
      />

      <Input
        label="利用日"
        type="date"
        required
        {...form.register("date")}
        {...(form.formState.errors.date?.message && {
          error: form.formState.errors.date.message,
        })}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="開始時間"
          options={TIME_OPTIONS}
          required
          {...form.register("startTime")}
          {...(form.formState.errors.startTime?.message && {
            error: form.formState.errors.startTime.message,
          })}
        />

        <Select
          label="終了時間"
          options={TIME_OPTIONS}
          required
          {...form.register("endTime")}
          {...(form.formState.errors.endTime?.message && {
            error: form.formState.errors.endTime.message,
          })}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "変更中..." : "予約を変更する"}
        </Button>

        <Button
          variant="secondary"
          href={`/mypage/reservations/${reservationId}`}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/'(public)'/mypage/reservations/'[id]'/edit/_components/edit-reservation-form.tsx src/app/'(public)'/mypage/reservations/'[id]'/edit/page.tsx
git commit -m "refactor(mypage): migrate edit form to usePublicForm + fix numberOfGuests"
```

---

### Task 7: AccountLinking cleanup + cancel-button MutationResult

**Files:**

- Modify: `src/app/(public)/mypage/settings/_components/account-linking.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx`

- [ ] **Step 1: Clean up account-linking.tsx**

Remove the unused `deleteUser` import and the dead `void deleteUser` line. Update `deleteAccountAction` result check to use `isMutationError`:

```typescript
// Remove from imports:
// deleteUser  (unused)

// In imports, add:
import { isMutationError } from "@/shared/lib/mutation-result";

// Replace line 87:
//   if ("error" in result) {
// With:
//   if (isMutationError(result)) {

// Remove line 95:
//   void deleteUser;
```

- [ ] **Step 2: Update cancel-button.tsx to use isMutationError**

Read the cancel-button.tsx file and update the result check from `"error" in result` or `!result.success` to `isMutationError(result)`. The action now returns `MutationResult<null>` (null on success, `MutationError` on failure).

```typescript
// Add import:
import { isMutationError } from "@/shared/lib/mutation-result";

// Update the result handling:
const result = await cancelReservationAction(reservationId);
if (isMutationError(result)) {
  setError(result.error);
} else {
  router.push("/mypage");
}
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/'(public)'/mypage/settings/_components/account-linking.tsx src/app/'(public)'/mypage/reservations/'[id]'/_components/cancel-button.tsx
git commit -m "refactor(mypage): cleanup account-linking dead code + use isMutationError"
```

---

### Task 8: Final validation

- [ ] **Step 1: Run full validation**

Run: `bun run validate`
Expected: PASS (type-check + lint both clean).

- [ ] **Step 2: Run build**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: PASS (no mypage-specific tests expected to break, but verify).

- [ ] **Step 4: Final commit if any fixes needed**

If validation revealed issues, fix and commit with appropriate message.
