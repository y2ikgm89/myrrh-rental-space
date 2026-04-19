---
paths:
  - src/app/(admin)/**/*Table*.tsx
  - src/app/(admin)/**/*Filters.tsx
  - src/app/(admin)/**/*ActionCell.tsx
  - src/app/(admin)/**/*BulkActions.tsx
  - src/app/(admin)/**/*Sortable*.tsx
---

# 管理画面テーブル・フィルターパターン

テーブルレスポンシブ・操作列・フィルター・ソート・一括操作・ソータブルリスト。

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

---

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

**操作列（`*ActionCell` 配置）の標準**: `<TableHead>操作</TableHead>` + `<TableCell>`（どちらも幅指定・寄せ指定なし）。`w-24 text-right` / `className="text-right"` の付与は多数派（Post/News/Customer/Event/Inquiry/Coupon）から逸脱するため禁止。例外は既存の `LocationTable` / `FaqTrashTable` のみ（`text-right` 指定あり）。

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

ステータス Badge を**左端**に配置するパターン（予約・お問い合わせ等、状態が最重要なワークフロー系テーブル）は例外として許可。**適用対象**: Post / News / Terms / FAQ / Page / Inquiry / Reservation。参照実装: `SpaceTableDesktop`（スペース管理）、`LocationTable`（場所管理）。

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
2. クエリ関数に `buildXxxOrderBy(sortBy, sortOrder)` helper を追加。nullable 列は `{ [col]: { sort, nulls: "last" } }` + tie-breaker（`updatedAt: "desc"`）で stabilize（→ `gotchas.md` §Nullable 列のソート）。non-nullable 列は `{ [col]: sortOrder }` 単独で OK
3. `*TableHeader.tsx`（Client Component）を作成:
   - `useQueryStates(parsers)` で sortBy/sortOrder を読み書き
   - `SortableColumnHeader` でソート可能カラムを定義
4. テーブルの `<TableHeader>` を `<*TableHeader />` に置換

**参照実装**: `ReservationTableHeader.tsx`, `PostTableHeader.tsx`, `StaffTableHeader.tsx`, `CustomerTableHeader.tsx`（nullable 列 + tie-breaker 版）

---

## 複数フィルター共存パターン（BaseFilters + useQueryStates 直接）

ステータス + search に追加フィルター（種別・タイプ等）を持つ一覧は、`BaseFilters`（内部 `useFilterParams`）と親コンポーネントの `useQueryStates(adminXxxSearchParamsParsers, ...)` を共存させる。両者が同一パーサーマップを参照するため URL 同期は保たれる:

```tsx
"use client";

export function CustomerFilters() {
  const [params, setParams] = useQueryStates(adminCustomerSearchParamsParsers, {
    history: "push",
    shallow: false,
  });
  return (
    <BaseFilters statusOptions={...} searchPlaceholder="...">
      <div className="w-full sm:w-48">
        <Select
          value={params.customerType}
          onValueChange={(v) => void setParams({ customerType: v, page: 1 })}
        >
          <SelectTrigger aria-label="顧客種別"><SelectValue /></SelectTrigger>
          <SelectContent>{/* ... */}</SelectContent>
        </Select>
      </div>
    </BaseFilters>
  );
}
```

**ルール**:

- 追加フィルターは **`<Select>`（`@/admin/components/ui`）で実装** — ToggleGroup 等の非 Select UI は `BaseFilters` のステータス Select + 既存カテゴリ Select パターンと視覚的一貫性が崩れるため禁止
- パーサーマップは `parseAsStringLiteral([SENTINEL, ...enumValues] as const).withDefault(SENTINEL)` で型安全化（→ `nuqs-patterns.md` §新規 enum フィルター追加時の best practice）
- Sentinel は `"ALL" as const` 等を `_FILTER_ALL` サフィックスで export（例: `CUSTOMER_TYPE_FILTER_ALL`）。空文字 `""` は Radix Select の placeholder 予約なので禁止
- `page.tsx` 側では `parseAsStringLiteral` が validation 責務を持つため `parseXxxFilter` narrowing helper の呼び出しは不要（SSoT 化）

**参照実装**: `PostFilters.tsx`, `InquiryFilters.tsx`, `CustomerFilters.tsx`

---

## 標準フィルターバー順序

管理一覧ページのフィルターは **期間 | 検索 | Select（ステータス等）** の順に統一する:

- **期間**: 最左、`flex items-center gap-2` でグループ化 + 「期間:」ラベル + 「〜」区切り
- **日付 input**: `w-[160px]` + `aria-label`（`type="date"` は placeholder を無視するため `placeholder` 属性禁止）
- **検索**: `flex-1`（固定幅禁止）
- **Select**: `w-full sm:w-[180px]` で最右
- **wrapper**: `flex flex-col gap-3 sm:flex-row sm:items-center`（`flex-wrap` が必要な場合は `flex flex-wrap items-center gap-3`）

**参照実装**: `ReservationFilters.tsx`, `EventFilters.tsx`, `AuditLogFilters.tsx`
