# 管理画面 詳細・編集ページ 完全刷新 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 管理画面の詳細・編集ページ（約15ファイル）に AdminDetailLayout / DetailSection / DetailField / DangerZone の4共有コンポーネントを導入し、Server Component + Client Islands アーキテクチャ・shadcn/ui Form パターン・統一ヘッダー構造に刷新する。

**Architecture:** 詳細ページは Server Component として page.tsx で完結させ、状態を持つ部分のみ Client Island として切り出す。編集ページは AdminDetailLayout でヘッダーを統一し、フォームは shadcn/ui FormField + zodResolver に移行する。`await connection()` は必ず各ページで1回のみ呼ぶ。

**Tech Stack:** Next.js 16 App Router (Server Components, `await connection()`), React 19, shadcn/ui (Form, Card, Button, Input), React Hook Form + zodResolver, Zod 4, Tailwind CSS 4

---

## 事前確認（全タスク共通の前提知識）

### インポートパス

```typescript
// 共有コンポーネント（管理画面専用）
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DangerZone } from "@/admin/components/DangerZone";

// shadcn/ui Form
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/admin/components/ui/form";

// ActionResult 型（管理画面内は必ずこちら）
import type { ActionResult } from "@/admin/types/server-actions";

// PPR opt-in（各ページで1回のみ）
import { connection } from "next/server";
```

### 統一ルール（全ページ適用）

| ルール         | 正しいパターン                                                     |
| -------------- | ------------------------------------------------------------------ |
| バックボタン   | `AdminDetailLayout backHref` — 左上固定                            |
| 編集ボタン     | `AdminDetailLayout actions` prop — ヘッダー右                      |
| 削除ボタン     | `DangerZone` — ページ最下部のみ                                    |
| `connection()` | ページコンポーネントで**1回のみ**                                  |
| タイトル CSS   | `text-2xl font-bold tracking-tight text-foreground`                |
| フォームエラー | `<FormMessage />` のみ（手動 `text-xs text-destructive` 段落禁止） |

### 検証コマンド

```bash
# タスク完了後の確認
bun run type-check

# フェーズ完了後の確認
bun run validate

# 全タスク完了後
bun run validate && bun run build
```

---

## Phase 1: 共有コンポーネント作成

### Task 1: AdminDetailLayout コンポーネント作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/AdminDetailLayout.tsx`

**Step 1: ファイルを作成**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/AdminDetailLayout.tsx
// Server Component — 'use client' なし
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/admin/components/ui/button";

type AdminDetailLayoutProps = {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminDetailLayout({
  backHref,
  backLabel = "一覧に戻る",
  title,
  subtitle,
  actions,
  children,
}: AdminDetailLayoutProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      {/* コンテンツ */}
      {children}
    </div>
  );
}
```

**Step 2: 型チェック実行**

```bash
bun run type-check
```

期待: エラーなし

**Step 3: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/AdminDetailLayout.tsx
git commit -m "feat(admin): add AdminDetailLayout shared component"
```

---

### Task 2: DetailSection + DetailField コンポーネント作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/DetailSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/DetailField.tsx`

**Step 1: DetailSection.tsx を作成**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/DetailSection.tsx
// Server Component — 'use client' なし
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";

type DetailSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DetailSection({
  title,
  description,
  children,
}: DetailSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

**Step 2: DetailField.tsx を作成**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/DetailField.tsx
// Server Component — 'use client' なし
import type { ReactNode } from "react";
import { cn } from "@/admin/lib/utils";

type DetailFieldProps = {
  label: string;
  value?: ReactNode;
  className?: string;
};

export function DetailField({ label, value, className }: DetailFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">
        {value != null && value !== "" ? (
          value
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}
```

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/DetailSection.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/components/DetailField.tsx
git commit -m "feat(admin): add DetailSection and DetailField shared components"
```

---

### Task 3: DangerZone コンポーネント作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/DangerZone.tsx`

**Step 1: ファイルを作成**

注意: `onDelete` は Server Action 関数を受け取る（Next.js 16 では Server Actions を props として Client Component に渡せる）。

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/DangerZone.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/admin/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import type { ActionResult } from "@/admin/types/server-actions";

type DangerZoneProps = {
  deleteLabel: string;
  itemName?: string;
  onDelete: () => Promise<ActionResult>;
  redirectTo: string;
};

export function DangerZone({
  deleteLabel,
  itemName,
  onDelete,
  redirectTo,
}: DangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await onDelete();
      if (result.success) {
        router.push(redirectTo);
      } else {
        // 失敗してもダイアログを閉じる（エラーは result.error に入る）
        setOpen(false);
      }
    });
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-destructive">
          危険な操作
        </CardTitle>
        <CardDescription>この操作は取り消せません</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={isPending}
        >
          {deleteLabel}
        </Button>
      </CardContent>
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        itemName={itemName}
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </Card>
  );
}
```

**Step 2: DeleteConfirmDialog の props を確認**

```bash
# props 確認
head -60 src/app/'(admin)'/admin/'(dashboard)'/_shared/components/DeleteConfirmDialog.tsx
```

`onConfirm` が `() => void` の場合は `handleConfirm` をそのまま渡す。`() => Promise<void>` の場合も問題なし。`isPending` プロパティが存在しない場合はそのフィールドを削除する（ファイルを確認してから合わせる）。

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/DangerZone.tsx
git commit -m "feat(admin): add DangerZone shared component"
```

