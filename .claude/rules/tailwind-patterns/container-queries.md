---
paths:
  - src/**/*.tsx
  - src/**/*.css
---

# Tailwind Container Queries

> Tailwind CSS 4 / @container / named container

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

// NG: admin dashboard widget で viewport breakpoint（サイドバー開閉に追従しない silent UX bug）
//     viewport 1024px でも main が狭ければ 6 col は過密 → 容器幅基準が canonical
<div className="grid grid-cols-2 sm:grid-cols-4">  // ← AnalyticsCard 等
```

## 同一要素に `@container` と自身の `@xx:` variant を付ける self-reference 罠（最頻 silent bug）

`@container` は **その要素の子孫** のためのクエリコンテナを作る（`container-type: inline-size`）。一方 `@md:` 等の variant は **最も近い祖先のコンテナ** を参照する（[MDN: container queries は ancestor を参照](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)）。**要素は自分自身のコンテナクエリには応答できない**。そのため `@container` と `@md:grid-cols-2` を **同一要素** に付けると、`@md:` は祖先コンテナを探し、無ければ **永久に未解決**で base クラス（`grid-cols-1` 等）に張り付く silent bug になる。

```tsx
// NG: 「自分の幅に応じて多列化したい」意図だが @md: は祖先を参照 → 祖先コンテナ皆無で常に grid-cols-1
<div className="@container grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3">
  {cards}
</div>

// OK: @container を親ラッパーに分離。grid-cols は子要素に置く（子が親の幅を参照する）
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3">{cards}</div>
</div>
```

**正当な例外（同一要素 OK のケース）**: その要素が **意図的に祖先コンテナの中** にあり、`@xx:` がその **祖先** の幅に応答するのが目的で、かつ `@container` は **自身の子** のために必要 — という二役を担う場合（例: 祖先 grid 内のカードが `@md:col-span-2` で祖先に応答しつつ、自身も sub-grid のコンテナになる）。判定: 「`@xx:` を**自分の幅**で効かせたい」なら必ずラッパー分離。「**祖先の幅**で効かせたい」なら祖先コンテナの実在を確認する。

**breakpoint は実コンテナ幅に合わせる**: ダイアログ（`max-w-3xl` − padding ≈ 720px）内で `@3xl`(768px) を使うと届かず 3 列化しない。コンテナの実内幅を基準に `@xs`(320) / `@2xl`(672) 等を選ぶ。

**検出 grep（audit 補助、正当な例外も拾うため手動精査）**:

```bash
# 同一 className 内に @container と自身の @xx: variant が同居 → 祖先コンテナ実在を要確認
grep -rnE '@container[^"'"'"']*@(xs|sm|md|lg|xl|2xl|3xl):' src/ --include="*.tsx"
```

実例: 2026-06-04 規約タイプ選択ダイアログ（`TermsTypeSelectDialog`、祖先コンテナ皆無で縦一列に張り付き見切れ）+ `time-slot-grid`（デスクトップでも `grid-cols-3` 固定）を、いずれも `@container` ラッパー分離で修正。`space-selector` / `location-selector` は子が `@md:` を正しく参照する正当な `@container` で、親自身の dead `@md:gap-4`（自己参照で一度も適用されない）のみ除去。

## 適用済 dashboard widget SSoT (PR #217)

`DashboardMain.tsx` の `@container/main` 内側で grid-cols を使う dashboard widget は **必ず `@*/main:` named variant**。viewport breakpoint 直接使用は禁止。canonical:

| widget                                 | grid                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `AnalyticsCard` (4 統計セル)           | `grid-cols-2 @md/main:grid-cols-4`                                             |
| `AuditLogStats` (4 統計セル)           | `grid-cols-1 @md/main:grid-cols-2 @3xl/main:grid-cols-4`                       |
| `CommentStats` (3 統計セル)            | `grid-cols-1 @2xl/main:grid-cols-3`                                            |
| `RecentItemsSkeleton` (2 card)         | `grid-cols-1 @3xl/main:grid-cols-2`                                            |
| `settings/page.tsx` (8 カテゴリカード) | `grid-cols-1 @md/main:grid-cols-2 @3xl/main:grid-cols-3`                       |
| `media/page.tsx` (画像 grid)           | `grid-cols-2 @md/main:grid-cols-3 @2xl/main:grid-cols-4 @4xl/main:grid-cols-6` |

新規 dashboard widget 追加時は本 SSoT 踏襲必須。sidebar (288px) 開閉時の main 実 width に追従する設計（viewport 1024px でも sidebar 表示時 main 688px で `@2xl/main:grid-cols-4` までで適正密度）。

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
