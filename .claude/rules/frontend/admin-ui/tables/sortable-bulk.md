---
description: dnd-kit ソータブルリスト + 一括操作 (BulkActions) + カラムソート (SortableColumnHeader) の標準パターン
paths:
  - src/app/(admin)/**/*Sortable*.tsx
  - src/app/(admin)/**/*BulkActions*.tsx
  - src/app/(admin)/**/*TableHeader*.tsx
  - src/admin/components/table/SortableColumnHeader*.tsx
  - src/admin/components/ui/sortable*.tsx
---

# ソータブルリスト + 一括操作 + カラムソート

> dnd-kit / DragOverlay / DragHandle 統一 + BulkActions floating bar + カラムソート (`sortBy` + `sortOrder` parsers)。

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

## カラムソートパターン

**共有コンポーネント**: `@/admin/components/table/SortableColumnHeader`

### 実装手順

1. `src/shared/lib/nuqs/parsers.ts` に `sortBy` + `sortOrder` を追加:

   ```tsx
   sortBy: parseAsStringLiteral(["createdAt", "fieldA", "fieldB"] as const).withDefault("createdAt"),
   sortOrder: parseAsSortOrder,
   ```

2. クエリ関数に `buildXxxOrderBy(sortBy, sortOrder)` helper を追加。nullable 列は `{ [col]: { sort, nulls: "last" } }` + tie-breaker（`updatedAt: "desc"`）で stabilize（→ `frontend/project-design-config.md` §Nullable 列のソート）。non-nullable 列は `{ [col]: sortOrder }` 単独で OK
3. `*TableHeader.tsx`（Client Component）を作成:
   - `useQueryStates(parsers)` で sortBy/sortOrder を読み書き
   - `SortableColumnHeader` でソート可能カラムを定義
4. テーブルの `<TableHeader>` を `<*TableHeader />` に置換

**参照実装**: `ReservationTableHeader.tsx`, `PostTableHeader.tsx`, `StaffTableHeader.tsx`, `CustomerTableHeader.tsx`（nullable 列 + tie-breaker 版）
