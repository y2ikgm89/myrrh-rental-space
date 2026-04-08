# Mypage Best Practices Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マイページの全 write mutation に Turnstile 検証を追加し、ファイル命名・UI パターンをプロジェクト規約に統一する。

**Architecture:** 各 Zod スキーマに `turnstileToken` フィールドを追加 → Server Action に `validateTurnstile` を挿入 → Client Component に `TurnstileWidget` を配置 → Server Component ページから `getTurnstileSiteKey()` を注入。既存の公開フォーム（reservation/inquiry/review）の実装パターンを忠実に踏襲する。

**Tech Stack:** Next.js 16 Server Actions, Zod 4, Cloudflare Turnstile, React 19

**Spec:** `docs/superpowers/specs/2026-04-08-mypage-best-practices-cleanup.md`

---

### Task 1: Zod スキーマに turnstileToken フィールド追加

**Files:**

- Modify: `src/shared/lib/validations/customer-reservation.ts`
- Modify: `src/shared/lib/validations/customer-profile.ts`

- [ ] **Step 1: customer-profile.ts に turnstileToken 追加**

```typescript
// src/shared/lib/validations/customer-profile.ts
import { z } from "zod";

export const customerProfileSchema = z.object({
  lastName: z.string().min(1, { error: "姓を入力してください" }),
  firstName: z.string().min(1, { error: "名を入力してください" }),
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  turnstileToken: z.string().optional(),
});

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
```

- [ ] **Step 2: customer-reservation.ts に turnstileToken 追加**

`customerReservationEditSchema` の `.object({})` に `turnstileToken: z.string().optional()` を追加。refine の前に配置。

```typescript
// src/shared/lib/validations/customer-reservation.ts
import { z } from "zod";

export const customerReservationEditSchema = z
  .object({
    reservationId: z.string().uuid({ error: "予約IDが不正です" }),
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      error: "日付の形式が正しくありません（YYYY-MM-DD）",
    }),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    numberOfGuests: z.number().int().min(1, { error: "利用人数は1名以上です" }),
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

export type CustomerReservationEditInput = z.input<
  typeof customerReservationEditSchema
>;
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS（optional フィールドのため既存コードは壊れない）

- [ ] **Step 4: コミット**

```bash
git add src/shared/lib/validations/customer-reservation.ts src/shared/lib/validations/customer-profile.ts
git commit -m "feat(mypage): add turnstileToken to customer validation schemas"
```

---

### Task 2: Server Actions に Turnstile 検証追加

**Files:**

- Modify: `src/app/(public)/mypage/_shared/actions/reservation.ts`
- Modify: `src/app/(public)/mypage/_shared/actions/profile.ts`
- Modify: `src/app/(public)/mypage/_shared/actions/account.ts`

- [ ] **Step 1: reservation.ts — cancelReservationAction に Turnstile 追加**

シグネチャに `turnstileToken` パラメータを追加し、レート制限の直後に `validateTurnstile` を配置:

```typescript
// src/app/(public)/mypage/_shared/actions/reservation.ts
// 先頭の import に追加:
import { validateTurnstile } from "@/shared/lib/action-helpers";

