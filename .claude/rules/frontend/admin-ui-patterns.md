---
paths:
  - src/app/(admin)/**
---

# 管理画面 UI パターンルール

> Swiss Industrial Admin テーマ / 一貫性のある管理 UI を実現するためのパターン集

## タブUI パターン（管理画面 CRUD）

タブ付き CRUD は **用途で (A) / (B) を選ぶ**。アクションボタンは従来どおり **タブリスト右端**（タブがコンテキストを持つため、ページヘッダー単独に置かない）。

### (A) 重いクライアント状態をタブ間で保持したい

Lexical や複雑なフォーム状態を **非表示タブでもマウントしたまま** にしたい場合。

| 設定                     | 値         | 理由                                               |
| ------------------------ | ---------- | -------------------------------------------------- |
| `shallow`                | `true`     | タブ切り替えで RSC を再実行しない（即時切り替え）  |
| `TabsContent forceMount` | `true`     | 非アクティブタブを DOM 保持（再マウント防止）      |
| コンテンツレンダリング   | 全タブ常時 | 初回で一括取得、以降は同一マウント内で切り替えのみ |

```tsx
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(TAB_VALUES)
    .withDefault("posts")
    .withOptions({ history: "push", shallow: true }),
);

<TabsContent value="posts" forceMount className="data-[state=inactive]:hidden">
  {postsContent}
</TabsContent>;
```

### (B) 各タブが Server Components の一覧のみ（データ取得を抑えたい）

タブごとの中身が **軽量な RSC（テーブル・フィルタ）** だけのときは、**アクティブタブの RSC だけ** を描画する。親ページで `createSearchParamsCache` を `parse` し、`tab` で分岐する。タブ切替は **`Link`（または `shallow: false` の URL 更新）** で `searchParams` を変え、Next.js が RSC を再実行する。

**参照実装**: `src/app/(admin)/admin/(dashboard)/spaces/page.tsx` と `spaces/_components/SpaceManagementTabs.tsx`。ハブの `tab`（`ADMIN_SPACE_MANAGEMENT_TABS`）に加え、一覧状態はタブ別プレフィックスで分離する: スペース一覧 `spSearch` / `spStatus` / `spPage` / `spSortBy` / `spSortOrder` / `spLocationId` / `spCategoryId`、場所 `locSearch` / `locPublished` / `locPage`、カテゴリ `catSearch` / `catIncludeInactive` / `catPage`（`adminSpaceSearchParamsCache`）。スペース編集フォームのタブ URL はハブと衝突しないよう `section` クエリを使用する。

| 設定           | 値                                     | 理由                                               |
| -------------- | -------------------------------------- | -------------------------------------------------- |
| サーバー       | `parse` 後に `tab` で条件付き 1 パネル | 非表示タブの `getLocations` 等を初回から走らせない |
| タブナビ       | `Link` + 名前空間付きクエリの preserve | タブ切替で他タブのフィルタが汚染されない           |
| 子のデータ読み | `searchParamsCache.all()` / `get`      | 親で `parse` 済みなら子で二重 `parse` を避ける     |

**(A) と (B) の選び方**: タブ内に Lexical・大きなクライアント状態・「戻ったときに入力を残したい」要件がある → **(A)**。タブが一覧＋フィルタのみで、初回・タブ切替の DB 負荷を抑えたい → **(B)**。

---

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

## サイドバーアクティブ判定（query-bearing href 対応）

サイドバー項目が `/admin/spaces?tab=reviews` のようなクエリ付き URL を href に使う場合、`pathname === href` 比較では `usePathname()` がクエリを返さないためマッチしない。`useSearchParams()` と併用して query key も比較する必要がある。

同じパスを共有する複数項目（例: 「スペース管理」`/admin/spaces` と「レビュー」`/admin/spaces?tab=reviews`）を正しくハイライト切り替えするためのパターン:

```tsx
"use client";
import { usePathname, useSearchParams } from "next/navigation";

// 純粋関数としてコンポーネント外に定義（レンダー毎に再生成しない）
function isSidebarItemActive(
  itemHref: string,
  pathname: string,
  currentParams: URLSearchParams,
): boolean {
  const [itemPath, itemQuery = ""] = itemHref.split("?");
  if (itemPath === undefined) return false;

  const pathMatches =
    pathname === itemPath ||
    (itemPath !== "/admin" && pathname.startsWith(`${itemPath}/`));
  if (!pathMatches) return false;

  // 裸のパス項目は `tab` パラメータがない時のみアクティブ
  // （「スペース管理」が `?tab=reviews` 訪問時にハイライトされるのを防ぐ）
  if (!itemQuery) return !currentParams.has("tab");

  // クエリ付き項目は全キーが一致した時のみアクティブ
  const itemQueryParams = new URLSearchParams(itemQuery);
  for (const [key, value] of itemQueryParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

// コンポーネント内で使用
const pathname = usePathname();
const searchParams = useSearchParams();
// ...
const isActive = isSidebarItemActive(item.href, pathname, searchParams);
```

**禁止パターン:**

```tsx
// NG: path のみの比較。query-bearing href が 1 つでもあると active ハイライトが誤作動する
const isActive =
  pathname === item.href ||
  (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
```

**ルール:**

- サイドバーに query-bearing href を 1 つでも追加したら、即座にこのパターンへ移行する
- 裸のパス項目は `!searchParams.has("tab")` でガード（タブが active でない時のみハイライト）
- query 比較は全キー一致で判定（partial match 禁止）
- `isSidebarItemActive` はコンポーネント外のモジュールレベル純粋関数として定義

参照実装: `src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx`

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

## Server Actions の認証パターン

管理画面の書き込み系 Server Actions は `executeAdminMutationResult` を使用（認証・権限チェック・監査ログ・DomainError ハンドリングを一括処理）:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";

// OK: executeAdminMutationResult パターン
export async function createItem(
  input: ItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "item",
    action: "create",
    execute: async () => createItemCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ITEMS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

// NG: 直接 checkPermission（executeAdminMutationResult を使う）
export async function createItem(
  input: ItemInput,
): Promise<MutationResult<{ id: string }>> {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

詳細は `auth-patterns.md` を参照。

## フォーム送信ボタン（SubmitButton）

フォームの送信ボタンは `SubmitButton` コンポーネントに統一する。インラインの `isPending ? "X中..." : "X"` パターンは禁止:

```tsx
import { SubmitButton } from "@/admin/components/ui";

// OK: SubmitButton（Loader2 スピナー + disabled 自動管理）
<SubmitButton isPending={isPending} label="保存" />
<SubmitButton isPending={isPending} label="予約を作成" pendingLabel="作成中..." />
<SubmitButton isPending={isPending} label="削除" variant="destructive" pendingLabel="削除中..." />

// NG: インライン isPending パターン（禁止）
<Button type="submit" disabled={isPending}>
  {isPending ? "保存中..." : "保存"}
</Button>
```

**`pendingLabel` ルール**:

- 単純ラベル（「保存」「更新」「削除」「作成」）→ 省略可（デフォルト: `label + "中..."`）
- 複合ラベル（「予約を作成」「顧客情報を更新」）→ `pendingLabel` 明示指定（デフォルトだと「予約を作成中...」になる）

**適用対象外**（以下は SubmitButton に置換**しない**）:

- `DeleteConfirmDialog`（内部 isPending 管理）
- `onClick` ハンドラのボタン（`type="submit"` でないもの — Settings セクションの保存ボタン、EditorHeader 等）
- `disabled={isPending || !isDirty}` / `disabled={isPending || hasErrors}` / `disabled={!value || isPending}` 等の**複合条件ボタン**
- カスタムアイコン付きボタン（`Loader2` / `Save` 切替等）

## テーブルレスポンシブ対応パターン

管理画面の全テーブルは **2層ラッパー** + **カラム Progressive Disclosure** で実装する。

### 2層ラッパー（必須）

```tsx
// 外側: overflow-hidden で border-radius をクリップ
// 内側: overflow-x-auto で横スクロールを有効化
<div className="overflow-hidden rounded-lg border bg-card">
  <div className="overflow-x-auto">
    <Table>...</Table>
  </div>
</div>
```

**禁止**: `overflow-hidden` のみ（角丸はきれいだがスクロール不可）

### カラム Progressive Disclosure（必須）

重要度の低いカラムは `hidden md:table-cell` / `hidden lg:table-cell` で段階的に非表示にする。
ヘッダー行・仮想行（ホームページ行等）・全データ行に **対称的に適用** すること:

```tsx
<TableHeader>
  <TableRow>
    <TableHead>常時表示（必須情報）</TableHead>
    <TableHead className="hidden md:table-cell">md以上（補助情報）</TableHead>
    <TableHead className="hidden lg:table-cell">lg以上（詳細情報）</TableHead>
  </TableRow>
</TableHeader>
<TableBody>
  {items.map((item) => (
    <TableRow key={item.id}>
      <TableCell>...</TableCell>
      <TableCell className="hidden md:table-cell">...</TableCell>  {/* ヘッダーと一致 */}
      <TableCell className="hidden lg:table-cell">...</TableCell>  {/* ヘッダーと一致 */}
    </TableRow>
  ))}
