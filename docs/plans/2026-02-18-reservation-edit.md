# 予約全項目編集機能 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面の予約詳細ページに全項目編集機能を追加する（スペース・日時・顧客・クーポン・料金・ステータス・メモ）

**Architecture:** `/admin/reservations/[id]/edit` ページを新設し、既存の `ReservationForm` と同等の編集フォームを提供する。`updateAdminReservation` Server Action が重複チェック・クーポン使用回数調整・料金再計算・Googleカレンダー更新を担う。

**Tech Stack:** Next.js 16 Server Actions / React Hook Form + Zod / Prisma / `withPermission` HOF

---

## Task 1: `decrementCouponUsage` を coupon.ts に追加

**Files:**

- Modify: `src/shared/actions/coupon.ts`

クーポン変更時に旧クーポンの使用回数を戻す関数が存在しないため追加する。

**Step 1: `incrementCouponUsage` の直後に追加**

`src/shared/actions/coupon.ts` の末尾（`incrementCouponUsage` 関数の直後）に追加:

```typescript
/**
 * クーポン使用回数をデクリメント
 *
 * 予約編集でクーポンを変更・削除した際に呼び出される。
 * 0以下にはならないよう MAX(0, count - 1) で更新する。
 *
 * @param couponId - クーポンID
 */
export async function decrementCouponUsage(couponId: string): Promise<void> {
  await prisma.coupon.updateMany({
    where: { id: couponId, usageCount: { gt: 0 } },
    data: { usageCount: { decrement: 1 } },
  });
}
```

> `update` ではなく `updateMany` + `gt: 0` で 0 未満への更新を防ぐ（`update` は where の `gt` 制約でマッチしない場合エラーになる）。

**Step 2: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/shared/actions/coupon.ts
git commit -m "feat(coupon): add decrementCouponUsage function"
```

---

## Task 2: `updateReservationSchema` を admin-reservation.ts に追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/admin-reservation.ts`

**Step 1: ファイル末尾に追加**

既存の `adminReservationSchema` の下に追記:

```typescript
// =============================================================================
// 予約編集スキーマ（既存予約の更新用）
// =============================================================================

/**
 * 管理者用予約更新バリデーションスキーマ
 *
 * 作成スキーマとの違い:
 * - customerId 必須（既存顧客のみ、新規作成なし）
 * - customerData 削除
 * - sendNotificationEmail 追加（デフォルト false）
 * - sendEmail 削除（作成時専用）
 */
export const updateReservationSchema = z
  .object({
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    customerId: z.string().uuid({ error: "顧客を選択してください" }),
    totalPrice: z
      .number()
      .nonnegative({ error: "料金は0以上で入力してください" })
      .optional(),
    couponCode: z.string().max(20).optional().or(z.literal("")),
    status: z.enum(ReservationStatus).default("CONFIRMED"),
    notes: z
      .string()
      .max(1000, { error: "メモは1000文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    sendNotificationEmail: z.boolean().default(false),
  })
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`);
      const end = new Date(`${data.date}T${data.endTime}`);
      return end > start;
    },
    {
      error: "終了時間は開始時間より後に設定してください",
      path: ["endTime"],
    },
  )
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`);
      const end = new Date(`${data.date}T${data.endTime}`);
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return diffHours >= 1;
    },
    {
      error: "最低1時間以上の予約が必要です",
      path: ["endTime"],
    },
  );

export type UpdateReservationInput = z.input<typeof updateReservationSchema>;
export type UpdateReservationData = z.output<typeof updateReservationSchema>;
```

**Step 2: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/lib/validations/admin-reservation.ts
git commit -m "feat(validation): add updateReservationSchema for reservation editing"
```

---

## Task 3: `CustomerSelector` に `allowNewCustomer` prop を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/CustomerSelector.tsx`

編集フォームでは「新規顧客として入力」ボタンが不要なため、オプショナルな prop で制御する。

**Step 1: props インターフェースに追加**

```typescript
interface CustomerSelectorProps {
  selectedCustomer: { id: string; name: string; email: string } | null;
  onSelectCustomer: (
    customer: { id: string; name: string; email: string } | null,
  ) => void;
  onNewCustomerData: (
    data: {
      lastName: string;
      firstName: string;
      email: string;
      phoneNumber?: string;
    } | null,
  ) => void;
  isNewCustomer: boolean;
  onToggleNewCustomer: (isNew: boolean) => void;
  errors?: Record<string, string[] | undefined>;
  allowNewCustomer?: boolean; // ← 追加（デフォルト true）
}
```