// cancelReservationAction のシグネチャ変更:
export async function cancelReservationAction(
  reservationId: string,
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  // Turnstile 検証（レート制限の直後）
  const turnstile = await validateTurnstile(turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  // ... 以降は既存コードと同一
```

- [ ] **Step 2: reservation.ts — updateReservationAction に Turnstile 追加**

`validateTurnstile` 呼び出しをレート制限の直後に挿入:

```typescript
export async function updateReservationAction(
  input: CustomerReservationEditInput,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  const parsed = customerReservationEditSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  // Turnstile 検証（バリデーション後）
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  // ... 以降は既存コードと同一
```

- [ ] **Step 3: profile.ts — updateProfileAction に Turnstile 追加**

```typescript
// src/app/(public)/mypage/_shared/actions/profile.ts
// import に追加:
import { validateTurnstile } from "@/shared/lib/action-helpers";

export async function updateProfileAction(
  input: CustomerProfileInput,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const parsed = customerProfileSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  // Turnstile 検証
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  // ... 以降は既存コードと同一
```

- [ ] **Step 4: account.ts — deleteAccountAction に Turnstile 追加**

```typescript
// src/app/(public)/mypage/_shared/actions/account.ts
// import に追加:
import { validateTurnstile } from "@/shared/lib/action-helpers";

export async function deleteAccountAction(
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  // Turnstile 検証
  const turnstile = await validateTurnstile(turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  // ... 以降は既存コードと同一
```

- [ ] **Step 5: type-check 実行**

Run: `bun run type-check`
Expected: Client Component 側で引数不一致エラーが出る（次タスクで修正）

- [ ] **Step 6: コミット**

```bash
git add 'src/app/(public)/mypage/_shared/actions/reservation.ts' 'src/app/(public)/mypage/_shared/actions/profile.ts' 'src/app/(public)/mypage/_shared/actions/account.ts'
git commit -m "feat(mypage): add Turnstile validation to all write mutations"
```

---

### Task 3: CancelButton に TurnstileWidget 追加

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/page.tsx`

- [ ] **Step 1: cancel-button.tsx に TurnstileWidget を追加**

Props に `turnstileSiteKey` を追加し、Dialog 内に TurnstileWidget を配置。`handleConfirm` で token を渡す:

```typescript
// cancel-button.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/public/components/design-system/dialog";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cancelReservationAction } from "../../../_shared/actions/reservation";

interface CancelButtonProps {
  readonly reservationId: string;
  readonly turnstileSiteKey: string | null;
}

export function CancelButton({
  reservationId,
  turnstileSiteKey,
}: CancelButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelReservationAction(
        reservationId,
        reason || null,
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
        return;
      }
      setOpen(false);
      router.push("/mypage");
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setReason("");
          setTurnstileToken("");
          setOpen(true);
        }}
      >
        予約をキャンセルする
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約のキャンセル確認</DialogTitle>
            <DialogDescription>
              この予約をキャンセルしてもよろしいですか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>

          <Textarea
            label="キャンセル理由（任意）"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="キャンセルの理由をお聞かせください"
            maxLength={500}
            disabled={isPending}
          />

          <TurnstileWidget
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken("")}
          />

          {error != null && (
            <div
              className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          <DialogFooter className="mt-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              閉じる
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "キャンセル中..." : "キャンセルを確定する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: reservations/[id]/page.tsx で turnstileSiteKey を CancelButton に渡す**

既に `turnstileSiteKey` を取得している（review 用）。CancelButton にも渡す:

`page.tsx` 内の `<CancelButton reservationId={reservation.id} />` を以下に変更:

```tsx
{
  canCancel && (
    <CancelButton
      reservationId={reservation.id}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}
```

ただし `turnstileSiteKey` は `isCompleted` 条件内でしか取得されていない。条件を修正して常に取得:

```typescript
// 変更前:
const [existingReview, turnstileSiteKey] = await Promise.all([
  isCompleted
    ? getReviewForReservation(reservation.id, customer.id)
    : Promise.resolve(null),
  isCompleted ? getTurnstileSiteKey() : Promise.resolve(null),
]);

// 変更後: turnstileSiteKey は常に取得（cancel でも使う）
const [existingReview, turnstileSiteKey] = await Promise.all([
  isCompleted
    ? getReviewForReservation(reservation.id, customer.id)
    : Promise.resolve(null),
  getTurnstileSiteKey(),
]);
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx' 'src/app/(public)/mypage/reservations/[id]/page.tsx'
git commit -m "feat(mypage): add Turnstile to reservation cancel dialog"
```

---

### Task 4: EditReservationForm に TurnstileWidget 追加

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`

- [ ] **Step 1: edit-reservation-form.tsx に TurnstileWidget 追加**

Props に `turnstileSiteKey` を追加。`useRef<TurnstileInstance>` で参照を保持。`onVerify` で `form.setValue("turnstileToken", token)` をセット。送信エラー時に `turnstileRef.current?.reset()`:

```typescript
// edit-reservation-form.tsx — import 追加
import { useRef, useState } from "react";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";

// Props に turnstileSiteKey 追加
interface EditReservationFormProps {
  readonly reservationId: string;
  readonly numberOfGuests: number;
  readonly spaces: readonly SpaceOption[];
  readonly initialValues: InitialValues;
  readonly turnstileSiteKey: string | null;
}

export function EditReservationForm({
  reservationId,
  numberOfGuests,
  spaces,
  initialValues,
  turnstileSiteKey,
}: EditReservationFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // ... spaceOptions は同一 ...

  const { form, isPending, onSubmit } =
    usePublicForm<CustomerReservationEditInput>(
      customerReservationEditSchema,
      async (data) => {
        setErrorMessage(null);
        const result = await updateReservationAction(data);
        if (isMutationError(result)) {
          setErrorMessage(result.error);
          turnstileRef.current?.reset();
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

  function handleTurnstileVerify(token: string) {
    form.setValue("turnstileToken", token);
  }

  function handleTurnstileExpire() {
    form.setValue("turnstileToken", "");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ... 既存フィールド ... */}

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      {/* ... 既存ボタン ... */}
    </form>
  );
}
```

- [ ] **Step 2: edit/page.tsx で turnstileSiteKey を取得して渡す**

```typescript
// edit/page.tsx に import 追加:
import { getTurnstileSiteKey } from "@/public/data/turnstile";

// spaces 取得と並列で getTurnstileSiteKey を取得
// 変更前:
const spaces = await getActiveSpacesByLocationId(reservation.space.locationId);

// 変更後:
const [spaces, turnstileSiteKey] = await Promise.all([
  getActiveSpacesByLocationId(reservation.space.locationId),
  getTurnstileSiteKey(),
]);

// EditReservationForm に prop 追加:
<EditReservationForm
  reservationId={reservation.id}
  numberOfGuests={1}
  spaces={spaces}
  initialValues={{
    spaceId: reservation.spaceId,
    date: dateStr,
    startTime: startTimeStr,
    endTime: endTimeStr,
  }}
  turnstileSiteKey={turnstileSiteKey}
/>
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx' 'src/app/(public)/mypage/reservations/[id]/edit/page.tsx'
git commit -m "feat(mypage): add Turnstile to reservation edit form"
```

---

### Task 5: ProfileForm に TurnstileWidget 追加

**Files:**

- Modify: `src/app/(public)/mypage/settings/_components/profile-form.tsx`
- Modify: `src/app/(public)/mypage/settings/page.tsx`

- [ ] **Step 1: profile-form.tsx に TurnstileWidget 追加**

Props に `turnstileSiteKey` を追加。`useRef<TurnstileInstance>` を追加。`onVerify` → `form.setValue("turnstileToken", token)`。送信成功/エラー時に `turnstileRef.current?.reset()`:

```typescript
// profile-form.tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/shared/lib/validations/customer-profile";
import { updateProfileAction } from "../../_shared/actions/profile";

interface ProfileFormProps {
  readonly defaultValues: {
    readonly lastName: string;
    readonly firstName: string;
    readonly email: string;
    readonly phoneNumber: string;
  };
  readonly turnstileSiteKey: string | null;
}

export function ProfileForm({ defaultValues, turnstileSiteKey }: ProfileFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const { form, isPending, onSubmit } = usePublicForm<CustomerProfileInput>(
    customerProfileSchema,
    async (data) => {
      setErrorMessage(null);
      setShowSuccess(false);
      const result = await updateProfileAction(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        turnstileRef.current?.reset();
      } else {
        setShowSuccess(true);
        turnstileRef.current?.reset();
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

  function handleTurnstileVerify(token: string) {
    form.setValue("turnstileToken", token);
  }

  function handleTurnstileExpire() {
    form.setValue("turnstileToken", "");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-6">
      {/* ... 既存のエラー/成功表示 ... */}
      {/* ... 既存のフィールド ... */}

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: settings/page.tsx で turnstileSiteKey を取得して渡す**

```typescript
// settings/page.tsx に import 追加:
import { getTurnstileSiteKey } from "@/public/data/turnstile";

// accountResult 取得と並列で getTurnstileSiteKey を取得:
const [accountResult, turnstileSiteKey] = await Promise.all([
  getAccountLinksAction(),
  getTurnstileSiteKey(),
]);

// ProfileForm に prop 追加:
<ProfileForm
  defaultValues={{
    lastName: customer.lastName,
    firstName: customer.firstName,
    email: customer.email,
    phoneNumber: customer.phoneNumber ?? "",
  }}
  turnstileSiteKey={turnstileSiteKey}
/>
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/mypage/settings/_components/profile-form.tsx' 'src/app/(public)/mypage/settings/page.tsx'
git commit -m "feat(mypage): add Turnstile to profile update form"
```

---

### Task 6: AccountLinking（削除 Dialog）に TurnstileWidget 追加

**Files:**

- Modify: `src/app/(public)/mypage/settings/_components/account-linking.tsx`
- Modify: `src/app/(public)/mypage/settings/page.tsx`

- [ ] **Step 1: account-linking.tsx に TurnstileWidget 追加**

Props に `turnstileSiteKey` を追加。削除 Dialog 内に `TurnstileWidget` を配置。`handleDeleteAccount` で token を渡す:

```typescript
// account-linking.tsx
// import 追加:
import { useRef } from "react";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";

interface AccountLinkingProps {
  readonly providers: readonly string[];
  readonly turnstileSiteKey: string | null;
}

export function AccountLinking({ providers, turnstileSiteKey }: AccountLinkingProps) {
  // 既存の state...
  const [deleteTurnstileToken, setDeleteTurnstileToken] = useState("");
  const deleteTurnstileRef = useRef<TurnstileInstance>(null);

  // handleDeleteAccount を修正:
  const handleDeleteAccount = () => {
    setIsDeleting(true);
    setError(null);

    startTransition(async () => {
      try {
        const result = await deleteAccountAction(deleteTurnstileToken || undefined);
        if (isMutationError(result)) {
          setError(result.error);
          setIsDeleting(false);
          deleteTurnstileRef.current?.reset();
          return;
        }
        await signOut();
        window.location.href = "/login";
      } catch (error) {
        console.error("Failed to delete account", getErrorMessage(error));
        setError("アカウントの削除に失敗しました");
        setIsDeleting(false);
        deleteTurnstileRef.current?.reset();
      }
    });
  };

  // Dialog 内（DialogDescription の後、DialogFooter の前）に追加:
  // <TurnstileWidget
  //   ref={deleteTurnstileRef}
  //   siteKey={turnstileSiteKey}
  //   onVerify={setDeleteTurnstileToken}
  //   onExpire={() => setDeleteTurnstileToken("")}
  // />

  // deleteDialogOpen の onOpenChange で token リセット:
  // onOpenChange={(open) => {
  //   setDeleteDialogOpen(open);
  //   if (!open) setDeleteTurnstileToken("");
  // }}
```

- [ ] **Step 2: settings/page.tsx で turnstileSiteKey を AccountLinking に渡す**

```tsx
<AccountLinking providers={providers} turnstileSiteKey={turnstileSiteKey} />
```

（turnstileSiteKey は Task 5 で既に取得済み）

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/mypage/settings/_components/account-linking.tsx' 'src/app/(public)/mypage/settings/page.tsx'
git commit -m "feat(mypage): add Turnstile to account deletion dialog"
```

---

### Task 7: EventRegistrationList — kebab-case リネーム + confirm/alert 廃止

**Files:**

- Rename: `src/app/(public)/mypage/events/_components/EventRegistrationList.tsx` → `event-registration-list.tsx`
- Modify: `src/app/(public)/mypage/events/page.tsx`

- [ ] **Step 1: ファイルリネーム**

```bash
git mv 'src/app/(public)/mypage/events/_components/EventRegistrationList.tsx' 'src/app/(public)/mypage/events/_components/event-registration-list.tsx'
```

- [ ] **Step 2: events/page.tsx の import パス更新**

```typescript
// 変更前:
import { EventRegistrationList } from "./_components/EventRegistrationList";

// 変更後:
import { EventRegistrationList } from "./_components/event-registration-list";
```

- [ ] **Step 3: EventRegistrationCard の confirm() → Dialog に変更**

`event-registration-list.tsx` 内の `EventRegistrationCard` を修正。`confirm()` / `alert()` を Radix Dialog + インラインエラー表示に置き換え:

```typescript
// event-registration-list.tsx — import にDialog系を追加
import { useRef, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/public/components/design-system/dialog";
import { Button } from "@/public/components/design-system/button";

// EventRegistrationCard を修正:
function EventRegistrationCard({
  registration,
}: {
  readonly registration: EventRegistration;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = registration.status === "CONFIRMED";

  const handleConfirmCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelEventRegistration(registration.id);
      if (isMutationError(result)) {
        setError(result.error);
      } else {
        setCancelDialogOpen(false);
        router.refresh();
      }
    });
  };

  // ... statusLabel, statusVariant は同一 ...

  return (
    <div className="border border-border p-4 sm:p-6">
      {/* ... 既存のヘッダー・詳細 ... */}

      {error != null && (
        <div
          className="mt-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {canCancel && (
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              setError(null);
              setCancelDialogOpen(true);
            }}
          >
            申込をキャンセル
          </Button>

          <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>申込キャンセルの確認</DialogTitle>
                <DialogDescription>
                  「{registration.event.title}」の申込をキャンセルしますか？
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelDialogOpen(false)}
                  disabled={isPending}
                >
                  閉じる
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmCancel}
                  disabled={isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isPending ? "キャンセル中..." : "キャンセルする"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: type-check + lint 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/mypage/events/_components/event-registration-list.tsx' 'src/app/(public)/mypage/events/page.tsx'
git commit -m "refactor(mypage): rename EventRegistrationList to kebab-case and replace confirm/alert with Dialog"
```

---

### Task 8: ReviewForm の space-y-4 → space-y-6 修正

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx`

- [ ] **Step 1: space-y-4 → space-y-6 に変更**

```typescript
// 変更前:
<form onSubmit={onSubmit} className="space-y-4">

// 変更後:
<form onSubmit={onSubmit} className="space-y-6">
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx'
git commit -m "fix(mypage): unify review form field spacing to space-y-6"
```

---

### Task 9: 最終検証

- [ ] **Step 1: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: build 実行**

Run: `bun run build`
Expected: PASS

- [ ] **Step 3: Turnstile 関連の残存チェック**

マイページ内の全 write mutation が Turnstile 対応済みか grep で確認:

```bash
# Turnstile 未対応の public write action がないか確認
grep -rL "validateTurnstile" 'src/app/(public)/mypage/_shared/actions/'
```

Expected: 出力なし（全ファイルに validateTurnstile が含まれている）

- [ ] **Step 4: PascalCase ファイル残存チェック**

```bash
# mypage 配下に PascalCase ファイルが残っていないか確認
find 'src/app/(public)/mypage' -name '[A-Z]*.tsx' -not -path '*/node_modules/*'
```

Expected: 出力なし
