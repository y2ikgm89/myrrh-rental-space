# Space Card Hover Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スペースカードに2秒ホバーで拠点名・住所・設備・料金のプレビューオーバーレイを表示する

**Architecture:** `spaceListSelect` を拡張して追加フィールドを取得し、共通マッピング関数で変換。SpaceCard を Client Component 化してホバータイマーとオーバーレイを追加。ホバー用 props は optional（`RelatedSpaces` 等ホバー不要な利用箇所との互換性を維持）。SpaceShowcase のインラインマークアップを SpaceCard に統一。

**Tech Stack:** Next.js 16, React 19 (Compiler 1.0), TypeScript 6, Tailwind CSS 4, Prisma 7

**Spec:** `docs/superpowers/specs/2026-03-25-space-card-hover-preview.md`

---

### Task 1: クエリ層の拡張 — `spaceListSelect` + `mapSpaceListItem`

**Files:**

- Modify: `src/shared/domain/spaces/public-queries.ts`

- [ ] **Step 1: `spaceListSelect` にフィールド追加**

```typescript
const spaceListSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  capacity: true,
  area: true,
  hourlyPrice: true,
  dailyPrice: true,
  mainImageUrl: true,
  facilities: true,
  addressDetail: true,
  category: { select: { id: true, name: true } },
  location: { select: { name: true, address: true } },
} as const;
```

- [ ] **Step 2: `mapSpaceListItem` ヘルパー関数を追加**

`spaceListSelect` の直後、`getPublishedSpaces` の前に追加。`Prisma` 名前空間の import が必要（`import type { Prisma } from "@/shared/db/prisma"`）。

```typescript
function mapSpaceListItem(
  s: Prisma.SpaceGetPayload<{ select: typeof spaceListSelect }>,
) {
  return {
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
    dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
    area: s.area ? Number(s.area) : null,
    facilities: Array.isArray(s.facilities)
      ? s.facilities.filter((f): f is string => typeof f === "string")
      : [],
    lineAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
  };
}
```

注意:

- `area` も `Decimal` 型 → 既存の変換漏れをここで修正
- `facilities` は `as string[]` 禁止 → `.filter()` 型ガードで安全に変換

- [ ] **Step 3: `getPublishedSpaces` のマッピングを置き換え**

```typescript
export async function getPublishedSpaces(categoryId?: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const spaces = await prisma.space.findMany({
    where: {
      isPublished: true,
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    },
    select: spaceListSelect,
    orderBy: { name: "asc" },
  });

  return toPlainArray(spaces.map(mapSpaceListItem));
}
```

- [ ] **Step 4: `getPublishedSpacesPaginated` のマッピングを置き換え**

`rawItems.map` 部分を同様に `rawItems.map(mapSpaceListItem)` に置き換え。

- [ ] **Step 5: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/spaces/public-queries.ts
git commit -m "feat(spaces): expand spaceListSelect with location/facilities/dailyPrice, fix area Decimal conversion"
```

---

### Task 2: `getShowcaseSpaces` のフィールド拡張

**Files:**

- Modify: `src/shared/domain/sections/queries.ts`

- [ ] **Step 1: import 追加**

```typescript
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
```

- [ ] **Step 2: `getShowcaseSpaces` の select を拡張**

```typescript
select: {
  id: true,
  slug: true,
  name: true,
  description: true,
  capacity: true,
  hourlyPrice: true,
  dailyPrice: true,
  area: true,
  mainImageUrl: true,
  facilities: true,
  addressDetail: true,
  category: { select: { id: true, name: true } },
  location: { select: { name: true, address: true } },
},
```

- [ ] **Step 3: return のマッピングを変更**

```typescript
return toPlainArray(
  spaces.map((s) => ({
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
    dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
    area: s.area ? Number(s.area) : null,
    facilities: Array.isArray(s.facilities)
      ? s.facilities.filter((f): f is string => typeof f === "string")
      : [],
    lineAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
  })),
);
```

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/domain/sections/queries.ts
git commit -m "feat(sections): expand getShowcaseSpaces with hover preview fields, fix Decimal conversions"
```