**Step 2: コンポーネント本体で受け取り + 条件レンダリング**

`CustomerSelector` 関数の destructuring に `allowNewCustomer = true` を追加:

```typescript
export function CustomerSelector({
  selectedCustomer,
  onSelectCustomer,
  onNewCustomerData,
  isNewCustomer,
  onToggleNewCustomer,
  errors,
  allowNewCustomer = true,  // ← 追加
}: CustomerSelectorProps) {
```

モード切り替えボタン部分（`<Button type="button" variant="outline" size="sm" onClick={handleToggleNewCustomer}>...`）を条件レンダリングに変更:

```tsx
{
  /* モード切り替えボタン（allowNewCustomer=true の場合のみ表示） */
}
{
  allowNewCustomer && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleToggleNewCustomer}
    >
      {isNewCustomer ? (
        <>
          <Search className="mr-1 h-4 w-4" />
          既存顧客を検索
        </>
      ) : (
        <>
          <Plus className="mr-1 h-4 w-4" />
          新規顧客として入力
        </>
      )}
    </Button>
  );
}
```

また、`isNewCustomer` が `true` の状態（新規顧客フォーム）も `allowNewCustomer=true` の場合のみ表示されるよう変更:

```tsx
{
  /* 新規顧客入力モード（allowNewCustomer=true の場合のみ） */
}
{
  allowNewCustomer && isNewCustomer && (
    <div className="space-y-4">{/* ... 既存の新規顧客フォーム ... */}</div>
  );
}

{
  /* 既存顧客検索モード */
}
{
  (!allowNewCustomer || !isNewCustomer) && (
    <div className="space-y-3">{/* ... 既存の検索UI ... */}</div>
  );
}
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。既存の呼び出し元（`ReservationForm.tsx`）は `allowNewCustomer` を渡さないため デフォルト `true` で動作継続。

**Step 4: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/reservations/_components/CustomerSelector.tsx
git commit -m "feat(CustomerSelector): add allowNewCustomer prop for edit mode"
```

---

## Task 4: `updateAdminReservation` Server Action を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts`

**Step 1: import に `decrementCouponUsage` を追加**

ファイル先頭の import 行（`incrementCouponUsage` の部分）を修正:

```typescript
import {
  incrementCouponUsage,
  validateCouponCode,
  decrementCouponUsage,
} from "@/shared/actions/coupon";
```

また、`updateReservationSchema` と `UpdateReservationInput` の import を追加:

```typescript
import {
  adminReservationSchema,
  type AdminReservationInput,
  updateReservationSchema,
  type UpdateReservationInput,
} from "@/admin/lib/validations/admin-reservation";
```

`updateReservationSchema` の型エクスポートも必要:

```typescript
export type { UpdateReservationInput };
```

**Step 2: `updateAdminReservation` 関数を追加（ファイル末尾）**

`createAdminReservation` の直後に追加:

