# Customer Management Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 顧客紐づけシステムの管理機能4件を実装 — 「顧客情報を更新」ボタン、顧客マージ、名前不一致フラグ、メール差分通知

**Architecture:** 既存の admin パターン（executeAdminMutationResult, DeleteConfirmDialog, ActionDropdown）を踏襲。ドメインコマンドは commands.ts に追加、Server Action は既存ファイルに追加。UI は既存コンポーネントを拡張。

**Tech Stack:** Next.js 16, Prisma 7, Bun Test, shadcn/ui, Tabler Icons

---

## Task 1: 予約詳細「顧客情報を更新」ボタン

**Files:**

- Modify: `src/shared/domain/customers/commands.ts` — `updateCustomerFromGuestData` コマンド追加
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts` — `updateCustomerFromReservation` アクション追加
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx` — ボタン + 確認ダイアログ追加

- [ ] **Step 1: ドメインコマンド追加**

`src/shared/domain/customers/commands.ts` の末尾（`deleteCustomer` の後）に追加:

```typescript
/** 予約のゲスト入力値で顧客情報を更新 */
export async function updateCustomerFromGuestData(
  customerId: string,
  guestData: {
    lastName: string;
    firstName: string;
    phoneNumber: string | null;
    companyName: string | null;
  },
): Promise<void> {
  await ensureCustomerExists(customerId);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      lastName: guestData.lastName,
      firstName: guestData.firstName,
      phoneNumber: guestData.phoneNumber,
      companyName: guestData.companyName,
    },
  });
}
```

- [ ] **Step 2: Server Action 追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts` に追加。ファイル先頭の import に `updateCustomerFromGuestData` を追加し、関数を追加:

```typescript
import { updateCustomerFromGuestData } from "@/shared/domain/customers/commands";

export async function updateCustomerFromReservation(
  reservationId: string,
): Promise<MutationResult<null>> {
  const parsed = z.string().uuid().safeParse(reservationId);
  if (!parsed.success) return createMutationError("無効な予約IDです");

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () => {
      const reservation = await prisma.reservation.findUnique({
        where: { id: parsed.data, deletedAt: null },
        select: {
          customerId: true,
          guestLastName: true,
          guestFirstName: true,
          guestPhone: true,
          guestCompanyName: true,
        },
      });
      if (!reservation)
        throw new DomainError("予約が見つかりません", "NOT_FOUND");
      if (!reservation.guestLastName)
        throw new DomainError("ゲスト情報がありません", "VALIDATION");

      await updateCustomerFromGuestData(reservation.customerId, {
        lastName: reservation.guestLastName,
        firstName: reservation.guestFirstName ?? "",
        phoneNumber: reservation.guestPhone,
        companyName: reservation.guestCompanyName,
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(CACHE_TAGS.RESERVATIONS);
    },
  });
}
```

- [ ] **Step 3: ReservationDetail に更新ボタン追加**

`ReservationDetail.tsx` の差分アラート内（行 281 の `</dl>` の後、`</div>` の前）にボタンを追加。コンポーネントに `useTransition` と `updateCustomerFromReservation` の import を追加:

```tsx
// import 追加
import { updateCustomerFromReservation } from "@/admin/actions/reservation";

// 既存の state/transition の近くに追加
const [isUpdateCustomerPending, startUpdateCustomerTransition] =
  useTransition();

const handleUpdateCustomer = () => {
  startUpdateCustomerTransition(async () => {
    const result = await updateCustomerFromReservation(reservation.id);
    if (isMutationError(result)) {
      toast.error(result.error);
    } else {
      toast.success("顧客情報を更新しました");
      router.refresh();
    }
  });
};
```

差分アラート内の `</dl>` の後に:

```tsx
<div className="mt-3 flex justify-end">
  <Button
    variant="outline"
    size="sm"
    onClick={handleUpdateCustomer}
    disabled={isUpdateCustomerPending}
  >
    {isUpdateCustomerPending ? "更新中..." : "顧客情報を更新"}
  </Button>