---

### Task 3: SpaceCard の Client Component 化 + ホバーオーバーレイ

**Files:**

- Modify: `src/app/(public)/spaces/_components/space-card.tsx`

ホバー用の新 props（`locationName`, `lineAddress`, `facilities`, `dailyPrice`）は **optional** にする。`RelatedSpaces` 等ホバーデータを持たない利用箇所では props を渡さず、オーバーレイは表示されない。

- [ ] **Step 1: `"use client"` 追加、import 追加、props 拡張**

```typescript
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Users, Ruler } from "lucide-react";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";

interface SpaceCardProps {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly mainImageUrl: string;
  readonly categoryName?: string | null | undefined;
  // Hover preview data (optional — overlay only renders when all are provided)
  readonly locationName?: string | undefined;
  readonly lineAddress?: string | undefined;
  readonly facilities?: readonly string[] | undefined;
  readonly dailyPrice?: number | null | undefined;
}
```

- [ ] **Step 2: ホバーオーバーレイ表示判定フラグとタイマーロジックを追加**

コンポーネント本体の先頭に:

```typescript
const hasHoverData = locationName !== undefined && lineAddress !== undefined;
const [showOverlay, setShowOverlay] = useState(false);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handlePointerEnter = (e: React.PointerEvent) => {
  if (!hasHoverData || e.pointerType !== "mouse") return;
  timerRef.current = setTimeout(() => setShowOverlay(true), 2000);
};

const handlePointerLeave = () => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  setShowOverlay(false);
};
```

- [ ] **Step 3: Link にイベントハンドラを追加**

```tsx
<Link
  href={`/spaces/${slug}`}
  className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg"
  onPointerEnter={handlePointerEnter}
  onPointerLeave={handlePointerLeave}
  onFocus={() => { if (hasHoverData) setShowOverlay(true); }}
  onBlur={() => setShowOverlay(false)}
>
```

- [ ] **Step 4: 画像エリア内にオーバーレイを追加**

画像の `div` 内、`Image` と categoryName バッジの間にオーバーレイを配置。`hasHoverData` が false の場合はオーバーレイ自体をレンダリングしない:

```tsx
{
  /* Image */
}
<div className="relative aspect-[4/3] overflow-hidden">
  <Image
    src={mainImageUrl}
    alt={name}
    fill
    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
    className="object-cover transition-transform duration-500 group-hover:scale-105"
  />

  {/* Hover Preview Overlay */}
  {hasHoverData ? (
    <div
      aria-hidden="true"
      className={`absolute inset-0 flex flex-col justify-end bg-black/70 p-4 backdrop-blur-sm transition-opacity duration-300 motion-reduce:duration-0 ${
        showOverlay ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="space-y-2 text-sm text-white">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{locationName}</span>
        </div>
        <p className="text-xs text-white/80">{lineAddress}</p>

        {facilities && facilities.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {facilities.slice(0, 4).map((f) => (
              <span
                key={f}
                className="rounded bg-white/20 px-1.5 py-0.5 text-[11px]"
              >
                {f}
              </span>
            ))}
          </div>
        ) : null}

        {hourlyPrice != null ? (
          <div className="pt-1 text-xs font-medium">
            <span>&yen;{hourlyPrice.toLocaleString()}/h</span>
            {dailyPrice != null ? (
              <span className="ml-2 text-white/80">
                &yen;{dailyPrice.toLocaleString()}/day
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : null}

  {categoryName ? (
    <div className="absolute left-3 top-3">
      <Badge>{categoryName}</Badge>
    </div>
  ) : null}
</div>;
```

- [ ] **Step 5: type-check 実行**

Run: `bun run type-check`
Expected: PASS（既存の `RelatedSpaces` や `SpaceGrid` は optional props を渡さなくても型エラーにならない）

- [ ] **Step 6: コミット**

```bash
git add 'src/app/(public)/spaces/_components/space-card.tsx'
git commit -m "feat(spaces): add hover preview overlay to SpaceCard with optional props"
```

---

### Task 4: SpaceGrid の interface 拡張

**Files:**

- Modify: `src/app/(public)/spaces/_components/space-grid.tsx`

- [ ] **Step 1: `Space` interface に新フィールドを追加し、SpaceCard に渡す**

```typescript
interface Space {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly dailyPrice: number | null;
  readonly mainImageUrl: string;
  readonly facilities: readonly string[];
  readonly lineAddress: string;
  readonly location: { readonly name: string };
  readonly category: { readonly name: string } | null;
}
```

SpaceCard の呼び出しに新 props を追加:

```tsx
<SpaceCard
  key={space.id}
  slug={space.slug}
  name={space.name}
  description={space.description}
  capacity={space.capacity}
  area={space.area}
  hourlyPrice={space.hourlyPrice}
  dailyPrice={space.dailyPrice}
  mainImageUrl={space.mainImageUrl}
  categoryName={space.category?.name}
  locationName={space.location.name}
  lineAddress={space.lineAddress}
  facilities={space.facilities}
/>
```

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/spaces/_components/space-grid.tsx'
git commit -m "feat(spaces): pass hover preview data through SpaceGrid to SpaceCard"
```

---

### Task 5: SpaceShowcase を SpaceCard に統一

**Files:**

- Modify: `src/app/(public)/_components/homepage/space-showcase.tsx`

- [ ] **Step 1: SpaceCard を import し、インラインマークアップを置き換え、未使用 import を削除**

```tsx
import { getShowcaseSpaces } from "@/shared/domain/sections/queries";
import { Container } from "../../_shared/components/design-system/container";
import { Heading } from "../../_shared/components/design-system/heading";
import { Button } from "../../_shared/components/design-system/button";
import { Stack } from "../../_shared/components/design-system/stack";
import { ScrollReveal } from "../../_shared/components/animations/scroll-reveal";
import { SpaceCard } from "../../spaces/_components/space-card";

export async function SpaceShowcase() {
  const spaces = await getShowcaseSpaces(3, true);

  if (spaces.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface py-[var(--spacing-section)]">
      <Container>
        <Stack gap="xl" className="items-center">
          <ScrollReveal>
            <div className="text-center">
              <p className="mb-4 text-[length:var(--text-label)] font-medium uppercase tracking-[var(--tracking-wide)] text-muted-foreground">
                SPACES
              </p>
              <Heading level={2}>スペース一覧</Heading>
            </div>
          </ScrollReveal>

          <div className="grid w-full gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
            {spaces.map((space, i) => (
              <ScrollReveal key={space.id} delay={i * 0.1}>
                <SpaceCard
                  slug={space.slug}
                  name={space.name}
                  description={space.description}
                  capacity={space.capacity}
                  area={space.area}
                  hourlyPrice={space.hourlyPrice}
                  dailyPrice={space.dailyPrice}
                  mainImageUrl={space.mainImageUrl}
                  categoryName={space.category?.name}
                  locationName={space.location.name}
                  lineAddress={space.lineAddress}
                  facilities={space.facilities}
                />
              </ScrollReveal>
            ))}
          </div>

          <Button variant="secondary" size="lg" href="/spaces">
            すべてのスペースを見る
          </Button>
        </Stack>
      </Container>
    </section>
  );
}
```

`Image` と `Link` の import は不要になったため削除済み。

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_components/homepage/space-showcase.tsx'
git commit -m "refactor(homepage): replace inline card markup with SpaceCard component"
```

---

### Task 6: 全体検証

- [ ] **Step 1: validate 実行**

Run: `bun run validate`
Expected: PASS（type-check + lint）

- [ ] **Step 2: build 実行**

Run: `bun run build`
Expected: PASS

- [ ] **Step 3: lint エラーがあれば修正してコミット**

未使用 import 等が自動修正される場合あり。修正があればコミット。