```typescript
// =============================================================================
// Admin Reservation Update
// =============================================================================

/**
 * 管理者用予約更新
 *
 * 全項目（スペース・日時・顧客・クーポン・料金・ステータス・メモ）を更新する。
 * 重複チェックは自分自身を除外して実施。
 * クーポン変更時は使用回数をアトミックに調整する。
 */
export const updateAdminReservation = withPermission<
  [id: string, input: UpdateReservationInput],
  void
>(
  "reservation",
  "update",
)(async (_user, id, input): Promise<ActionResult<void>> => {
  // バリデーション
  const validation = updateReservationSchema.safeParse(input);
  if (!validation.success) {
    return createFailure(
      "入力内容に誤りがあります",
      extractFieldErrors(validation.error),
    );
  }

  const {
    spaceId,
    date,
    startTime,
    endTime,
    customerId,
    totalPrice,
    couponCode,
    status,
    notes,
    sendNotificationEmail,
  } = validation.data;

  const startDateTime = new Date(`${date}T${startTime}:00`);
  const endDateTime = new Date(`${date}T${endTime}:00`);

  // 現在の予約・スペース・設定を並列取得
  const [currentReservation, space, settings] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        couponId: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.space.findUnique({
      where: { id: spaceId, isActive: true },
      select: { id: true, name: true, address: true, hourlyPrice: true },
    }),
    prisma.settings.findUnique({
      where: { id: "singleton" },
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    }),
  ]);

  if (!currentReservation) {
    return createFailure("予約が見つかりません");
  }
  if (!space) {
    return createFailure("指定されたスペースが見つかりません");
  }

  // 重複チェック（自分を除く）
  const overlapCheck = await checkReservationOverlap({
    spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    excludeReservationId: id,
  });
  if (overlapCheck.hasOverlap) {
    return createFailure(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
    );
  }

  // 料金計算
  const hours =
    (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
  const hourlyPrice = space.hourlyPrice;
  const basePrice = Math.floor(hourlyPrice * hours);

  // クーポン検証
  let validatedCoupon: Parameters<
    typeof calculateReservationPrice
  >[0]["coupon"] = null;
  let newCouponId: string | null = null;

  if (couponCode && couponCode.trim()) {
    const couponResult = await validateCouponCode(couponCode, basePrice);
    if (!couponResult.success) {
      return createFailure(couponResult.error);
    }
    validatedCoupon = couponResult.data?.coupon ?? null;
    newCouponId = validatedCoupon?.id ?? null;
  }

  const priceCalculation = calculateReservationPrice({
    hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  const calculatedPrice = totalPrice ?? priceCalculation.totalPrice;
  const couponDiscountAmount =
    priceCalculation.couponDiscount > 0
      ? priceCalculation.couponDiscount
      : null;
  const durationDiscountAmount =
    priceCalculation.durationDiscount > 0
      ? priceCalculation.durationDiscount
      : null;

  const oldCouponId = currentReservation.couponId;
  const couponChanged = oldCouponId !== newCouponId;

  // トランザクション更新
  try {
    await prisma.$transaction(async (tx) => {
      // Race Condition防止: トランザクション内で再チェック
      const overlapCheckTx = await checkReservationOverlap(
        {
          spaceId,
          startTime: startDateTime,
          endTime: endDateTime,
          excludeReservationId: id,
        },
        tx,
      );
      if (overlapCheckTx.hasOverlap) {
        throw new ReservationOverlapError();
      }

      await tx.reservation.update({
        where: { id },
        data: {
          spaceId,
          customerId,
          startTime: startDateTime,
          endTime: endDateTime,
          status,
          totalPrice: calculatedPrice,
          basePrice,
          couponId: newCouponId,
          couponDiscountAmount,
          durationDiscountAmount,
          notes: notes || null,
        },
      });

      // クーポン使用回数をアトミックに調整
      if (couponChanged) {
        if (oldCouponId) {
          await decrementCouponUsage(oldCouponId);
        }
        if (newCouponId) {
          await incrementCouponUsage(newCouponId);
        }
      }
    });
  } catch (error) {
    if (isReservationOverlapError(error)) {
      return createFailure(
        "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      );
    }
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "updateAdminReservation", reservationId: id },
    });
    return createFailure("予約の更新に失敗しました");
  }

  updateTag(CACHE_TAGS.RESERVATIONS);

  // Googleカレンダー更新（バックグラウンド）
  const calendarData: ReservationSyncData = {
    reservationId: id,
    spaceName: space.name,
    customerName: `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`,
    customerEmail: currentReservation.customer.email,
    startTime: startDateTime,
    endTime: endDateTime,
    location: space.address ?? undefined,
    notes: notes ?? undefined,
    totalPrice: calculatedPrice,
  };

  fireAndForget(
    updateCalendarSync(calendarData).catch((error) => {
      logError(error, {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { operation: "updateCalendarSync", reservationId: id },
      });
    }),
  );

  // 変更通知メール（オプション）
  if (sendNotificationEmail) {
    fireAndForget(
      sendReservationConfirmationEmail({
        reservationId: id,
        customerEmail: currentReservation.customer.email,
        customerName: `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`,
        spaceName: space.name,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: calculatedPrice,
        notes: notes ?? undefined,
        location: space.address ?? undefined,
      }).catch((error) => {
        logError(error, {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "sendReservationConfirmationEmail",
            reservationId: id,
          },
        });
      }),
    );
  }

  return createSuccess("予約を更新しました");
});
```