</div>
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/domain/customers/commands.ts 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts' 'src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx'
git commit -m "feat(admin): add 'update customer from reservation' button in reservation detail"
```

---

## Task 2: 顧客マージ機能

**Files:**

- Modify: `src/shared/domain/customers/commands.ts` — `mergeCustomerCommand` 追加
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` — `mergeCustomers` アクション追加
- Create: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/MergeCustomerDialog.tsx` — マージ UI

- [ ] **Step 1: マージコマンド追加**

`src/shared/domain/customers/commands.ts` に追加:

```typescript
/** 顧客マージ: source の全リレーションを target に移管し source を削除 */
export async function mergeCustomerCommand(
  sourceId: string,
  targetId: string,
): Promise<{
  transferredReservations: number;
  transferredInquiries: number;
  transferredReviews: number;
  transferredRegistrations: number;
}> {
  if (sourceId === targetId) {
    throw new DomainError("同じ顧客をマージすることはできません", "VALIDATION");
  }

  const [source, target] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: sourceId },
      select: { id: true },
    }),
    prisma.customer.findUnique({
      where: { id: targetId },
      select: { id: true },
    }),
  ]);
  if (!source)
    throw new DomainError("マージ元の顧客が見つかりません", "NOT_FOUND");
  if (!target)
    throw new DomainError("マージ先の顧客が見つかりません", "NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const [reservations, inquiries, reviews, registrations] = await Promise.all(
      [
        tx.reservation.updateMany({
          where: { customerId: sourceId, deletedAt: null },
          data: { customerId: targetId },
        }),
        tx.inquiry.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.spaceReview.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.eventRegistration.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
      ],
    );

    // target の統計を再計算
    const stats = await tx.reservation.aggregate({
      where: { customerId: targetId, deletedAt: null },
      _count: true,
      _sum: { totalPriceWithTax: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    await tx.customer.update({
      where: { id: targetId },
      data: {
        totalReservations: stats._count,
        totalSpent: stats._sum.totalPriceWithTax,
        firstReservationAt: stats._min.createdAt,
        lastReservationAt: stats._max.createdAt,
      },
    });

    // source を削除
    await tx.customer.delete({ where: { id: sourceId } });

    return {
      transferredReservations: reservations.count,
      transferredInquiries: inquiries.count,
      transferredReviews: reviews.count,
      transferredRegistrations: registrations.count,
    };
  });
}
```

- [ ] **Step 2: Server Action 追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` に追加:

```typescript
export async function mergeCustomers(
  sourceId: string,
  targetId: string,
): Promise<
  MutationResult<{
    transferredReservations: number;
    transferredInquiries: number;
    transferredReviews: number;
    transferredRegistrations: number;
  }>
> {
  const sourceValid = z.string().uuid().safeParse(sourceId);
  const targetValid = z.string().uuid().safeParse(targetId);
  if (!sourceValid.success || !targetValid.success) {
    return createMutationError("無効な顧客IDです");
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    resourceId: sourceValid.data,
    execute: async () =>
      mergeCustomerCommand(sourceValid.data, targetValid.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(sourceValid.data));
      updateTag(getCacheTag.customers.detail(targetValid.data));
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(CACHE_TAGS.REVIEWS);
      updateTag(CACHE_TAGS.EVENTS);
    },
  });
}
```

- [ ] **Step 3: MergeCustomerDialog コンポーネント作成**

`src/app/(admin)/admin/(dashboard)/customers/[id]/_components/MergeCustomerDialog.tsx` を作成。顧客検索 → 選択 → 確認 → 実行のフロー。

既存の `searchCustomers` クエリを使用。`AlertDialog` + `useTransition` パターン。

コンポーネントは以下の props を受け取る:

```typescript
type Props = {
  sourceCustomer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
```

内部:

- `useState<string>("")` で検索クエリ
- `useState<CustomerSearchResult | null>(null)` で選択中のマージ先
- `useTransition` で isPending
- 検索は `startTransition` + `searchCustomers` Server Action 呼び出し
- 確認画面で「予約・問い合わせ・レビュー・イベント参加をマージ先に移管し、この顧客を削除します」
- 成功時: `router.push(/admin/customers/${targetId})` でマージ先にリダイレクト

