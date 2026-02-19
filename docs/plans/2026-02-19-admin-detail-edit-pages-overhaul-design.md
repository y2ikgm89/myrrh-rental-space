# 管理画面 詳細・編集ページ 完全刷新 設計書

> **承認済み**: 2026-02-19

## 目標

管理画面の詳細ページ・編集ページ（約20ページ）の一貫性を統一する。
Server + Client Islands アーキテクチャ、shadcn/ui Form コンポーネント、
4つの新規共有コンポーネントを導入し、後方互換性のないクリーンな実装に刷新する。

---

## アーキテクチャ

### 詳細ページ: Server Component + Client Islands

```
page.tsx (Server Component)
├── AdminDetailLayout (Server Component) — ヘッダー統一
│   ├── DetailSection (Server Component) × N — 静的情報
│   │   └── DetailField (Server Component) × N — ラベル+値
│   ├── *StatusCard (Client Component) — インタラクティブ部分のみ
│   └── DangerZone (Client Component) — 削除操作
```

### 編集ページ: Server Component + Client Form Islands

```
page.tsx (Server Component) — データ取得
└── AdminDetailLayout (Server Component) — ヘッダー統一
    └── *EditForm (Client Component)
        └── shadcn/ui Form + FormField + zodResolver
```

---

## 新規共有コンポーネント

配置: `src/app/(admin)/admin/(dashboard)/_shared/components/`

### AdminDetailLayout（Server Component）

```tsx
type AdminDetailLayoutProps = {
  backHref: string;
  backLabel?: string; // デフォルト: '一覧に戻る'
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};
```

- ヘッダー構造: `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`
- タイトル: `text-2xl font-bold tracking-tight text-foreground`
- バックボタン: 左側固定（`<Button variant="ghost" size="sm" asChild>`）
- アクションボタン: `actions` prop で右側に配置

### DetailSection（Server Component）

```tsx
type DetailSectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};
```

- `<Card>` + `<CardHeader>` + `<CardContent>` のラッパー

### DetailField（Server Component）

```tsx
type DetailFieldProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
};
```

- `<dt className="text-sm font-medium text-muted-foreground">` + `<dd>`
- `value` が falsy な場合は `—` を表示

### DangerZone（Client Component）

```tsx
type DangerZoneProps = {
  deleteLabel: string;
  itemName?: string;
  onDelete: () => Promise<ActionResult>;
  redirectTo: string;
};
```

- 必ず **ページ最下部** に配置
- `DeleteConfirmDialog` を内包
- `'use client'` — 削除後 `router.push(redirectTo)`

---

## 統一ルール

| ルール         | 正しいパターン                                      | 禁止パターン                                    |
| -------------- | --------------------------------------------------- | ----------------------------------------------- |
| バックボタン   | `AdminDetailLayout backHref` — 左上固定             | 詳細コンポーネント内に配置                      |
| 編集ボタン     | `AdminDetailLayout actions` — ヘッダー右            | 詳細コンポーネント内に配置                      |
| 削除ボタン     | `DangerZone` — ページ最下部                         | ヘッダー・CardHeader 内                         |
| `connection()` | ページコンポーネントで1回のみ                       | 複数回呼び出し                                  |
| タイトル CSS   | `text-2xl font-bold tracking-tight text-foreground` | `tracking-tight` / `text-foreground` 省略       |
| フォームエラー | `<FormMessage />` のみ                              | 手動 `<p className="text-xs text-destructive">` |

---

## 対象ページ（約20ページ）

### 詳細ページ（Server Component 化 + AdminDetailLayout 適用）

| ページ                       | 現状の問題                                                        |
| ---------------------------- | ----------------------------------------------------------------- |
| `reservations/[id]/page.tsx` | `connection()` 2回、ヘッダーに削除なし                            |
| `customers/[id]/page.tsx`    | `connection()` 2回、ヘッダー + バックボタンが詳細コンポーネント内 |
| `inquiries/[id]/page.tsx`    | 削除ボタンがヘッダー内（DangerZone へ移動要）                     |
| `locations/[id]/page.tsx`    | ヘッダー・バックボタンが**ない**                                  |
| `spaces/[id]/page.tsx`       | `connection()` 2回                                                |
| `coupons/[id]/page.tsx`      | 統一ルール未適用                                                  |
| `faq/[id]/page.tsx`          | 統一ルール未適用                                                  |
| `staff/[id]/page.tsx`        | 統一ルール未適用                                                  |
| `media/[id]/page.tsx`        | 統一ルール未適用                                                  |

### 編集ページ（shadcn/ui Form 化 + AdminDetailLayout 適用）

| ページ                            | 現状の問題                                |
| --------------------------------- | ----------------------------------------- |
| `customers/[id]/edit/page.tsx`    | `connection()` 2回、raw register パターン |
| `reservations/[id]/edit/page.tsx` | raw register パターン                     |
| `locations/[id]/edit/page.tsx`    | raw register パターン                     |
| `coupons/[id]/edit/page.tsx`      | raw register パターン                     |
| `faq/[id]/edit/page.tsx`          | raw register パターン                     |
| `staff/[id]/edit/page.tsx`        | バックボタン右側（ヘッダーが逆）          |
| `media/[id]/edit/page.tsx`        | raw register パターン                     |

### 除外ページ（特殊エディタのため現状維持）

| ページ                                  | 理由                                |
| --------------------------------------- | ----------------------------------- |
| `news/[id]/page.tsx` + `edit/page.tsx`  | Lexical エディタ                    |
| `posts/[id]/page.tsx` + `edit/page.tsx` | Lexical エディタ                    |
| `spaces/[id]/edit/page.tsx`             | SpaceInlineEditor（多タブエディタ） |
| `pages/[slug]/edit/page.tsx`            | SectionMasterDetail エディタ        |

---

## 実装パターン例

### 詳細ページ

```tsx
// reservations/[id]/page.tsx (Server Component)
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DangerZone } from "@/admin/components/DangerZone";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const reservation = await getReservationById(id);
  if (!reservation) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`予約 #${reservation.id.slice(0, 8)}`}
      subtitle={`${reservation.space.name} — ${reservation.customer.lastName} ${reservation.customer.firstName}`}
      actions={
        <Button asChild>
          <Link href={`/admin/reservations/${id}/edit`}>編集</Link>
        </Button>
      }
    >
      <DetailSection title="予約情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース" value={reservation.space.name} />
          <DetailField
            label="ステータス"
            value={<StatusBadge status={reservation.status} />}
          />
        </div>
      </DetailSection>
      <DangerZone
        deleteLabel="予約を削除"
        itemName={`予約 #${reservation.id.slice(0, 8)}`}
        onDelete={() => deleteReservation(id)}
        redirectTo="/admin/reservations"
      />
    </AdminDetailLayout>
  );
}
```

### 編集ページ

```tsx
// customers/[id]/edit/page.tsx (Server Component)
export default async function CustomerEditPage({ params }) {
  await connection()  // 1回のみ
  const { id } = await params
  const customer = await getCustomerById(id)
  if (!customer) notFound()

  return (
    <AdminDetailLayout
      backHref={`/admin/customers/${id}`}
      title="顧客情報を編集"
      subtitle={`${customer.lastName} ${customer.firstName}`}
    >
      <CustomerEditForm customer={customer} />
    </AdminDetailLayout>
  )
}

// customers/_components/CustomerEditForm.tsx ('use client')
export function CustomerEditForm({ customer }: { customer: CustomerData }) {
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { ... },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>メールアドレス <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={`/admin/customers/${customer.id}`}>キャンセル</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? '保存中...' : '変更を保存'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
```