また、ファイル上部の `import` に `logError` `ErrorCategory` `ErrorSeverity` が必要。既存の import に含まれているか確認し、なければ追加:

```typescript
import {
  ErrorCategory,
  ErrorSeverity,
  ReservationOverlapError,
  isReservationOverlapError,
  logError,
} from "@/shared/lib/errors";
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 4: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts
git commit -m "feat(reservation): add updateAdminReservation Server Action"
```

---

## Task 5: `ReservationEditForm.tsx` コンポーネントを作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx`

`ReservationForm.tsx` をベースに、編集用の変更を加えた新コンポーネント。主な差分:

- `defaultValues` が既存予約データから pre-populate される
- `CustomerSelector` に `allowNewCustomer={false}` を渡す
- submit が `updateAdminReservation(reservationId, data)` を呼ぶ
- 「変更通知メール」チェックボックス（デフォルト off）
- 「送信中...」→「更新中...」テキスト

**Step 1: ファイル作成**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CalendarIcon } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Checkbox,
  SelectionBox,
} from '@/admin/components/ui'
import {
  updateReservationSchema,
  type UpdateReservationInput,
} from '@/admin/lib/validations/admin-reservation'
import { updateAdminReservation } from '@/admin/actions/reservation'
import { formatCurrency } from '@/shared/lib/utils'
import { ReservationStatus, isValidReservationStatus } from '@/shared/lib/validations/enums'
import { CustomerSelector } from './CustomerSelector'
import type { ReservationWithRelations } from '@/admin/actions/reservation'

// =============================================================================
// Types
// =============================================================================

type SpaceOption = {
  id: string
  name: string
  hourlyPrice: number
}

type ReservationEditFormProps = {
  reservation: ReservationWithRelations
  spaces: SpaceOption[]
}

// =============================================================================
// Helpers
// =============================================================================

/** Date → YYYY-MM-DD（ローカルタイムゾーン） */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Date → HH:MM（ローカルタイムゾーン） */
function toLocalTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

// =============================================================================
// Constants
// =============================================================================

const RESERVATION_STATUS_OPTIONS = [
  { value: ReservationStatus.CONFIRMED, label: '確定', description: '予約が確定済み' },
  { value: ReservationStatus.PENDING, label: '保留', description: '確認待ち' },
  { value: ReservationStatus.CANCELLED, label: 'キャンセル', description: '予約をキャンセル' },
]

// 時間オプション（9:00-21:00、1時間刻み）
const TIME_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const hour = 9 + i
  return `${hour.toString().padStart(2, '0')}:00`
})

// =============================================================================
// Main Component
// =============================================================================