---

## Phase 2: 詳細ページ刷新

### Task 4: reservations/[id]/page.tsx — Server Component 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx`
- Modify (or create): `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx
Read: src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx
```

**Step 2: page.tsx を刷新**

変更点:

- `await connection()` の重複を削除（1回のみにする）
- `AdminDetailLayout` を使ってヘッダーを統一
- `actions` prop に編集ボタンを配置
- `DangerZone` をページ最下部に追加（削除アクションが `ReservationDetail` 内にある場合は移動）

```tsx
// src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/admin/components/ui/button";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { getReservationById } from "@/admin/actions/reservations"; // 既存の action
import { deleteReservation } from "@/admin/actions/reservations"; // 既存の action
import { ReservationDetail } from "./_components/ReservationDetail"; // 既存コンポーネント

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection(); // 1回のみ
  const { id } = await params;

  const reservation = await getReservationById(id);
  if (!reservation) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title="予約詳細"
      subtitle={`${reservation.space.name} — ${reservation.customer.lastName} ${reservation.customer.firstName}`}
      actions={
        <Button asChild>
          <Link href={`/admin/reservations/${id}/edit`}>編集</Link>
        </Button>
      }
    >
      <ReservationDetail reservation={reservation} />
      <DangerZone
        deleteLabel="予約を削除"
        itemName={`予約 #${id.slice(0, 8)}`}
        onDelete={() => deleteReservation(id)}
        redirectTo="/admin/reservations"
      />
    </AdminDetailLayout>
  );
}
```

**Step 3: ReservationDetail.tsx からヘッダー・バックボタン・編集ボタン・削除ボタンを削除**

`ReservationDetail.tsx` を読んで、以下を削除:

- ページヘッダー部分（タイトル、バックボタン、編集ボタン）
- CardHeader 内の「編集」ボタン
- 削除確認ダイアログとその state

残す: 予約情報の表示カード（DetailSection/DetailField に変換するのは任意、既存のカード構造のままでも OK）

`'use client'` は、status 変更などのインタラクティブな操作がある場合のみ残す。**純粋な表示のみなら `'use client'` を削除して Server Component 化する。**

**Step 4: 型チェック実行**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/reservations/'[id]'/
git commit -m "refactor(admin): apply AdminDetailLayout to reservation detail page"
```

---

### Task 5: customers/[id]/page.tsx — AdminDetailLayout 適用

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx
Read: src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx
```

**Step 2: page.tsx を刷新**

既知の問題: `await connection()` が2回（lines 25-26）、CustomerDetail に header + back button が含まれている。

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/admin/components/ui/button";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { getCustomerById } from "@/admin/actions/customers"; // 既存
import { deleteCustomer } from "@/admin/actions/customers"; // 既存

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection(); // 1回のみ（重複を削除）
  const { id } = await params;

  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const name = `${customer.lastName} ${customer.firstName}`;

  return (
    <AdminDetailLayout
      backHref="/admin/customers"
      title={name}
      subtitle={customer.email}
      actions={
        <Button asChild>
          <Link href={`/admin/customers/${id}/edit`}>編集</Link>
        </Button>
      }
    >
      <CustomerDetail customer={customer} /> // ヘッダー削除後のコンポーネント
      <DangerZone
        deleteLabel="顧客を削除"
        itemName={name}
        onDelete={() => deleteCustomer(id)}
        redirectTo="/admin/customers"
      />
    </AdminDetailLayout>
  );
}
```