</TableBody>
```

**標準優先度（プロジェクト基準）**:

| 常時表示                   | sm以上     | md以上               | lg以上               |
| -------------------------- | ---------- | -------------------- | -------------------- |
| ステータス・タイトル・操作 | スラッグ等 | 補助情報・料金・日時 | 詳細情報・住所・PV数 |

### Badge の折り返し防止

`@/admin/components/ui/badge` と `@/public/components/design-system/badge` の base に `whitespace-nowrap` が適用済み。呼び出し側でセル・親要素に `whitespace-nowrap` を重ねて付ける必要はない。

### TableHead の折り返し防止

`@/admin/components/ui/table` の `TableHead` base に `whitespace-nowrap` が適用済み。`tracking-wider uppercase` で幅が広がりやすい日本語ヘッダーラベル（「公開状態」「時間料金」「予約数」等）が2行折り返しになる問題を根本解決している。呼び出し側で `whitespace-nowrap` を重ね掛けする必要はない。

### カラム順序の標準パターン

管理画面の一覧テーブルは以下の論理順序で並べる（左→右）:

**識別 → 分類 → スペック → 実績 → 状態 → 操作**

| グループ | 例                                         |
| -------- | ------------------------------------------ |
| 識別     | 名前・タイトル・スラッグ（画像サムネ併記） |
| 分類     | カテゴリ・タイプ・所在地                   |
| スペック | 定員・料金・サイズ等の属性値               |
| 実績     | 予約数・PV数・閲覧数等の集計値             |
| 状態     | 公開/非公開スイッチ・ステータス Badge      |
| 操作     | `ActionDropdown`（常時右端固定）           |

ステータス Badge を**左端**に配置するパターン（予約・お問い合わせ等、状態が最重要なワークフロー系テーブル）は例外として許可。参照実装: `SpaceTableDesktop`（スペース管理）、`LocationTable`（場所管理）。

### インラインコントロールのモバイル非表示

複雑なインラインコントロール（Select・フォーム等）は小画面で折り畳む:

```tsx
<div className="flex items-center justify-end gap-2">
  <div className="hidden sm:block">
    <ReservationStatusSelect ... />  {/* sm未満では非表示 */}
  </div>
  <ReservationActionCell ... />  {/* 常時表示 */}
