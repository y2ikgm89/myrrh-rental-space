---
paths:
  - src/app/(admin)/**
---

# 管理画面 UI パターンルール

> Swiss Industrial Admin テーマ / 一貫性のある管理 UI を実現するためのパターン集

## ページヘッダー標準構造

管理画面の各ページヘッダーは以下の構造を使用する:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">
      ページタイトル
    </h1>
    <p className="text-muted-foreground">説明テキスト</p>
  </div>
  <div className="flex items-center gap-2">{/* アクションボタン */}</div>
</div>
```

**禁止パターン**:

```tsx
// NG: justify-between のみ（モバイル対応なし）
<div className="flex items-center justify-between">

// NG: ハードコードスペーシング
<div className="flex items-center gap-4 justify-between">
```

## セマンティックカラートークン（admin専用）

管理画面でのみ使用できる追加トークン:

| 用途                       | 正しいクラス                 | 禁止クラス                              |
| -------------------------- | ---------------------------- | --------------------------------------- |
| モーダル背景オーバーレイ   | `bg-overlay`                 | `bg-black/60`, `bg-black/50`            |
| サイドバーナビホバー背景   | `hover:bg-sidebar-nav-hover` | `hover:bg-white/5`, `hover:bg-gray-700` |
| サイドバー背景             | `bg-sidebar-bg`              | `bg-gray-900`, `bg-slate-900`           |
| サイドバーボーダー         | `border-sidebar-border`      | `border-gray-700`, `border-slate-700`   |
| サイドバーテキスト         | `text-sidebar-text`          | `text-white`, `text-gray-100`           |
| サイドバーミュートテキスト | `text-sidebar-text-muted`    | `text-gray-400`, `text-slate-400`       |

## ページネーションコンポーネント

ページネーションは必ず `<nav>` 要素にアクセシビリティ属性を付与する:

```tsx
// OK: アクセシブルなページネーション
<nav aria-label="ページネーション" className="flex items-center gap-2">
  <button
    onClick={() => void setPage(page - 1)}  // void で Promise を明示
    disabled={page <= 1}
  >
    前へ
  </button>
</nav>

// NG: bare div + Promise 放置
<div className="flex items-center gap-2">
  <button onClick={() => setPage(page - 1)}>前へ</button>  // setPage は Promise を返す
</div>
```

**`void` キーワードの必要性**:

`nuqs` の `setPage()` / `setParams()` は `Promise<void>` を返す。
`onClick` ハンドラ内で `void` をつけずに呼ぶと `no-floating-promises` lint エラー。

```tsx
// NG: lint エラー（floating promise）
onClick={() => setPage(page + 1)}

// OK
onClick={() => void setPage(page + 1)}
```

## サイドバーモバイルオーバーレイ

サイドバーのモバイルオーバーレイは専用トークンを使用:

```tsx
// OK
<div
  className="fixed inset-0 z-30 bg-overlay lg:hidden"
  onClick={closeSidebar}
/>

// NG: 直接アルファ値を指定
<div className="fixed inset-0 z-30 bg-black/60 lg:hidden" />
```

## Server Actions の型インポート

管理画面内の**全ファイル**（Server Actions・`'use client'` コンポーネント・hooks・型定義ファイルを問わず）は `@/admin/types/server-actions` から import する:

```typescript
// OK: 管理画面専用（Server Actions・'use client' コンポーネント・hooks すべて共通）
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";

// NG: 共有型を直接 import（管理画面内では禁止）
import { createSuccess, createFailure } from "@/shared/types/server-actions";
```

`@/admin/types/server-actions` は `@/shared/types/server-actions` の re-export に加え、`AuditUser` 型も提供する。

**例外**: `src/app/(admin)/admin/(dashboard)/_shared/types/server-actions.ts` バレルファイル自体（このファイルのみ `@/shared` から import する）。

## ActionResult での withPermission パターン

管理画面の書き込み系 Server Actions は必ず `withPermission` HOF を使用:

```typescript
// OK
export const createItem = withPermission<[ItemInput], { id: string }>(
  "item",
  "create",
)(async (_user, input) => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);
  // ...
  return createSuccess("作成しました", { id: item.id });
});