**Step 3: CustomerDetail.tsx からヘッダー部分を削除**

`CustomerDetail.tsx` (298 lines, `'use client'`) から以下を削除:

- ページトップのバックボタン
- タイトル行（`h1`）
- 編集ボタン
- 削除ボタン + DeleteConfirmDialog + その state

`'use client'` は、インタラクティブな操作（ステータス変更等）がある場合のみ残す。純粋表示のみなら削除。

**Step 4: 型チェック実行**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/customers/'[id]'/
git commit -m "refactor(admin): apply AdminDetailLayout to customer detail page"
```

---

### Task 6: inquiries/[id]/page.tsx — 削除ボタンをDangerZoneに移動

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/inquiries/[id]/page.tsx
Read: src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx
```

**Step 2: page.tsx を刷新**

既知の問題: InquiryDetail に削除ボタンがヘッダー内にある（192 lines, `'use client'`）。

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { getInquiryById } from "@/admin/actions/inquiries"; // 既存
import { deleteInquiry } from "@/admin/actions/inquiries"; // 既存
import { InquiryDetail } from "./_components/InquiryDetail";

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const inquiry = await getInquiryById(id);
  if (!inquiry) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/inquiries"
      title="お問い合わせ詳細"
      subtitle={inquiry.name ?? inquiry.email}
    >
      <InquiryDetail inquiry={inquiry} />
      <DangerZone
        deleteLabel="お問い合わせを削除"
        itemName={inquiry.name ?? inquiry.email}
        onDelete={() => deleteInquiry(id)}
        redirectTo="/admin/inquiries"
      />
    </AdminDetailLayout>
  );
}
```

**Step 3: InquiryDetail.tsx からヘッダーと削除ボタンを削除**

`InquiryDetail.tsx` から以下を削除:

- ページヘッダー（タイトル、バックボタン）
- 削除ボタン + DeleteConfirmDialog + その state（`deleteOpen`, `setDeleteOpen`）

**Step 4: 型チェック実行**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/inquiries/'[id]'/
git commit -m "refactor(admin): move delete action to DangerZone in inquiry detail page"
```

---

### Task 7: locations/[id]/page.tsx — AdminDetailLayout 追加（ヘッダーが存在しない）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/locations/[id]/_components/LocationDetail.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/locations/[id]/page.tsx
Read: src/app/(admin)/admin/(dashboard)/locations/[id]/_components/LocationDetail.tsx
```

**Step 2: page.tsx を刷新**

既知の問題: LocationDetail (234 lines, `'use client'`) にはヘッダーもバックボタンも一切ない。

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/admin/components/ui/button";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { getLocationById } from "@/admin/actions/locations"; // 既存
import { deleteLocation } from "@/admin/actions/locations"; // 既存
import { LocationDetail } from "./_components/LocationDetail";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const location = await getLocationById(id);
  if (!location) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/locations"
      title={location.name}
      subtitle="拠点詳細"
      actions={
        <Button asChild>
          <Link href={`/admin/locations/${id}/edit`}>編集</Link>
        </Button>
      }
    >
      <LocationDetail location={location} />
      <DangerZone
        deleteLabel="拠点を削除"
        itemName={location.name}
        onDelete={() => deleteLocation(id)}
        redirectTo="/admin/locations"
      />
    </AdminDetailLayout>
  );
}
```

**Step 3: LocationDetail.tsx から削除ボタン（あれば）を削除**

現在は「危険な操作」カードが含まれているかもしれない。含まれていれば削除し、`DangerZone` に一本化する。

**Step 4: 型チェック実行**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/locations/'[id]'/
git commit -m "refactor(admin): add AdminDetailLayout header to location detail page"
```

---

### Task 8: spaces/[id]/page.tsx — connection() 重複削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/page.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/spaces/[id]/page.tsx
```

**Step 2: 重複した `await connection()` を1行に削減**

lines 35-36 付近にある重複した `await connection()` を削除。既存のヘッダーが `AdminDetailLayout` のパターンに合っているか確認し、合っていなければ修正する。

変更前（概略）:

```tsx
await connection();
await connection(); // ← この行を削除
```

変更後:

```tsx
await connection(); // 1回のみ
```

ヘッダー CSS も確認して `text-2xl font-bold tracking-tight text-foreground` になっているか確認し、なければ修正する。