</div>
```

### 全テーブルファイル一括検索コマンド

```bash
grep -rl "overflow-hidden rounded-lg border bg-card" src/
```

---

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

## AdminDetailLayout vs InlineEditorShell の使い分け

| パターン                             | 適用場面                                         | ページ例                                                    |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `AdminDetailLayout`                  | 標準の詳細・編集・新規作成ページ                 | customers/[id], spaces/[id]/edit, staff/new                 |
| `InlineEditorShell` + `EditorHeader` | フルスクリーンエディタ（Lexical/コンテンツ編集） | posts/[id], news/[id], terms/[id]/edit, faq/items/[id]/edit |

**禁止**: InlineEditorShell を使うページに AdminDetailLayout をラップすること（二重ヘッダーになる）

---

## 詳細・編集・新規作成ページ標準構造

### 詳細ページ（Server Component + AdminDetailLayout）

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

**`DetailDeleteButton` の `onDelete` は `.bind(null, id)` で渡す**:

Server Component から `'use client'` の `DetailDeleteButton` へ `onDelete` を渡す際、
通常のアロー関数クロージャ `() => deleteAction(id)` は RSC 境界を越えられない（シリアライズ不可）。
Server Action を `.bind()` することで RSC 境界を越えられるバインド済み Server Action を生成する:

```tsx
// NG: 通常クロージャは RSC 境界を越えられない
onDelete={() => deleteReservation(id)}