// NG: 直接 checkPermission を使う（withPermission が使える場面では禁止）
export async function createItem(input: ItemInput): Promise<ActionResult> {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

## 読み取り系 Actions の権限チェック

- 認証のみ必要（権限ログ不要）: `checkReadPermissionFor()` または `verifyAdminSession()` + プレーン return
- 読み取り + 監査不要: `withPermission(..., { audit: false })`

```typescript
// 単純な読み取り（plain return型）
const checkReadPermission = checkReadPermissionFor("media");

export async function getMediaList(): Promise<MediaData[]> {
  const permError = await checkReadPermission();
  if (permError) return [];
  // ...
}

// ActionResult を返す読み取り（audit: false）
export const getCommentThreads = withPermission<[Query], Thread[]>(
  "post",
  "read",
  { audit: false },
)(async (_user, query) => {
  // ...
  return createSuccess("取得しました", threads);
});
```

## テーブル操作列 ActionDropdown パターン

管理画面の全テーブル操作列は `ActionDropdown`（`[⋮]`アイコン）に統一する。

### 基本パターン（`*ActionCell` コンポーネント）

各テーブルに専用の `*ActionCell` コンポーネントを作成する:

```tsx
// 配置例: reservations/_components/ReservationActionCell.tsx
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

export function ReservationActionCell({ id }: { id: string }) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/reservations/${id}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/reservations/${id}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

### 外部リンク（`target="_blank"`）

`ActionDropdownItem` は Next.js `<Link>` を使うため `target="_blank"` が使えない。`window.open()` で対処:

```tsx
// NG: href に外部URL（target="_blank" 不可）
<ActionDropdownItem href={externalUrl}>外部リンク</ActionDropdownItem>

// OK: window.open() で新タブ
<ActionDropdownItem onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
  外部リンク
</ActionDropdownItem>
```

### Dialog 起動型アクションセル

ダイアログを開くアクションは `*ActionCell` コンポーネント内で `useState` を管理する:

```tsx
"use client";
import { useState } from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";

export function CategoryActionCell({ id, name }: { id: string; name: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem onClick={() => setEditOpen(true)}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <EditDialog open={editOpen} onOpenChange={setEditOpen} id={id} />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={name}
        onConfirm={async () => {
          await deleteItem(id);
        }}
      />
    </>
  );
}
```

### インライン制御との共存

`PublishSwitch`・`StatusSelect` 等のインラインコントロールは ActionDropdown と**共存**させる（吸収しない）:

```tsx
// OK: インライン制御 + ActionDropdown 共存
<div className="flex items-center gap-2">
  <PublishSwitch id={id} isPublished={isPublished} />
  <SpaceActionCell id={id} />
</div>
```

### 禁止パターン

```tsx
// NG: テーブル操作列への Button+Link 直書き
<Button asChild size="sm" variant="outline">
  <Link href={`/admin/items/${id}/edit`}>編集</Link>
</Button>

// OK: ActionDropdown 統一（*ActionCell 経由）
<ItemActionCell id={id} />
```

## 詳細・編集・新規作成ページ標準構造

### 詳細ページ（Server Component + AdminDetailLayout）

詳細ページは `AdminDetailLayout` を使ってヘッダーを統一する:

```tsx
// reservations/[id]/page.tsx (Server Component)
import { connection } from "next/server";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DangerZone } from "@/admin/components/DangerZone";