また、AdminDetailLayout を使って統一する（ヘッダーが手書きの場合）。

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/spaces/'[id]'/page.tsx
git commit -m "fix(admin): remove duplicate await connection() in space detail page"
```

---

### Task 9: coupons/[id]/page.tsx — AdminDetailLayout + connection() 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/coupons/[id]/page.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/coupons/[id]/page.tsx
```

**Step 2: ページを刷新**

既知の問題: `await connection()` が2回（lines 33-34）、AdminDetailLayout が未使用。

- `await connection()` の重複を削除（1回のみ）
- 既存のヘッダーを `AdminDetailLayout` に置き換え
- 削除ボタンが存在するなら `DangerZone` に移動

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/coupons/'[id]'/page.tsx
git commit -m "refactor(admin): apply AdminDetailLayout to coupon detail page"
```

---

### Task 10: staff/[id]/page.tsx — AdminDetailLayout 統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx
```

**Step 2: AdminDetailLayout でヘッダーを統一**

- 既存のヘッダーを `AdminDetailLayout` に置き換え
- `backHref="/admin/staff"` + `title={user.name}` + `subtitle={user.email}`
- 編集ボタンを `actions` prop に配置
- `UserActions` コンポーネントがある場合は `actions` prop に含める
- 削除操作が `UserActions` 内にあれば `DangerZone` に移動

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/staff/'[id]'/page.tsx
git commit -m "refactor(admin): apply AdminDetailLayout to staff detail page"
```

---

### Task 11: reservations/[id]/edit/page.tsx — AdminDetailLayout 適用

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx
```

**Step 2: AdminDetailLayout でヘッダーを統一**

- 既存の手動ヘッダーを `AdminDetailLayout` に置き換え
- `backHref={'/admin/reservations/${id}'}` + `title="予約を編集"` + `subtitle={reservation.space.name}`
- `await connection()` が1回のみになっているか確認
- フォームコンポーネントは `AdminDetailLayout` の children として配置

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/reservations/'[id]'/edit/page.tsx
git commit -m "refactor(admin): apply AdminDetailLayout to reservation edit page"
```

---

## Phase 3: 編集フォーム shadcn/ui Form 移行

### Task 12: customers/\_components/CustomerEditForm.tsx — shadcn/ui Form 移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/edit/page.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx
Read: src/app/(admin)/admin/(dashboard)/customers/[id]/edit/page.tsx
Read: src/app/(admin)/admin/(dashboard)/_shared/lib/validations/customer.ts
```

**Step 2: edit/page.tsx に AdminDetailLayout を追加**

既知の問題: `await connection()` が2回（lines 25-26）。

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
// ...既存 imports

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection(); // 1回のみ
  const { id } = await params;

  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/customers/${id}`}
      title="顧客情報を編集"
      subtitle={`${customer.lastName} ${customer.firstName}`}
    >
      <CustomerEditForm customer={customer} />
    </AdminDetailLayout>
  );
}
```

**Step 3: CustomerEditForm.tsx を shadcn/ui Form に移行**

`CustomerEditForm.tsx` の現在の構造（raw register パターン）:

```tsx
// 変更前パターン（例）
const { register, formState: { errors }, handleSubmit } = useForm({ ... })
// ...
<Label htmlFor="email">メール</Label>
<Input id="email" {...register('email')} aria-invalid={!!errors.email} />
{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
```

変更後の構造（shadcn/ui Form パターン）:

```tsx
"use client";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/admin/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/admin/components/ui/form";
import { Input } from "@/admin/components/ui/input";
import {
  customerFormSchema,
  type CustomerFormData,
} from "@/admin/lib/validations/customer";
import { updateCustomer } from "@/admin/actions/customers";
import type { CustomerData } from "@/admin/lib/validations/customer";

type Props = {
  customer: CustomerData;
};

export function CustomerEditForm({ customer }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone ?? "",
      // ... 既存フィールドに合わせて
    },
  });

  const onSubmit = (data: CustomerFormData) => {
    startTransition(async () => {
      const result = await updateCustomer(customer.id, data);
      if (result.success) {
        router.push(`/admin/customers/${customer.id}`);
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      姓 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      名 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    メールアドレス <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* 既存フィールドの数と種類に合わせて FormField を追加 */}
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={`/admin/customers/${customer.id}`}>キャンセル</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "保存中..." : "変更を保存"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

**実装時の重要注意**:

1. `customer.ts` の `customerFormSchema` と `CustomerFormData` を確認してから `defaultValues` を設定
2. フォームの全フィールドを `FormField` に変換（省略不可）
3. `<p className="text-xs text-destructive">` のエラー表示をすべて `<FormMessage />` に置き換え
4. `aria-invalid`, `aria-describedby` 手動属性はすべて削除（`FormField` が自動で処理）

**Step 4: 型チェック実行**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/customers/
git commit -m "refactor(admin): migrate CustomerEditForm to shadcn/ui Form pattern"
```