// OK: .bind(null, id) でバインド済み Server Action を生成
onDelete={deleteReservation.bind(null, id)}
```

**配置ルール**:

| 要素         | 配置場所                                            | 禁止場所              |
| ------------ | --------------------------------------------------- | --------------------- |
| バックボタン | `AdminDetailLayout backHref` — 左上                 | 詳細コンポーネント内  |
| 削除ボタン   | `AdminDetailLayout actions` — 編集ボタンの**左**    | ページ最下部カード    |
| 編集ボタン   | `AdminDetailLayout actions` — 最右                  | 詳細コンポーネント内  |
| タイトル CSS | `text-2xl font-bold tracking-tight text-foreground` | `tracking-tight` 省略 |

### 新規作成ページ（Server Component + AdminDetailLayout）

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

**管理画面 Suspense 内の async Server Component には `connection()` を配置**:

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
"use client";
export function DashboardHeader() {
  const today = new Date();
  ...
}

// 不要: page.tsx 本体（Suspense の外）には connection() 不要
export default async function AdminPage() {
  const { id } = await params;
  ...
}
```

### 共有コンポーネント一覧

| コンポーネント       | パス                                    | 用途                                |
| -------------------- | --------------------------------------- | ----------------------------------- |
| `AdminDetailLayout`  | `@/admin/components/AdminDetailLayout`  | 詳細・編集ページ統一ヘッダー        |
| `DetailSection`      | `@/admin/components/DetailSection`      | Card ラッパー（セクション区切り）   |
| `DetailField`        | `@/admin/components/DetailField`        | ラベル + 値の行（dt/dd）            |
| `DetailDeleteButton` | `@/admin/components/DetailDeleteButton` | ヘッダー削除ボタン + ダイアログ確認 |

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

## 多選択肢ダイアログのレイアウト

選択肢が5件以上のダイアログは `grid-cols-3` + `max-w-2xl` で横展開、`max-h-[60vh] overflow-y-auto` でスクロール対応:

```tsx
<AlertDialogContent className="max-w-2xl">
  <div className="grid grid-cols-3 gap-2 py-4 max-h-[60vh] overflow-y-auto">
    <button className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 text-center">
      <div className="p-2 rounded-md bg-primary/10">
        <Icon />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </button>
  </div>
</AlertDialogContent>
```

## ToggleGroup パターン（セグメント選択）

少数の排他選択肢は `ToggleGroup`（Radix）を使用。生 `<input type="radio">` は禁止。

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/admin/components/ui";

<ToggleGroup
  type="single"
  value={currentValue}
  onValueChange={(v) => {
    if (v) setValue("fieldName", v, { shouldDirty: true });
  }}
