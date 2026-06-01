---
description: ClickableTableRow による行クリック遷移パターン（設計判断 / stopRowClick / destination URL / 禁止パターン）
paths:
  - src/app/(admin)/**/*Table*.tsx
  - src/app/(admin)/**/_shared/components/table/ClickableTableRow*.tsx
---

# テーブル行クリック遷移パターン

> `ClickableTableRow`（`@/admin/components/table`）+ `stopRowClick` で interactive cell の click 伝播を遮断する WAI-ARIA 準拠パターン。

## 設計判断（frontend/project-design-config.md §button ネスト禁止 第二推奨採用）

`<tr>` を Card Overlay パターン（第一推奨）で実装することは以下の制約で不可能:

1. **`<tr>` への `position: relative` は CSS 仕様上 undefined behavior** — `<tr>` / `<tbody>` / `<thead>` は `display: table-row` のため、positioned containing block を作成する仕様が定まっていない（[CSS 2.1 §17.4 Tables](https://www.w3.org/TR/CSS21/tables.html#model)）
2. **複数 `<td>` を単一 `<a>` で囲むのは HTML 仕様で禁止** — `<tr>` の子は `<td>` / `<th>` のみ許容（[HTML Living Standard §4.9.7](https://html.spec.whatwg.org/multipage/tables.html#the-tr-element)）
3. **per-cell `<a>` overlay は SR/Tab UX を悪化** — 1 行あたり N 個のリンクが Tab 順に入り、画面リーダーで「リンク N 個」と読まれる

そのため第二推奨パターン（`tabIndex={0}` + `onKeyDown(Enter)` + `aria-label`）を採用し、内部 interactive 要素は `stopRowClick` で click 伝播を遮断する。

## 基本パターン

```tsx
import { ClickableTableRow, stopRowClick } from "@/admin/components/table";

<ClickableTableRow
  key={item.id}
  href={`/admin/items/${item.id}`}
  aria-label={`${item.title} の詳細を表示`}
>
  {/* 通常のデータセル — 行クリック有効 */}
  <TableCell>{item.title}</TableCell>
  <TableCell>{item.category.name}</TableCell>

  {/* インタラクティブ要素を含むセル — stopRowClick で行クリック遮断 */}
  <TableCell onClick={stopRowClick}>
    <CheckboxCell ... />
  </TableCell>
  <TableCell onClick={stopRowClick}>
    <ItemActionCell id={item.id} />
  </TableCell>
</ClickableTableRow>
```

## `stopRowClick` を付ける対象

以下の interactive 要素を内包する `<TableCell>` には必ず `onClick={stopRowClick}` を付ける:

- `CheckboxCell`（行選択）
- `PublishSwitch` / `StatusSelect`（インライン制御）
- `ActionDropdown`（操作メニュー）
- `<a href="mailto:...">` / `<a href="tel:...">`（外部プロトコルリンク）
- 任意の `<button>` / `<input>` / `<select>`

## `stopRowClick` を付けない対象

以下は行クリックに伝播しても問題ないため stopPropagation 不要:

- `Badge`（表示のみ）
- `Tooltip` の Trigger（hover/focus で開く、icon に onClick なし）
- 日時・金額等のテキストデータセル

## Destination URL 選択基準

業界標準（GitHub Issues / Linear / Shopify Admin）に従い:

- **詳細ページがある場合**: 詳細ページへ遷移（`/admin/<resource>/${id}`）
- **詳細ページがない場合**: 編集ページへ遷移（`/admin/<resource>/${id}/edit` または `/admin/<resource>/${id}` が editor の場合は後者）

参照実装と destination マトリクス:

| Table              | destination                 | 理由                                 |
| ------------------ | --------------------------- | ------------------------------------ |
| `ReservationTable` | `/admin/reservations/${id}` | 詳細ページあり                       |
| `CustomerTable`    | `/admin/customers/${id}`    | 詳細ページあり                       |
| `PostTable`        | `/admin/posts/${id}`        | `[id]/page.tsx` が直接 editor を表示 |
| `NewsTable`        | `/admin/news/${id}`         | `[id]/page.tsx` が直接 editor を表示 |

## 禁止パターン

```tsx
// NG: <tr> に role="link" を付ける（WAI-ARIA で <tr> の allowed roles に含まれない）
<TableRow role="link" tabIndex={0} onClick={...}>

// NG: e.stopPropagation() を ActionCell の onClick に直書き
<button onClick={(e) => { e.stopPropagation(); doAction(); }}>

// OK: TableCell wrapper に stopRowClick
<TableCell onClick={stopRowClick}>
  <button onClick={doAction}>
</TableCell>

// NG: Space キーで遷移（<a> 慣習に反する、スクロール衝突）
onKeyDown={(e) => {
  if (e.key === " ") router.push(href)  // 禁止
}}

// NG: 行に直接 onClick + 内部 interactive で stopPropagation 個別実装（共通化されない）
<TableRow onClick={() => router.push(href)}>
  <TableCell>
    <button onClick={(e) => e.stopPropagation()}>...</button>
  </TableCell>
</TableRow>
```

## Server Component / Client Component の互換性

`ClickableTableRow` は Client Component（`useRouter` 利用）。Server Component の `*Table.tsx`（CustomerTable / NewsTable 等）から import すると自動的に Client boundary が切れる。`*Table.tsx` 自体に `"use client"` を追加する必要はない（既存の選択 state があれば既に Client Component）。

## キャッシュとスタイル

- hover: `hover:bg-muted/30`（admin.css の semantic token）
- focus-visible: `focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`
- `cursor-pointer` + `transition-colors`
- `<TableCell>` 内 padding を維持するため、行レベルの padding 調整は行わない