---

### Task 13: locations/[id]/edit/page.tsx — AdminDetailLayout + connection() 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx`
- Modify (if exists): `src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx
Read: src/app/(admin)/admin/(dashboard)/_shared/lib/validations/location.ts
# LocationForm があれば
ls src/app/'(admin)'/admin/'(dashboard)'/locations/_components/
Read: src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx
```

**Step 2: edit/page.tsx を刷新**

既知の問題: `await connection()` が重複（lines 34-35）。

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
// ...

export default async function LocationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection(); // 1回のみ
  const { id } = await params;

  const location = await getLocationById(id);
  if (!location) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/locations/${id}`}
      title="拠点情報を編集"
      subtitle={location.name}
    >
      <LocationForm location={location} mode="edit" />
    </AdminDetailLayout>
  );
}
```

**Step 3: LocationForm が raw register パターンなら shadcn/ui Form に移行**

フォームが raw register パターン（`{...register('name')}`）の場合は Task 12 と同様の手順で `FormField` に移行する。

**Step 4: 型チェック実行**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/locations/'[id]'/edit/page.tsx
git commit -m "refactor(admin): apply AdminDetailLayout and fix connection() in location edit page"
```

---

### Task 14: staff/[id]/edit/page.tsx — AdminDetailLayout 統一（バックボタン位置修正）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/edit/page.tsx`

**Step 1: 現在のファイルを読む**

```
Read: src/app/(admin)/admin/(dashboard)/staff/[id]/edit/page.tsx
```

**Step 2: AdminDetailLayout でヘッダーを統一**

既知の問題: バックボタンが右側にある（逆レイアウト）。

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
// ...

export default async function StaffEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const user = await getUserById(id);
  if (!user) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/staff/${id}`}
      title="スタッフ情報を編集"
      subtitle={user.email}
    >
      <UserForm user={user} mode="edit" />
    </AdminDetailLayout>
  );
}
```

**Step 3: 型チェック実行**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/staff/'[id]'/edit/page.tsx
git commit -m "refactor(admin): apply AdminDetailLayout to staff edit page"
```

---

## Phase 4: ドキュメント更新 + 最終検証

### Task 15: admin-ui-patterns.md 更新 + 最終検証

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/` (確認のみ)
- Modify: `.claude/rules/frontend/admin-ui-patterns.md`

**Step 1: admin-ui-patterns.md に新しいパターンを追記**

`.claude/rules/frontend/admin-ui-patterns.md` の「## 禁止事項」セクションの前に以下を追記:

````markdown
## 詳細・編集ページ標準構造

### AdminDetailLayout（必須）

全詳細・編集ページは `AdminDetailLayout` を使用する:

```tsx
import { AdminDetailLayout } from '@/admin/components/AdminDetailLayout'

// 詳細ページ
<AdminDetailLayout
  backHref="/admin/reservations"
  title="予約詳細"
  subtitle="サブタイトル（任意）"
  actions={<Button asChild><Link href={`/admin/reservations/${id}/edit`}>編集</Link></Button>}
>
  {/* 詳細コンテンツ */}
  <DangerZone ... />  {/* 必ず最後 */}
</AdminDetailLayout>

// 編集ページ
<AdminDetailLayout
  backHref={`/admin/customers/${id}`}
  title="顧客情報を編集"
  subtitle={customer.name}
>
  <CustomerEditForm customer={customer} />
</AdminDetailLayout>
```
````

### DangerZone（削除操作の統一配置）

削除ボタンは `DangerZone` コンポーネントを使いページ最下部に配置する:

```tsx
import { DangerZone } from "@/admin/components/DangerZone";

<DangerZone
  deleteLabel="予約を削除"
  itemName="予約 #abc123"
  onDelete={() => deleteReservation(id)}
  redirectTo="/admin/reservations"
/>;
```

**禁止**: ヘッダー・CardHeader 内への削除ボタン配置

### DetailSection / DetailField（静的情報表示）