>
  <ToggleGroupItem value="sm">小</ToggleGroupItem>
  <ToggleGroupItem value="md">中</ToggleGroupItem>
  <ToggleGroupItem value="lg">大</ToggleGroupItem>
</ToggleGroup>;
```

**`onValueChange` の `if (v)` ガード必須** — Radix ToggleGroup は同じ値を再クリックすると `""` を返す（deselect）。`if (v)` で空文字列を無視する。

**参照実装**: `pages/[slug]/edit/_components/DesignFields.tsx`（ToggleGroup + フラット fieldset + カラーピッカー）

**使い分け:**

| 選択肢数                 | コンポーネント | 例                                      |
| ------------------------ | -------------- | --------------------------------------- |
| 2-6（テキスト/アイコン） | `ToggleGroup`  | 余白サイズ、テキスト配置、コンテナ幅    |
| 2-6（説明付きカード）    | `SelectionBox` | 決済方法、プラン選択                    |
| 7+                       | `Select`       | タイトルサイズ（6段階）、アニメーション |

---

## ソータブルリスト標準パターン

管理画面の全 dnd-kit ソータブルリストは以下を統一:

- **ドラッグ中**: `z-50 shadow-lg ring-2 ring-primary/20`（`bg-muted/80` や `opacity-50` 禁止）
- **DragOverlay 使用時**: 元アイテムは `opacity-30`、オーバーレイは `shadow-lg ring-2 ring-primary/20 opacity-90`
- **ドラッグハンドル**: `DragHandle` コンポーネント（`@/admin/components/ui/sortable`）を統一使用
- **DndContext**: 必ず `id` prop 付与（SSR hydration mismatch 防止）
- **削除確認**: `DeleteConfirmDialog` を統一使用
- **操作メニュー**: `ActionDropdown` を統一使用（インライン edit/delete ボタン禁止）
- **transform**: `CSS.Transform.toString()` はスケール含むためレイアウトシフトの原因。`translate3d()` のみ使用
- **Dialog 配置**: `DeleteConfirmDialog` 等のダイアログは sortable `ref` の div 外（Fragment 兄弟）に配置。dnd-kit が要素を clone する際にポータルが巻き込まれるのを防止
- **cursor**: ドラッグハンドルは `cursor-grab`、ドラッグ中は `cursor-grabbing` に動的切替

---

## 設定セクション フォームパターン

**設定ページ間の導線（`SettingsLayout` / `CardDescription`）:**

関連する設定ページへのリンクは `CardDescription` 内または `SettingsLayout description` に `<Link>` で埋め込む。
`SettingsLayout` の `description` は `ReactNode` を受け付ける（例: ナビゲーション管理 ↔ サイト設定レイアウトタブ間の相互リンク）。

**設定セクションのヒント折りたたみ（Accordion）:**

3行以上のヒント・補足リストは Accordion で折りたたむ（デフォルト閉じ）。
1-2行の短いヒントはインライン表示のまま。PermissionsSection / SidebarSection / RobotsTxtSection が実装例。

```tsx
<Accordion type="single" collapsible>
  <AccordionItem
    value="hints"
    className="rounded-lg border bg-muted/50 px-4 border-b last:border-b"
  >
    <AccordionTrigger className="text-sm">ヒント</AccordionTrigger>
    <AccordionContent>
      <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
        <li>...</li>
      </ul>
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

**禁止**: Collapsible でヒントを折りたたむ（トリガーとコンテンツが分離して見える）

設定セクション（`settings/_components/sections/`）は `useFormAction` + `Form` コンポーネント群で統一:

```tsx
// 標準パターン（BasicInfoSection.tsx が実装例）
const { form, isPending, onSubmit } = useFormAction(
  basicInfoFormSchema,           // schemas/form-schemas-*.ts のフォーム用スキーマ
  (data) => updateBasicInfo({    // emptyToNull で空文字→null 変換
    siteName: emptyToNull(data.siteName),
  }),
  { defaultValues: {...}, refresh: true, successMessage: "保存しました" }
);

<Form {...form}>
  <form onSubmit={onSubmit}>
    <Card>
      <CardContent>
        <FormField control={form.control} name="siteName" render={({ field }) => (
          <FormItem>
            <FormLabel>サイト名</FormLabel>
            <FormControl><Input {...field} disabled={isPending} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end pt-2">
          <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
        </div>
      </CardContent>
    </Card>
  </form>
</Form>
```

**SubmitButton 配置（右寄せ統一）:**

```tsx
// パターン A: 保存ボタンのみ
<div className="flex justify-end pt-2">
  <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
</div>

// パターン B: 接続テスト + 保存（クリア → テスト → 保存の順）
<div className="flex flex-wrap items-center justify-end gap-2">
  <Button type="button" variant="destructive" ...>クリア</Button>
  <Button type="button" variant="outline" ...>接続テスト</Button>
  <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
</div>
```

**Switch グループの fieldset パターン:**

複数の Switch を視覚グループ化する場合は `<fieldset>` + `<legend>` を使用。`<div>` + `<h4>` は禁止（a11y・セマンティクス）:

```tsx
<fieldset className="rounded-lg border p-4 space-y-4">
  <legend className="px-1 text-sm font-medium">送信設定</legend>
  <div className="flex flex-wrap gap-6">
    <FormField .../> {/* Switch */}
    <FormField .../> {/* Switch */}
  </div>
</fieldset>
```

参照実装: `EmailSection.tsx`（設定 switch グループ）、`DesignFields.tsx`（ToggleGroup fieldset）

**スキーマ構成（責務分離）:**

- Server Action スキーマ（`schemas/basic.ts`）: `z.string().nullable()` — サーバーバリデーション用
- フォーム用スキーマ（`schemas/form-schemas-*.ts` + `form-schema-helpers.ts`、barrel は `schemas/index.ts`）: `z.string().max(100)` — クライアントバリデーション用
- `emptyToNull()` で送信時に空文字列 → null 変換

**接続テスト・OAuth ボタンの共存:**

```tsx
// フォーム送信: useFormAction
const { form, isPending, onSubmit } = useFormAction(schema, action, options);
// 接続テスト: 別の useTransition（isPending と競合しない）
const [testPending, startTestTransition] = useTransition();
```

**useFormAction 非適用の例外:**

- CRUD テーブル（CustomApiKeysSection, ICalFeedSection）
- 読み取り専用 UI（PermissionsSection）
- Lexical エディタ（RobotsTxtSection）
- 複雑なネスト配列（BusinessHoursSection — 曜日×時間帯）
- **スペース作成・編集フォーム**（`SpaceEditForm`）— DnD・メディアピッカー・`useFieldArray` 等のため RHF は維持し、送信のみ React 19 **`useActionState` + `FormData` + Server Action**（`submitSpaceFormAction`）へ統一。ペイロード変換は `spaceEditFormDataToSpaceFormPayload`、シリアライズは `@/admin/lib/space-form-data-codec`（`spaceFormSchema` でサーバー再検証）

**禁止:**

- 設定セクションで `useState` + 手動 `onChange` のフォーム管理（`useFormAction` を使用）
- `useRefreshOnSuccess` フック（削除済み、`useFormAction` の `refresh: true` で代替）

---

## 禁止事項