export function ReservationEditForm({ reservation, spaces }: ReservationEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined)

  // CustomerSelector用の状態（常に既存顧客モード）
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string
    name: string
    email: string
  } | null>({
    id: reservation.customer.id,
    name: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    email: reservation.customer.email,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<UpdateReservationInput>({
    resolver: zodResolver(updateReservationSchema),
    defaultValues: {
      spaceId: reservation.spaceId,
      date: toLocalDateString(reservation.startTime),
      startTime: toLocalTimeString(reservation.startTime),
      endTime: toLocalTimeString(reservation.endTime),
      customerId: reservation.customerId,
      couponCode: reservation.coupon?.code ?? '',
      status: reservation.status,
      notes: reservation.notes ?? '',
      sendNotificationEmail: false,
    },
  })

  const spaceId = useWatch({ control, name: 'spaceId' })
  const date = useWatch({ control, name: 'date' })
  const startTime = useWatch({ control, name: 'startTime' })
  const endTime = useWatch({ control, name: 'endTime' })
  const status = useWatch({ control, name: 'status' })
  const sendNotificationEmail = useWatch({ control, name: 'sendNotificationEmail' })

  // 選択されたスペース情報
  const selectedSpace = spaces.find((s) => s.id === spaceId)

  // 料金自動計算
  const calculatedPrice = (() => {
    if (!selectedSpace || !startTime || !endTime) return null
    try {
      const start = new Date(`${date || '2000-01-01'}T${startTime}`)
      const end = new Date(`${date || '2000-01-01'}T${endTime}`)
      if (end <= start) return null
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      return selectedSpace.hourlyPrice * hours
    } catch {
      return null
    }
  })()

  const displayPrice = manualPrice ?? calculatedPrice

  const onSubmit = async (data: UpdateReservationInput) => {
    startTransition(async () => {
      const submitData: UpdateReservationInput = {
        ...data,
        totalPrice: manualPrice,
      }

      const result = await updateAdminReservation(reservation.id, submitData)
      if (result.success) {
        toast.success(result.message)
        router.push(`/admin/reservations/${reservation.id}`)
      } else {
        toast.error(result.error || '予約の更新に失敗しました')
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, messages]) => {
            messages.forEach((message: string) => toast.error(`${field}: ${message}`))
          })
        }
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: スペース・日時・料金 */}
        <div className="space-y-6">
          {/* スペース選択 */}
          <Card>
            <CardHeader>
              <CardTitle>スペース選択</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spaceId">スペース *</Label>
                <Select
                  value={spaceId || ''}
                  onValueChange={(value) => setValue('spaceId', value)}
                  disabled={isPending}
                >
                  <SelectTrigger id="spaceId">
                    <SelectValue placeholder="スペースを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {spaces.map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name} - {formatCurrency(space.hourlyPrice)}/時間
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.spaceId && (
                  <p className="text-sm text-destructive">{errors.spaceId.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 日時選択 */}
          <Card>
            <CardHeader>
              <CardTitle>日時選択</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date">日付 *</Label>
                <div className="relative">
                  <Input
                    id="date"
                    type="date"
                    {...register('date')}
                    disabled={isPending}
                    className="pr-10"
                  />
                  <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {errors.date && (
                  <p className="text-sm text-destructive">{errors.date.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">開始時間 *</Label>
                  <Select
                    value={startTime || ''}
                    onValueChange={(value) => setValue('startTime', value)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="startTime">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.startTime && (
                    <p className="text-sm text-destructive">{errors.startTime.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endTime">終了時間 *</Label>
                  <Select
                    value={endTime || ''}
                    onValueChange={(value) => setValue('endTime', value)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="endTime">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.endTime && (
                    <p className="text-sm text-destructive">{errors.endTime.message}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 料金 */}
          <Card>
            <CardHeader>
              <CardTitle>料金</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayPrice !== null ? (
                <div className="space-y-2">
                  <div className="text-2xl font-bold">{formatCurrency(displayPrice)}</div>
                  {!manualPrice && calculatedPrice !== null && (
                    <p className="text-sm text-muted-foreground">
                      自動計算: {formatCurrency(selectedSpace!.hourlyPrice)}/時間 ×{' '}
                      {Math.round(
                        ((calculatedPrice / selectedSpace!.hourlyPrice) * 10) / 10
                      )}
                      時間
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">スペースと時間を選択してください</p>
              )}

              <div className="space-y-2">
                <Label htmlFor="manualPrice">手動で料金を調整</Label>
                <Input
                  id="manualPrice"
                  type="number"
                  value={manualPrice ?? ''}
                  onChange={(e) =>
                    setManualPrice(e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="手動で料金を入力（任意）"
                  disabled={isPending}
                />
                <p className="text-sm text-muted-foreground">
                  割引や追加料金がある場合に手動で調整できます。空欄にすると自動計算に戻ります。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* クーポン */}
          <Card>
            <CardHeader>
              <CardTitle>クーポン</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="couponCode">クーポンコード</Label>
                <Input
                  id="couponCode"
                  type="text"
                  {...register('couponCode')}
                  placeholder="クーポンコードを入力（任意）"
                  disabled={isPending}
                />
                {reservation.coupon && (
                  <p className="text-sm text-muted-foreground">
                    現在適用中: {reservation.coupon.code}（{reservation.coupon.name}）
                  </p>
                )}
                {errors.couponCode && (
                  <p className="text-sm text-destructive">{errors.couponCode.message}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: 顧客情報 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>顧客情報</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerSelector
                selectedCustomer={selectedCustomer}
                onSelectCustomer={(customer) => {
                  setSelectedCustomer(customer)
                  setValue('customerId', customer?.id ?? '')
                }}
                onNewCustomerData={() => {}}
                isNewCustomer={false}
                onToggleNewCustomer={() => {}}
                allowNewCustomer={false}
              />
              {errors.customerId && (
                <p className="mt-2 text-sm text-destructive">{errors.customerId.message}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 下部: ステータス・メモ・通知設定 */}
      <Card>
        <CardHeader>
          <CardTitle>追加設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>予約ステータス</Label>
            <SelectionBox
              options={RESERVATION_STATUS_OPTIONS}
              value={status ?? ReservationStatus.CONFIRMED}
              onChange={(value) => {
                if (isValidReservationStatus(value)) setValue('status', value)
              }}
              columns={3}
              disabled={isPending}
              name="予約ステータス"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="例: 電話予約、紹介（山田様）"
              disabled={isPending}
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="sendNotificationEmail"
              checked={sendNotificationEmail}
              onCheckedChange={(checked) =>
                setValue('sendNotificationEmail', checked === true)
              }
              disabled={isPending}
            />
            <Label htmlFor="sendNotificationEmail" className="cursor-pointer">
              変更通知メールを顧客に送信する
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ボタン */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? '更新中...' : '予約を更新'}
        </Button>
      </div>
    </form>
  )
}
```

**Step 2: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx
git commit -m "feat(reservation): add ReservationEditForm component"
```

---

## Task 6: 編集ページ `/admin/reservations/[id]/edit/page.tsx` を作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx`

**Step 1: ファイル作成**

```typescript
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getReservationById, getSpacesForReservation } from '@/admin/actions/reservation'
import { ReservationEditForm } from '../../_components/ReservationEditForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const reservation = await getReservationById(id)

  if (!reservation) {
    return { title: '予約が見つかりません | Myrrh Rental Space' }
  }

  return {
    title: `予約編集: ${reservation.customer.lastName}${reservation.customer.firstName} | Myrrh Rental Space`,
  }
}

export default async function ReservationEditPage({ params }: PageProps) {
  await connection()
  const { id } = await params

  const [reservation, spaces] = await Promise.all([
    getReservationById(id),
    getSpacesForReservation(),
  ])

  if (!reservation) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/reservations/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            詳細に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">予約編集</h1>
          <p className="text-muted-foreground">
            {reservation.customer.lastName} {reservation.customer.firstName} 様の予約
          </p>
        </div>
      </div>

      {/* 編集フォーム */}
      <ReservationEditForm reservation={reservation} spaces={spaces} />
    </div>
  )
}
```

**Step 2: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/reservations/\[id\]/edit/page.tsx
git commit -m "feat(reservation): add reservation edit page"
```

---

## Task 7: `ReservationDetail.tsx` に「編集」ボタンを追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx`

**Step 1: import に Link を追加**

ファイル先頭の import を確認し、`Link` が未 import なら追加:

```typescript
import Link from "next/link";
import { Pencil } from "lucide-react";
```

**Step 2: ステータスカードのヘッダーに編集ボタンを追加**

現在のステータスカード（`<Card>` の `<CardHeader>`）を以下に変更:

```tsx
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>ステータス</CardTitle>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/admin/reservations/${reservation.id}/edit`}>
          <Pencil className="mr-2 h-4 w-4" />
          編集
        </Link>
      </Button>
    </div>
  </CardHeader>
  <CardContent>
    {/* ... 既存のステータス変更UI（そのまま残す） ... */}
  </CardContent>
</Card>
```

> ステータス変更・メモ編集の既存UIはそのまま残す（クイック操作として引き続き使えるため）。

**Step 3: 型チェックと lint**

```bash
bun run validate
```

Expected: エラーなし

**Step 4: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/reservations/\[id\]/_components/ReservationDetail.tsx
git commit -m "feat(reservation): add edit button to ReservationDetail"
```

---

## Task 8: 最終検証

**Step 1: フル検証**

```bash
bun run validate && bun run build
```

Expected: 型エラー・lintエラーなし、ビルド成功

**Step 2: 動作確認（手動）**

1. `/admin/reservations` で任意の予約の詳細ページを開く
2. 「編集」ボタンをクリック → `/admin/reservations/[id]/edit` に遷移
3. フォームに既存データが pre-populate されていることを確認
4. スペース・日時を変更 → 料金が自動再計算されることを確認
5. 顧客を別の既存顧客に変更できることを確認
6. 「予約を更新」→ 詳細ページに戻り更新内容が反映されることを確認

**Step 3: 最終コミット（必要な場合）**

```bash
git add -A
git commit -m "feat(reservation): implement full reservation editing"
```
