---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---

# Tailwind Container Queries

> Tailwind CSS 4.2 / @container / named container

## Container Queries — 基本パターン

```tsx
// OK: コンポーネント内部の幅適応（カード系）
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-6">
    {cards.map(...)}
  </div>
</div>
```

## Container Queries — named container（admin 等の複雑レイアウト）

```tsx
// layout.tsx / MainContent.tsx で named container を付与
<main className="@container/main ...">{children}</main>

// children 側で @md/main: / @3xl/main: を使用
<div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-4">
  {stats.map(...)}
</div>
```

サイドバーの開閉で main content 幅が変わる admin 等では named container が必須（viewport では追従できない）。

## Container Queries — 逆方向（@max-\*）

```tsx
// コンテナが md 未満のときのみ縦積み（通常は横並び）
<div className="@container">
  <div className="flex flex-row @max-md:flex-col">...</div>
</div>
```

## CARD_GRID_COLS_MAP（公開 Section 用 SSoT）

`@/public/lib/section-style-maps.ts` が container query variants で定義済み:

```typescript
export const CARD_GRID_COLS_MAP: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 @md:grid-cols-2",
  3: "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3",
  4: "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4",
};
```

consumer 側は必ず親に `@container` を付与（`SpaceShowcaseSection` / `SpaceListSection` / `PostListSection` が参照実装）。

## 禁止パターン

```tsx
// NG: カードグリッドに viewport breakpoint
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">

// NG: named container を付けずに @md/main: を使う（無効）
<div className="grid @md/main:grid-cols-2">

// NG: arbitrary max-w-[90rem] を @theme 経由せず直書き
<div className="max-w-[90rem]">
```

## OK パターン

```tsx
// OK: カードは @container
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3">

// OK: admin named container + children variants
<main className="@container/main">
  <div className="grid @md/main:grid-cols-2 @3xl/main:grid-cols-4">

// OK: @theme token 経由
<div className="max-w-[var(--container-header-max)]">
```

## `*_GRID_COLS_MAP` は全て Container Queries variants

`GRID_COLS_MAP` / `CARD_GRID_COLS_MAP` / `GALLERY_GRID_COLS_MAP` は `@md:`/`@3xl:` で統一済み。viewport breakpoint (`md:`/`lg:`) 復活禁止。consumer は親に `@container` 必須。