1. **型 re-export の追加禁止** — 共有型のローカル aliases は不要（`export type Foo = SharedFoo`）
2. **ハードコードカラー禁止** — `bg-black/60` → `bg-overlay`、`hover:bg-white/5` → `hover:bg-sidebar-nav-hover`
3. **bare div ページネーション禁止** — `<nav aria-label="...">` を使用
4. **setPage/setParams の void なし呼び出し禁止** — `void setPage(n)`
5. **`@/shared/types/server-actions` を管理画面で直接使用禁止** — `@/admin/types/server-actions` 経由
6. **テーブル操作列インライン Button+Link 禁止** — `ActionDropdown` の `*ActionCell` コンポーネントを使用（`@/admin/components/ActionDropdown`）
7. **削除ボタンをページ最下部カードに配置禁止** — `DetailDeleteButton` をヘッダー `actions` の編集ボタン左に配置
8. **詳細・編集ページのバックボタンを詳細コンポーネント内に配置禁止** — `AdminDetailLayout backHref` で左上固定
9. **Suspense 内 async Server Component の `connection()` 省略禁止** — `new Date()` や uncached データを使う Suspense 内コンポーネントは先頭に `await connection()` を配置。page.tsx 本体には不要
10. **新規作成ページで手動ヘッダー実装禁止** — `new/page.tsx` も `AdminDetailLayout` を使用（`locations/new` がテンプレート。`Link`+`ArrowLeft`+`Button` の手動実装禁止）
11. **`backLabel` にエンティティ名を含めること禁止** — `"クーポン一覧に戻る"` NG → `"一覧に戻る"`（デフォルト）/ `"詳細に戻る"` のみ使用
12. **バックナビゲーションに `ChevronLeft` 禁止** — `ArrowLeft` は `AdminDetailLayout` 内部で自動提供。手動実装が必要な場合も `ArrowLeft` のみ
13. **タブコンテンツ内にタブ名を繰り返す見出し禁止** — `<TabsContent>` 内で同名の `h2`/`h3` は冗長。タブ自体がコンテキストを持つ
14. **タブリスト右端ボタンの dialog state をタブ内コンポーネントに持つこと禁止** — `showXxxDialog` state は `*EditTabs` 親で管理し、`onShowXxxDialogChange` prop として渡す
15. **テーブルカラム非表示をヘッダーのみ・データ行のみに適用禁止** — ヘッダー・仮想行（ホームページ行等）・全データ行に対称的に `hidden md:table-cell` を適用する
16. **テーブルに `overflow-x-auto` なしで `overflow-hidden` のみ使用禁止** — モバイルでテーブルがクリップされスクロール不可になる。必ず2層ラッパーを使う
17. **管理画面のサブページディレクトリにルーティング対象名を使用禁止** — `[slug]/sections/` や `[slug]/seo/` 等のサブページコンポーネントディレクトリは Next.js がルートとして解釈する可能性がある。`_` プレフィックスでプライベートフォルダにする（`[slug]/_sections/`、`[slug]/_seo/`）
18. **新規作成フォームに `disabled={!isDirty}` 禁止** — 新規作成は初期状態で全フィールドが空のため isDirty は常に false。isDirty 無効化は**編集モードのみ**。create/edit 共用コンポーネントでは `{...(isEdit && { disabled: !form.formState.isDirty })}` 条件スプレッド
19. **設定セクションの SubmitButton を CardContent 内に直置き禁止** — `<div className="flex justify-end pt-2">` でラップして右寄せ。CRUD フォームの `flex justify-end gap-4` と統一

---

## 一括操作（BulkActions）パターン

一覧テーブルにチェックボックス選択 + フローティングアクションバーを追加するパターン。

**参照実装**: `pages/_components/BulkActions.tsx`, `posts/_components/PostBulkActions.tsx`, `reservations/_components/ReservationBulkActions.tsx`

### 必須要素

1. **テーブルを Client Component 化** — `useState<string[]>([])` で selectedIds 管理
2. **ヘッダーチェックボックス** — `allSelected` + `onToggleAll` props を TableHeader に追加
3. **行チェックボックス** — `<input type="checkbox" aria-label={`${item.name}を選択`} />`
4. **BulkActions バー** — `fixed bottom-6 left-1/2 -translate-x-1/2 z-50` + `rounded-lg border bg-card px-4 py-3 shadow-lg`
5. **`useTransition`** で isPending、`isMutationError()` でエラーチェック、`router.refresh()` + `onClear()`