export default async function ReservationDetailPage({ params }) {
  await connection(); // PPR opt-in — ページ関数で1回のみ
  const { id } = await params;
  const reservation = await getReservationById(id);
  if (!reservation) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`予約 #${reservation.id.slice(0, 8)}`}
      subtitle={`${reservation.space.name} — ${reservation.customer.name}`}
      actions={
        <Button asChild>
          <Link href={`/admin/reservations/${id}/edit`}>編集</Link>
        </Button>
      }
    >
      <DetailSection title="予約情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース" value={reservation.space.name} />
        </div>
      </DetailSection>
      <DangerZone
        deleteLabel="予約を削除"
        itemName={`予約 #${reservation.id.slice(0, 8)}`}
        onDelete={deleteReservation.bind(null, id)}
        redirectTo="/admin/reservations"
      />
    </AdminDetailLayout>
  );
}
```

**`DangerZone` の `onDelete` は `.bind(null, id)` で渡す**:

Server Component から `'use client'` の `DangerZone` へ `onDelete` を渡す際、
通常のアロー関数クロージャ `() => deleteAction(id)` は RSC 境界を越えられない（シリアライズ不可）。
Server Action を `.bind()` することで RSC 境界を越えられるバインド済み Server Action を生成する:

```tsx
// NG: 通常クロージャは RSC 境界を越えられない
onDelete={() => deleteReservation(id)}

