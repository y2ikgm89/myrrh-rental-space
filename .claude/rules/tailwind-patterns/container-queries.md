---
paths:
  - src/**/*.tsx
  - src/**/*.css
---

# Tailwind Container Queries

> カードグリッドは Container Queries（`@container`）、マクロレイアウトは viewport breakpoint。

## 基本パターン

```tsx
// OK: カードグリッド — @container ラッパーを親に分離（自己参照 bug を防ぐ）
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-6">
    {cards.map(...)}
  </div>
</div>

// OK: admin named container（サイドバー開閉に追従）
<main className="@container/main">{children}</main>
<div className="grid @md/main:grid-cols-2 @3xl/main:grid-cols-4">...</div>

// OK: @theme token 経由 arbitrary value
<div className="max-w-[var(--container-header-max)]">
```

## CARD_GRID_COLS_MAP SSoT（`@/public/lib/section-style-maps.ts`）

```typescript
export const CARD_GRID_COLS_MAP: Record<number, string> = {
  2: "grid-cols-1 @md:grid-cols-2",
  3: "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3",
  4: "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4",
};
```

consumer 側は必ず親に `@container` を付与（`SpaceShowcaseSection` / `PostListSection` が参照実装）。

## 禁止パターン

```tsx
// NG: カードグリッドに viewport breakpoint（コンテナ幅非追従）
<div className="grid sm:grid-cols-2 lg:grid-cols-3">
// NG: named container なしで @md/main: を使う（無効）
<div className="grid @md/main:grid-cols-2">
// NG: arbitrary max-w-[90rem] を @theme 経由せず直書き
<div className="max-w-[90rem]">
```

## 自己参照 bug（最頻 silent bug）

`@container` と `@md:` を **同一要素** に付けると `@md:` が永久に解決しない（自分自身のコンテナには応答不可）:

```tsx
// NG: grid-cols が常に grid-cols-1 に張り付く
<div className="@container grid grid-cols-1 @md:grid-cols-2">

// OK: ラッパーを分離
<div className="@container"><div className="grid @md:grid-cols-2">...
```

検出: `grep -rnE '@container[^"'"'"']*@(xs|sm|md|lg|xl|2xl|3xl):' src/ --include="*.tsx"`

## Dashboard Widget SSoT（`DashboardMain.tsx` の `@container/main` 内）

| widget                         | grid                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `AnalyticsCard` (4 統計セル)   | `grid-cols-2 @md/main:grid-cols-4`                                             |
| `AuditLogStats` (4 統計セル)   | `grid-cols-1 @md/main:grid-cols-2 @3xl/main:grid-cols-4`                       |
| `CommentStats` (3 統計セル)    | `grid-cols-1 @2xl/main:grid-cols-3`                                            |
| `RecentItemsSkeleton` (2 card) | `grid-cols-1 @3xl/main:grid-cols-2`                                            |
| `settings/page.tsx` (8 card)   | `grid-cols-1 @md/main:grid-cols-2 @3xl/main:grid-cols-3`                       |
| `media/page.tsx` (画像 grid)   | `grid-cols-2 @md/main:grid-cols-3 @2xl/main:grid-cols-4 @4xl/main:grid-cols-6` |

新規 dashboard widget は本 SSoT 踏襲必須。`*_GRID_COLS_MAP` は全て Container Queries variants。