- [ ] **Step 4: 顧客詳細ページにマージボタン追加**

`src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx` の `AdminDetailLayout actions` にマージボタンを追加。

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/customers/commands.ts 'src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts' 'src/app/(admin)/admin/(dashboard)/customers/[id]/_components/MergeCustomerDialog.tsx' 'src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx'
git commit -m "feat(admin): add customer merge functionality (Square MergeCustomers pattern)"
```

---

## Task 3: 顧客一覧「名前不一致」フラグ

**Files:**

- Modify: `src/shared/domain/customers/queries.ts` — 一覧クエリに最新予約 guest 名を含める
- Modify: 顧客一覧テーブルコンポーネント — 不一致アイコン表示

- [ ] **Step 1: 顧客一覧クエリに最新予約の guest 名を追加**

`src/shared/domain/customers/queries.ts` の `getCustomers` 関数の select に追加:

```typescript
reservations: {
  select: { guestLastName: true, guestFirstName: true },
  where: { deletedAt: null, guestLastName: { not: null } },
  orderBy: { createdAt: "desc" as const },
  take: 1,
},
```

- [ ] **Step 2: 顧客テーブルに不一致アイコン追加**

顧客一覧のテーブルコンポーネントで、名前列に不一致チェック:

```tsx
import { IconAlertTriangle } from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/admin/components/ui/tooltip";

// 名前セル内:
const latestReservation = customer.reservations?.[0];
const hasNameMismatch =
  latestReservation?.guestLastName &&
  `${latestReservation.guestLastName} ${latestReservation.guestFirstName ?? ""}`.trim() !==
    `${customer.lastName} ${customer.firstName}`.trim();

// JSX:
{
  hasNameMismatch && (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconAlertTriangle size={14} className="text-warning" />
      </TooltipTrigger>
      <TooltipContent>最新予約のゲスト名と異なります</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/customers/queries.ts 'src/app/(admin)/admin/(dashboard)/customers/_components/'
git commit -m "feat(admin): show name mismatch flag in customer list"
```

---

## Task 4: 管理者通知メールに差分表示

**Files:**

- Modify: `src/shared/domain/reservations/commands.ts` — `buildPayload` にゲスト名を追加
- Modify: `src/shared/lib/email/reservation-emails.ts` — メールテンプレートに差分表示

- [ ] **Step 1: buildPayload にゲスト名フィールド追加**

`src/shared/domain/reservations/commands.ts` の `buildPayload` 関数:

params の型に追加:

```typescript
guestName?: string | null;
guestPhone?: string | null;
```

return に追加:

```typescript
guestName: params.guestName ?? undefined,
guestPhone: params.guestPhone ?? undefined,
```

`ReservationPayload` 型にも追加:

```typescript
guestName?: string;
guestPhone?: string;
```

`createPublicReservationCommand` の `buildPayload` 呼び出しに追加:

```typescript
guestName: input.lastName !== created.customer.lastName || input.firstName !== created.customer.firstName
  ? `${input.lastName} ${input.firstName}`.trim()
  : undefined,
guestPhone: input.phoneNumber && input.phoneNumber !== created.customer.phoneNumber
  ? input.phoneNumber
  : undefined,
```

- [ ] **Step 2: メールテンプレートに差分表示追加**

`src/shared/lib/email/reservation-emails.ts` の管理者通知テンプレート内で、`data.guestName` がある場合に差分行を追加:

```typescript
// 管理者通知メール本文内に追加
...(data.guestName ? [`⚠ 予約時入力: ${data.guestName}${data.guestPhone ? ` / ${data.guestPhone}` : ""}`] : []),
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/reservations/commands.ts src/shared/lib/email/reservation-emails.ts
git commit -m "feat(email): show guest name diff in admin reservation notification"
```

---

## Task 5: 全体検証

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: 全テスト**

Run: `bun run test`
Expected: 既存の 10 fail 以外は全 PASS
