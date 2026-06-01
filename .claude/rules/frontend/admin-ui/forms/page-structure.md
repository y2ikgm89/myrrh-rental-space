---
description: 管理画面の詳細・編集・新規作成ページの標準構造（AdminDetailLayout / 配置ルール / connection() / 共有コンポーネント）
paths:
  - src/app/(admin)/**/[id]/page.tsx
  - src/app/(admin)/**/edit/page.tsx
  - src/app/(admin)/**/new/page.tsx
  - src/app/(admin)/**/_shared/components/AdminDetailLayout.tsx
  - src/app/(admin)/**/_shared/components/Detail*.tsx
---

# 詳細・編集・新規作成ページ標準構造

> `AdminDetailLayout` ヘッダー統一 + 配置ルール + connection() + 共有コンポーネント。

## 詳細ページ（Server Component + AdminDetailLayout）

詳細ページは `AdminDetailLayout` を使ってヘッダーを統一する:

```tsx
// reservations/[id]/page.tsx (Server Component)
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";

export default async function ReservationDetailPage({ params }) {
  const { id } = await params;
  const reservation = await getReservationById(id);
  if (!reservation) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`予約 #${reservation.id.slice(0, 8)}`}
      subtitle={`${reservation.space.name} — ${reservation.customer.name}`}
      actions={
        <>
          <DetailDeleteButton
            itemName={`予約 #${reservation.id.slice(0, 8)}`}
            onDelete={deleteReservation.bind(null, id)}
            redirectTo="/admin/reservations"
            successMessage="予約を削除しました"
          />
          <Button asChild size="sm">
            <Link href={`/admin/reservations/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <DetailSection title="予約情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース" value={reservation.space.name} />
        </div>
      </DetailSection>
    </AdminDetailLayout>
  );
}
```

## DetailDeleteButton の onDelete は `.bind(null, id)`

Server Component から `'use client'` の `DetailDeleteButton` へ `onDelete` を渡す際、通常のアロー関数クロージャ `() => deleteAction(id)` は RSC 境界を越えられない（シリアライズ不可）。Server Action を `.bind()` することで RSC 境界を越えられるバインド済み Server Action を生成する:

```tsx
// NG: 通常クロージャは RSC 境界を越えられない
onDelete={() => deleteReservation(id)}

// OK: .bind(null, id) でバインド済み Server Action を生成
onDelete={deleteReservation.bind(null, id)}
```

## 配置ルール

| 要素         | 配置場所                                            | 禁止場所              |
| ------------ | --------------------------------------------------- | --------------------- |
| バックボタン | `AdminDetailLayout backHref` — 左上                 | 詳細コンポーネント内  |
| 削除ボタン   | `AdminDetailLayout actions` — 編集ボタンの**左**    | ページ最下部カード    |
| 編集ボタン   | `AdminDetailLayout actions` — 最右                  | 詳細コンポーネント内  |
| タイトル CSS | `text-2xl font-bold tracking-tight text-foreground` | `tracking-tight` 省略 |

## 新規作成ページ

新規作成ページも `AdminDetailLayout` でヘッダーを統一する（`locations/new` がテンプレート）:

```tsx
// locations/new/page.tsx (Server Component)
export default async function NewLocationPage() {
  return (
    <AdminDetailLayout
      backHref="/admin/locations"
      title="新規ロケーション作成"
      subtitle="新しいロケーションを登録します"
    >
      <LocationForm />
    </AdminDetailLayout>
  );
}
```

## backLabel ルール（ページ種別ごとに固定）

| ページ種別     | `backHref`             | `backLabel`（省略可否） | 表示テキスト   |
| -------------- | ---------------------- | ----------------------- | -------------- |
| 詳細・新規作成 | `/admin/<resource>`    | 省略可（デフォルト）    | 「一覧に戻る」 |
| 編集           | `/admin/<resource>/id` | `"詳細に戻る"` 必須     | 「詳細に戻る」 |

## 編集ページ

編集ページも `AdminDetailLayout` でヘッダーを統一する:

```tsx
// customers/[id]/edit/page.tsx (Server Component)
export default async function CustomerEditPage({ params }) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/customers/${id}`}
      backLabel="詳細に戻る"
      title="顧客情報を編集"
      subtitle={`${customer.lastName} ${customer.firstName}`}
    >
      <CustomerEditForm customer={customer} />
    </AdminDetailLayout>
  );
}
```

## 管理画面 Suspense 内の async Server Component には `connection()` を配置

PPR 環境では Suspense 境界ごとに動的判定される。layout の `headers()` 呼び出しは子の Suspense 境界に伝播しない。`new Date()` や uncached データを使う async Server Component には `await connection()` を先頭に配置する（[公式推奨](https://nextjs.org/docs/app/api-reference/functions/connection)）。

```tsx
// OK: Suspense 内の async Server Component に connection()
import { connection } from "next/server";

export async function DashboardStatsSection() {
  await connection();
  const stats = await getDashboardStats(); // 内部で new Date() を使用
  return <StatsCards stats={stats} />;
}

// OK: UI のみの new Date() は Client Component にする
("use client");
export function DashboardHeader() {
  const today = new Date();
  // ...
}

// 不要: page.tsx 本体（Suspense の外）には connection() 不要
export default async function AdminPage() {
  const { id } = await params;
  // ...
}
```

## 共有コンポーネント一覧

| コンポーネント       | パス                                    | 用途                                |
| -------------------- | --------------------------------------- | ----------------------------------- |
| `AdminDetailLayout`  | `@/admin/components/AdminDetailLayout`  | 詳細・編集ページ統一ヘッダー        |
| `DetailSection`      | `@/admin/components/DetailSection`      | Card ラッパー（セクション区切り）   |
| `DetailField`        | `@/admin/components/DetailField`        | ラベル + 値の行（dt/dd）            |
| `DetailDeleteButton` | `@/admin/components/DetailDeleteButton` | ヘッダー削除ボタン + ダイアログ確認 |