### ステータス遷移制約がある場合（予約等）

- `updateMany` ではなく個別にドメインコマンドを呼び出す
- 非対象ステータスの行はチェックボックスを `disabled` にする
- 結果を `{ succeeded, skipped, failed }` で返し、toast に表示

---

## カラムソートパターン

**共有コンポーネント**: `@/admin/components/table/SortableColumnHeader`

### 実装手順

1. `src/shared/lib/nuqs/parsers.ts` に `sortBy` + `sortOrder` を追加:
   ```tsx
   sortBy: parseAsStringLiteral(["createdAt", "fieldA", "fieldB"] as const).withDefault("createdAt"),
   sortOrder: parseAsSortOrder,
   ```
2. クエリ関数に `orderBy: { [sortBy]: sortOrder }` を追加
3. `*TableHeader.tsx`（Client Component）を作成:
   - `useQueryStates(parsers)` で sortBy/sortOrder を読み書き
   - `SortableColumnHeader` でソート可能カラムを定義
4. テーブルの `<TableHeader>` を `<*TableHeader />` に置換

**参照実装**: `ReservationTableHeader.tsx`, `PostTableHeader.tsx`, `StaffTableHeader.tsx`

---

## Gotchas

- **`PublishSwitch.onToggle` は `(id, checked: boolean)` 必須** — 既存の「DB を読んで反転」パターン（`data: { isActive: !current }`）は非互換。`executeAdminMutationResult` で boolean を直接受け取り `data: { isActive }` で set する形に変更する
- **tailwind-variants 複数スロット合成時の `text-*` 競合** — `${base()} ${variant()}` のように同一要素に2つの `text-*` が適用されると、CSS 生成順次第でどちらが勝つか不定（HTML クラス順は無関係）。動的に変わる色（アクティブ状態等）は継承に頼らず子要素に直接 `text-*` を明示する
- **Tabler アイコンの `currentColor`** — アイコンの色を動的に切り替えたい場合、アイコン定義側では制御できないため呼び出し元で `<span className={isActive ? "text-sidebar-text" : ""}>` でラップして色クラスを付与する
- **`bg-overlay` に opacity modifier 禁止** — `--color-overlay: oklch(0 0 0 / 0.6)` はアルファ値が CSS 変数値に組み込み済み。`bg-overlay/30` 等の Tailwind opacity modifier は期待通り機能しない。`bg-overlay` のみ使用する
- **`DialogContent` には必ず `DialogTitle` が必要** — Radix `DialogTitle`（または VisuallyHidden でラップ）がないと `role="dialog"` に `aria-labelledby` が接続されず WCAG 4.1.2 違反。`DialogContent` 追加時は必ずセットで記述する
- **Settings singleton にフィールド追加は4箇所同時更新** — ① `schema.prisma` + migrate ② `domain/settings/types.ts` の `SettingsData` 型 ③ `domain/settings/queries.ts` の get クエリ + `commands.ts` の update コマンド ④ `actions/settings/schemas.ts` の Zod スキーマ + `other.ts` の Server Action + `index.ts` barrel。`SettingsData` は `getOrCreateSettings()` が `select` なしで全カラムを返すため型追加のみで値は自動伝播
- **Recharts の SVG props は CSS 変数を受け取れない** — `fill={CHART_COLORS.primary}` のように oklch 定数を定義して渡す。admin.css テーマトークンと同期する oklch 値をコンポーネント上部に `as const` で定義（`ReservationChart.tsx` が実装例）
- **`bg-muted` 系は青みがかる** — admin.css の `--color-muted: oklch(0.95 0.01 250)` は色相250（青系）。`bg-muted/30` 等の低不透明度で薄い青が目立つ。ニュートラルな背景には背景色なし or `bg-card` を使用
