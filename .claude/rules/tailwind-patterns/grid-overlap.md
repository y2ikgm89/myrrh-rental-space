---
paths:
  - src/**/*.tsx
---

# Grid Cell Overlap パターン

> Tailwind CSS 4.2 / responsive overlay / Pair Grid

## 同 Grid cell overlap（responsive overlay pattern）

モバイルで画像に text を overlay、desktop で split レイアウトを **単一 DOM / 単一 h1** で実現するパターン。

```tsx
<section className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[1fr_1fr] md:min-h-[85svh]">
  {/* Image: mobile row 1 / desktop left col spanning 2 rows */}
  <div className="col-start-1 row-start-1 aspect-[4/3] overflow-hidden md:row-span-2 md:aspect-auto md:min-h-0">
    <Image fill sizes="(max-width: 768px) 100vw, 50vw" />
  </div>

  {/* Headline: mobile overlaps image via same cell + z-index / desktop right-top */}
  <div
    className={cn(
      "col-start-1 row-start-1 z-10 flex flex-col justify-end",
      "pointer-events-none px-6 pb-14", // mobile: pass touch events to image for swipe
      "md:col-start-2 md:row-start-1 md:pointer-events-auto",
      "md:bg-background md:px-12 md:pt-16 md:pb-6",
    )}
  >
    <h1>...</h1>
  </div>

  {/* Body: mobile row 2 / desktop right-bottom */}
  <div className="col-start-1 row-start-2 md:col-start-2 md:row-start-2">
    <p>...</p>
  </div>
</section>
```

**ポイント**:

- モバイル: image と headline が同 grid cell `(1,1)` に配置 → z-index で layering
- デスクトップ: headline が `md:col-start-2` に分離 → image と独立カラム
- `pointer-events-none` on mobile overlay で swipe/tap が image に到達
- 単一 h1 — DOM 重複なし、SEO 整合

参照実装: `src/app/(public)/_shared/components/page-hero/EditorialSplitHero.tsx`

---

## Pair Grid の動的カラム切替

2-col grid で片方が条件付きレンダリングの場合、両方 present 時のみ `grid-cols-2` を適用する。
片方欠損時は `grid-cols-1`（full-width）にフォールバックして横の空白を避ける:

```tsx
import { cn } from "@/shared/lib/cn";

// NG: 常に grid-cols-2 → 片方なしで右半分空白の視覚バグ
<div className="grid gap-12 lg:grid-cols-2">
  {a && <BlockA />}
  {b && <BlockB />}
</div>

// OK: 両方 present 時のみ 2-col、片方なら full-width
<div className={cn("grid gap-12 lg:gap-16", a && b && "lg:grid-cols-2")}>
  {a && <BlockA />}
  {b && <BlockB />}
</div>
```

**判定基準**: pair の片方が optional フィールド（DB nullable / オプション設定）の場合は必ず動的化。
seed や本番データで片方欠損するケースを silent に許容できる。

参照実装: `LocationChapter` の Address/Routes pair、Parking/Amenities pair（`/access/_components/location-chapter.tsx`）。

---

## Grid item の default は `justify-self: stretch`

container に `justify-items-start` + 中央/右端 item に `md:justify-self-*` で override（`site-header.tsx` 参照）。

```tsx
// NG: mx-auto が wrapper 幅固定前提のため効果なし
<div className="grid grid-cols-3">
  <div className="mx-auto">...</div>
</div>

// OK: justify-items-start + 個別 justify-self override
<div className="grid grid-cols-3 justify-items-start">
  <div>left</div>
  <div className="md:justify-self-center">center</div>
  <div className="md:justify-self-end">right</div>
</div>
```
