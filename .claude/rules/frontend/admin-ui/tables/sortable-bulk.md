---
description: dnd-kit ソータブルリスト + 一括操作 (BulkActions) + カラムソート (SortableColumnHeader) の標準パターン
paths:
  - src/app/(admin)/**/*Sortable*.tsx
  - src/app/(admin)/**/*BulkActions*.tsx
  - src/app/(admin)/**/*TableHeader*.tsx
  - src/app/(admin)/**/_shared/components/table/SortableColumnHeader*.tsx
  - src/app/(admin)/**/_shared/components/ui/sortable*.tsx
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
- **order はシステム管理（手動 order 入力を持たせない）**: create=末尾自動採番（`(maxOrder ?? 0) + 1`）/ reorder=D&D `reorderXxx(orderedIds)` が SSoT（`order: index`）/ update=order 不変。フォーム schema・CommandInput 契約から `order` を完全削除する（ソート整数を UI に露出しない、Notion / Linear / Sanity / Shopify 標準）。詳細と NG/OK + canonical 実装（全 5 リソース）は `code-quality/forbidden-patterns.md` §8

## D&D list-table の filter/pagination ガード（一覧テーブルに D&D を配線するとき）

一覧テーブル（Server Component）を D&D 対応の Client Component 化して並び替えを配線するときの規律。検索・絞り込み・ページネーション付き list で**部分集合を D&D すると global order が破綻する**ため、`sortable` ガードと `startIndex` で防ぐ。

- **`sortable` ガード**: 検索・公開フィルタが有効なときは D&D を無効化（`sortable = !search && !publishFilter`）。`useSortable({ disabled: !sortable })` + 非 sortable 時はドラッグハンドルを空 span に差し替え。filter なし list（Terms 等）は常時 `sortable`
- **`startIndex` で global order 維持**: ページオフセット（`(page - 1) * perPage`）を親 Server Component から渡し、`updateXxxOrder` には `sortOrder = startIndex + index` を渡す。index 直値（0 始まり）は単一ページ list（`reorderXxx(orderedIds)`）専用
- **楽観更新 + ロールバック**: `useState` で行を保持し D&D 即時反映 → `startTransition` で reorder action → `isMutationError` なら `setItems([...initialItems])` で戻す。React 19 の「props 変化を render 中に state へ同期」で SC 再 fetch を反映
- **配線 SSoT**: 親 `*TabContent.tsx`（Server Component）が `sortable` / `startIndex` を計算して Table に渡す
- **参照実装**: `CategoryTable` + `CategoryTabContent`（SpaceCategory、filter+pagination、PR #401）/ `LocationTable` + `LocationTabContent`（Location、同、PR #402）/ `TermsTable`（filter なし常時 D&D、PR #403）/ `FaqCategoryItemsTable`（`sortBy === "order"` のときのみ sortable）

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

**Gotcha**: `sortBy` parser の `as const` tuple に新値を追加したら、対応する `<*TableHeader>` 内の `*SortBy` literal union も**同 commit で同期必須**。type-check で TS2322 検出可だが、parser PR と Header PR を分けると silent stale を許す。canonical: parser 拡張時は `grep -rn "type [A-Z][A-Za-z]*SortBy = " src/app/\\(admin\\)` で対応 Header を grep + 同時更新。実例: 2026-05-12 セッションで `eventSortByValues` に `endTime` / `updatedAt` 追加 → `EventTableHeader.tsx` の `EventSortBy` union 同期漏れで 1 round 余分発生

**参照実装**: `ReservationTableHeader.tsx`, `PostTableHeader.tsx`, `StaffTableHeader.tsx`, `CustomerTableHeader.tsx`（nullable 列 + tie-breaker 版）