```tsx
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";

<DetailSection title="基本情報">
  <div className="grid gap-4 sm:grid-cols-2">
    <DetailField label="名前" value={customer.name} />
    <DetailField label="メール" value={customer.email} />
  </div>
</DetailSection>;
```

### 禁止パターン（詳細・編集ページ）

```tsx
// NG: 詳細コンポーネント内にヘッダー・バックボタン
'use client'
export function CustomerDetail({ customer }) {
  return (
    <>
      <div className="flex items-center gap-4">  {/* ← 禁止 */}
        <Button asChild>...</Button>              {/* ← 禁止 */}
        <h1>顧客詳細</h1>
      </div>
      ...
    </>
  )
}

// OK: page.tsx に AdminDetailLayout、詳細コンポーネントはコンテンツのみ
export default async function CustomerDetailPage({ params }) {
  await connection()  // 1回のみ
  ...
  return (
    <AdminDetailLayout backHref="/admin/customers" title={customer.name} actions={<EditButton />}>
      <CustomerDetail customer={customer} />
      <DangerZone ... />
    </AdminDetailLayout>
  )
}
```

````

**Step 2: 禁止事項リストに追記**

「## 禁止事項」セクションに以下を追加:

```markdown
7. **詳細ページのヘッダー直書き禁止** — `AdminDetailLayout` を使用
8. **削除ボタンのヘッダー内配置禁止** — `DangerZone`（ページ最下部）のみ
9. **`await connection()` の複数回呼び出し禁止** — ページコンポーネントで1回のみ
````

**Step 3: 最終検証**

```bash
bun run validate
```

期待: type-check ✅ + lint ✅ 両方通過

```bash
bun run build
```

期待: ビルド成功（エラーなし）

**Step 4: README.md の更新**

`docs/plans/README.md` を開いて「進行中・保留」セクションか最上部に以下を追記:

```markdown
### 2026-02-19 - 管理画面詳細・編集ページ完全刷新 ✅

AdminDetailLayout / DetailSection / DetailField / DangerZone を導入し、
全詳細・編集ページに統一ヘッダー + Server Component + shadcn/ui Form パターンを適用。

- [x] AdminDetailLayout, DetailSection, DetailField, DangerZone 共有コンポーネント作成
- [x] 詳細ページ7件 (reservations, customers, inquiries, locations, spaces, coupons, staff)
- [x] 編集ページ4件 (customers, reservations, locations, staff)
- [x] await connection() 重複バグ修正 (customers, locations, reservations, spaces, coupons)
- [x] admin-ui-patterns.md 更新
- [x] bun run validate && bun run build 全通過
```

**Step 5: 最終コミット**

```bash
git add .claude/rules/frontend/admin-ui-patterns.md docs/plans/README.md
git commit -m "docs(admin): update admin-ui-patterns with detail/edit page standards"
```

---

## 実装完了チェックリスト

全タスク完了後に確認:

- [ ] `AdminDetailLayout.tsx` — 全詳細・編集ページで使用されている
- [ ] `DangerZone.tsx` — 削除ボタンがすべて最下部にある
- [ ] `DetailSection.tsx` / `DetailField.tsx` — 静的情報表示に使用されている
- [ ] `await connection()` — 全ページで1回のみ呼ばれている
- [ ] `'use client'` が不要なコンポーネントから削除されている
- [ ] フォームエラーが `<FormMessage />` のみで表示されている
- [ ] `bun run validate` — ✅ 通過
- [ ] `bun run build` — ✅ 通過

---

## 注意事項（実装者へ）

### Server Action の探し方

各ページの `getXxxById` / `deleteXxx` 等の Server Action は `_shared/actions/` ディレクトリを確認:

```bash
ls src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/
```

### フォームスキーマの確認

各フォームの `defaultValues` は `_shared/lib/validations/` のスキーマに合わせる:

```bash
ls src/app/'(admin)'/admin/'(dashboard)'/_shared/lib/validations/
```

### `'use client'` の判断基準

- `useState`, `useEffect`, `useTransition`, `useRouter` を使う → `'use client'` が必要
- 純粋な表示のみ（props を受けて JSX を返すだけ）→ `'use client'` 不要、Server Component にできる

### インポートパスの注意

```typescript
// OK: Card, Button, Input 等は admin コンポーネントから
import { Card } from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";

// OK: ActionResult は admin 専用から
import type { ActionResult } from "@/admin/types/server-actions";

// NG: shared から直接 import（管理画面内では禁止）
import type { ActionResult } from "@/shared/types/server-actions";
```