// OK: .bind(null, id) でバインド済み Server Action を生成
onDelete={deleteReservation.bind(null, id)}
```

**配置ルール**:

| 要素         | 配置場所                                            | 禁止場所                |
| ------------ | --------------------------------------------------- | ----------------------- |
| バックボタン | `AdminDetailLayout backHref` — 左上                 | 詳細コンポーネント内    |
| 編集ボタン   | `AdminDetailLayout actions` — 右                    | 詳細コンポーネント内    |
| 削除ボタン   | `DangerZone` — **ページ最下部のみ**                 | ヘッダー・CardHeader 内 |
| タイトル CSS | `text-2xl font-bold tracking-tight text-foreground` | `tracking-tight` 省略   |

### 新規作成ページ（Server Component + AdminDetailLayout）

新規作成ページも `AdminDetailLayout` でヘッダーを統一する（`locations/new` がテンプレート）:

```tsx
// locations/new/page.tsx (Server Component)
export default async function NewLocationPage() {
  await connection(); // PPR opt-in — ページ関数で1回のみ

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

**`backLabel` ルール**（ページ種別ごとに固定）:

| ページ種別     | `backHref`             | `backLabel`（省略可否） | 表示テキスト   |
| -------------- | ---------------------- | ----------------------- | -------------- |
| 詳細・新規作成 | `/admin/<resource>`    | 省略可（デフォルト）    | 「一覧に戻る」 |
| 編集           | `/admin/<resource>/id` | `"詳細に戻る"` 必須     | 「詳細に戻る」 |

### 編集ページ（Server Component + AdminDetailLayout）

編集ページも `AdminDetailLayout` でヘッダーを統一する:

```tsx
// customers/[id]/edit/page.tsx (Server Component)
export default async function CustomerEditPage({ params }) {
  await connection(); // PPR opt-in — ページ関数で1回のみ
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

**`connection()` の使い方**:

`connection()` は PPR 動的 opt-in のため、export されるコンポーネント関数（`page.tsx` / `generateMetadata`）で各1回のみ呼ぶ。同一関数内での複数呼び出しは禁止:

```tsx
// NG: 同一関数内で2回以上
export default async function Page({ params }) {
  await connection();
  const { id } = await params;
  await connection(); // NG: 重複
  ...
}

// OK: generateMetadata + page 関数でそれぞれ1回（別の RSC エントリーポイント）
export async function generateMetadata({ params }) {
  await connection();
  ...
}
export default async function Page({ params }) {
  await connection(); // OK: 別の async 関数
  ...
}
```

### 共有コンポーネント一覧

| コンポーネント      | パス                                   | 用途                              |
| ------------------- | -------------------------------------- | --------------------------------- |
| `AdminDetailLayout` | `@/admin/components/AdminDetailLayout` | 詳細・編集ページ統一ヘッダー      |
| `DetailSection`     | `@/admin/components/DetailSection`     | Card ラッパー（セクション区切り） |
| `DetailField`       | `@/admin/components/DetailField`       | ラベル + 値の行（dt/dd）          |
| `DangerZone`        | `@/admin/components/DangerZone`        | 削除確認 + 実行（ページ最下部）   |

## フォームページ（新規作成・編集） 2カラムレイアウト

管理画面フォームは **左1枚（主要情報まとめ）+ 右複数カード** の2カラム構成に統一する:

```tsx
<form className="space-y-6">
  <div className="grid gap-6 lg:grid-cols-2">
    {/* 左: スペース・日時・料金等を1枚のカードにまとめる */}
    <Card>
      <CardHeader>
        <CardTitle>予約情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{/* ... */}</CardContent>
    </Card>
    {/* 右: 複数カードに分割してよい */}
    <div className="space-y-6">
      <Card>{/* 顧客情報 */}</Card>
      <Card>{/* 追加設定 */}</Card>
    </div>
  </div>
  <div className="flex justify-end gap-4">{/* キャンセル・送信ボタン */}</div>
</form>
```

**禁止**: 左カラムに小さなカードを複数並べること（「スペース選択」「日時選択」「料金」に分割等）→ 余白が目立ちUX低下

### 編集フォームでの参照エンティティ表示（読み取り専用）

変更不可な外部エンティティ（例: 予約の顧客）は `CustomerSelector` 等のインタラクティブUIではなく、hidden input + アイコン表示を使う:

```tsx
{/* RHF の値を保持しつつ表示は読み取り専用 */}
<input type="hidden" {...register("customerId")} />
<div className="space-y-3">
  <div className="flex items-center gap-2">
    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
    <Link href={`/admin/customers/${entity.id}`} className="font-medium hover:underline">
      {entity.lastName} {entity.firstName}
    </Link>
  </div>
  <div className="flex items-center gap-2">
    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
    <span className="text-sm text-muted-foreground">{entity.email}</span>
  </div>
  {entity.phoneNumber && (
    <div className="flex items-center gap-2">
      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{entity.phoneNumber}</span>
    </div>
  )}
</div>
```

## 禁止事項

1. **型 re-export の追加禁止** — 共有型のローカル aliases は不要（`export type Foo = SharedFoo`）
2. **ハードコードカラー禁止** — `bg-black/60` → `bg-overlay`、`hover:bg-white/5` → `hover:bg-sidebar-nav-hover`
3. **bare div ページネーション禁止** — `<nav aria-label="...">` を使用
4. **setPage/setParams の void なし呼び出し禁止** — `void setPage(n)`
5. **`@/shared/types/server-actions` を管理画面で直接使用禁止** — `@/admin/types/server-actions` 経由
6. **テーブル操作列インライン Button+Link 禁止** — `ActionDropdown` の `*ActionCell` コンポーネントを使用（`@/admin/components/ActionDropdown`）
7. **削除ボタンをヘッダー・CardHeader 内に配置禁止** — `DangerZone` コンポーネントをページ最下部に配置
8. **詳細・編集ページのバックボタンを詳細コンポーネント内に配置禁止** — `AdminDetailLayout backHref` で左上固定
9. **`connection()` を同一 async 関数内で複数回呼び出し禁止** — PPR opt-in は各 RSC エントリーポイントで1回のみ
10. **新規作成ページで手動ヘッダー実装禁止** — `new/page.tsx` も `AdminDetailLayout` を使用（`locations/new` がテンプレート。`Link`+`ArrowLeft`+`Button` の手動実装禁止）
11. **`backLabel` にエンティティ名を含めること禁止** — `"クーポン一覧に戻る"` NG → `"一覧に戻る"`（デフォルト）/ `"詳細に戻る"` のみ使用
12. **バックナビゲーションに `ChevronLeft` 禁止** — `ArrowLeft` は `AdminDetailLayout` 内部で自動提供。手動実装が必要な場合も `ArrowLeft` のみ
