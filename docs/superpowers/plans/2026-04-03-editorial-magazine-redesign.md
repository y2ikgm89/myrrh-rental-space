# Editorial Magazine ホームページ刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ホームページを Concept D (Editorial Magazine) のデザインに全面刷新する。Kinfolk / Cereal 誌のような雑誌的レイアウト、大量の余白、Cormorant Garamond イタリック見出し、プルクオート、見開きスプレッドを実現する。

**Architecture:** `_components/homepage/` の全セクションコンポーネント（5ファイル）を削除して新規作成する破壊的変更。`page.tsx` も書き換え。デザインシステム Primitives（Heading, Container, Button, Stack）と共有アニメーション（ScrollReveal, SplitText, MagneticButton）は既存をそのまま活用。CSS テーマトークンは editorial 方向に調整。レイアウト（layout.tsx）・ヘッダー・フッターは変更しない。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4 (CSS-first @theme), GSAP 3.14, @tabler/icons-react 3.41

---

## ファイル構成

### 削除ファイル

| ファイル                                                       | 理由                    |
| -------------------------------------------------------------- | ----------------------- |
| `src/app/(public)/_components/homepage/hero-section.tsx`       | 全面書き換え            |
| `src/app/(public)/_components/homepage/philosophy-section.tsx` | 全面書き換え            |
| `src/app/(public)/_components/homepage/showcase-section.tsx`   | 全面書き換え            |
| `src/app/(public)/_components/homepage/showcase-cards.tsx`     | showcase-section に統合 |
| `src/app/(public)/_components/homepage/numbers-section.tsx`    | 全面書き換え            |
| `src/app/(public)/_components/homepage/cta-section.tsx`        | 全面書き換え            |

### 新規作成ファイル

| ファイル                                                      | 責務                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/app/(public)/_components/homepage/hero-section.tsx`      | 雑誌カバー風スプリットヒーロー（左画像 + 右テキスト）                         |
| `src/app/(public)/_components/homepage/pullquote-section.tsx` | 大きな引用テキスト（創業者の言葉）                                            |
| `src/app/(public)/_components/homepage/spaces-section.tsx`    | フィーチャードスプレッド + ずらしグリッド（Server Component + Client カード） |
| `src/app/(public)/_components/homepage/features-section.tsx`  | 番号付きリスト（editorial numbered list）                                     |
| `src/app/(public)/_components/homepage/stats-section.tsx`     | インライン統計（セリフ数字 + キャプション）                                   |
| `src/app/(public)/_components/homepage/cta-section.tsx`       | イタリック見出し + ボタン CTA                                                 |

### 変更ファイル

| ファイル                              | 変更内容                                                              |
| ------------------------------------- | --------------------------------------------------------------------- |
| `src/app/(public)/page.tsx`           | セクション構成を6セクションに変更、import パス更新                    |
| `src/app/(public)/_styles/public.css` | タイポグラフィ微調整（hero font-weight 300 化、line-height タイト化） |

### 変更しないファイル（整合性保証）

- `src/app/(public)/layout.tsx` — プロバイダー構成・ヘッダー・フッター
- `src/app/(public)/_shared/components/design-system/*` — Primitives 全て
- `src/app/(public)/_shared/components/animations/*` — ScrollReveal, SplitText, MagneticButton 等
- `src/app/(public)/_shared/components/layouts/*` — site-header, site-footer, mobile-nav
- `src/app/(public)/_shared/lib/animations.ts` — DURATION, EASE, STAGGER 定数
- `src/shared/domain/` — ドメイン層全体

---

## Task 1: 旧ホームページセクションの削除

**Files:**

- Delete: `src/app/(public)/_components/homepage/hero-section.tsx`
- Delete: `src/app/(public)/_components/homepage/philosophy-section.tsx`
- Delete: `src/app/(public)/_components/homepage/showcase-section.tsx`
- Delete: `src/app/(public)/_components/homepage/showcase-cards.tsx`
- Delete: `src/app/(public)/_components/homepage/numbers-section.tsx`
- Delete: `src/app/(public)/_components/homepage/cta-section.tsx`

- [ ] **Step 1: 6ファイルを削除**

```bash
git rm src/app/'(public)'/_components/homepage/hero-section.tsx
git rm src/app/'(public)'/_components/homepage/philosophy-section.tsx
git rm src/app/'(public)'/_components/homepage/showcase-section.tsx
git rm src/app/'(public)'/_components/homepage/showcase-cards.tsx
git rm src/app/'(public)'/_components/homepage/numbers-section.tsx
git rm src/app/'(public)'/_components/homepage/cta-section.tsx
```

- [ ] **Step 2: コミット**

```bash
git commit -m "chore(public): remove old homepage sections for editorial redesign"
```

---

## Task 2: CSS テーマ微調整

**Files:**

- Modify: `src/app/(public)/_styles/public.css`

editorial magazine デザインに合わせてタイポグラフィトークンを微調整する。

- [ ] **Step 1: `--text-hero` の font-weight を 300 に変更**

`@theme` 内の `--text-hero--font-weight` を確認し、300 でなければ 300 に変更する。

- [ ] **Step 2: `--text-h1` の font-weight を 300 に変更**

同様に `--text-h1--font-weight` を 300 に変更する。

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

Expected: PASS（CSS のみの変更なので型には影響しない）

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_styles/public.css
git commit -m "style(public): editorial typography — hero/h1 font-weight 300"
```

---

## Task 3: Hero セクション — 雑誌カバー風スプリット

**Files:**

- Create: `src/app/(public)/_components/homepage/hero-section.tsx`

左に全高画像、右にテキストコンテンツ（Volume 表記、巨大イタリック見出し、ゴールドダッシュ、本文、リンク）。

- [ ] **Step 1: hero-section.tsx を作成**

```tsx
"use client";

/**
 * HomepageHero — Magazine cover split layout
 *
 * Left: full-height image with credit overlay
 * Right: editorial text (issue label, italic heading, gold dash, excerpt, explore link)
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";

export function HomepageHero(): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          contentRef.current,
          { opacity: 0, y: REVEAL.fadeUp.y },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.3,
          },
        );
      });
    },
    { scope: contentRef },
  );

  return (
    <section
      className="grid min-h-[85vh] grid-cols-1 md:grid-cols-2"
      data-hero=""
    >
      {/* Left — Image */}
      <div className="relative min-h-[50vh] overflow-hidden bg-surface md:min-h-0">
        <Image
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"
          alt="自然光が差し込む開放的なレンタルスペース"
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
        <span className="absolute bottom-4 left-4 text-[0.55rem] uppercase tracking-[0.15em] text-background/50">
          Photography — Myrrh Studio, 2026
        </span>
      </div>

      {/* Right — Content */}
      <div
        ref={contentRef}
        className="flex flex-col justify-center bg-background px-6 py-12 md:px-12 md:py-16 lg:px-16"
      >
        <p className="mb-8 text-[0.55rem] uppercase tracking-[0.3em] text-muted-foreground md:mb-12">
          Volume One — Spring 2026
        </p>

        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight">
          <SplitText trigger={false} delay={0.5}>
            Where silence works.
          </SplitText>
        </h1>

        <div className="mt-6 h-px w-12 bg-accent md:mt-8" aria-hidden="true" />

        <ScrollReveal delay={0.3}>
          <p className="mt-6 max-w-[22rem] text-sm leading-[2.1] text-muted-foreground md:mt-8 md:text-base">
            静けさが仕事をする場所。Myrrh は光と余白を大切にした、
            思考のためのレンタルスペースです。
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.4}>
          <Link
            href="/spaces"
            className="group mt-8 inline-flex items-center gap-3 text-[0.65rem] uppercase tracking-[0.15em] text-foreground transition-[gap] duration-300 hover:gap-5 md:mt-10"
          >
            Explore spaces
            <span className="h-px w-8 bg-foreground transition-[width] duration-300 group-hover:w-12" />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/homepage/hero-section.tsx
git commit -m "feat(public): editorial hero — magazine cover split layout"
```

---

## Task 4: Pull Quote セクション

**Files:**

- Create: `src/app/(public)/_components/homepage/pullquote-section.tsx`

中央寄せの大きな引用テキスト。セリフイタリック。Philosophy セクションの代替。

- [ ] **Step 1: pullquote-section.tsx を作成**

```tsx
import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export function PullQuoteSection(): ReactElement {
  return (
    <section className="bg-surface px-4 py-[var(--spacing-section)]">
      <div className="mx-auto max-w-[50rem] text-center">
        <ScrollReveal>
          <span
            className="mb-6 block font-heading text-[5rem] leading-[0.5] text-accent/20"
            aria-hidden="true"
          >
            &ldquo;
          </span>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <p className="font-heading text-[clamp(1.5rem,2.5vw,2.25rem)] font-light italic leading-[1.7] text-foreground">
            良い空間とは、そこにいる人が
            <br className="hidden md:inline" />
            自分自身に集中できる場所のことだ。
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.2}>
          <p className="mt-6 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
            — Myrrh Founder
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/homepage/pullquote-section.tsx
git commit -m "feat(public): editorial pullquote section — centered serif italic"
```

---

## Task 5: Spaces セクション — フィーチャードスプレッド + ずらしグリッド

**Files:**

- Create: `src/app/(public)/_components/homepage/spaces-section.tsx`

最初のスペースをフルワイド「見開きスプレッド」（左画像 + 右テキスト + メタ情報）、残りを Kinfolk 風ずらし 2 カラムグリッドで表示。Server Component 部分と Client カード部分を 1 ファイルにまとめる（homepage 専用のため分離不要）。

- [ ] **Step 1: spaces-section.tsx を作成**

```tsx
import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/public/components/design-system/container";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export interface ShowcaseSpace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number;
  readonly hourlyPrice: number;
  readonly area: number | null;
  readonly mainImageUrl: string | null;
  readonly categoryName: string | null;
}

interface SpacesSectionProps {
  readonly spaces: readonly ShowcaseSpace[];
}

export function SpacesSection({ spaces }: SpacesSectionProps): ReactElement {
  const featured = spaces[0];
  const remaining = spaces.slice(1);

  return (
    <section className="py-[var(--spacing-section)]">
      {/* Section header */}
      <Container>
        <div className="mb-10 flex items-baseline justify-between border-b border-border pb-3 md:mb-14">
          <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
            Selected Spaces
          </span>
          <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
            {String(spaces.length).padStart(2, "0")} Selected
          </span>
        </div>
      </Container>

      {/* Featured spread */}
      {featured && (
        <div className="border-b border-border border-t">
          <ScrollReveal>
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[5fr_4fr]">
              {/* Image */}
              <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[28rem]">
                {featured.mainImageUrl ? (
                  <Image
                    src={featured.mainImageUrl}
                    alt={featured.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 55vw"
                  />
                ) : (
                  <div className="h-full w-full bg-surface" />
                )}
              </div>
              {/* Content */}
              <div className="flex flex-col justify-center px-6 py-8 md:px-10 md:py-12">
                <span className="font-heading text-[5rem] font-light leading-none text-border/60">
                  01
                </span>
                <h3 className="mt-3 font-heading text-[1.75rem] font-light tracking-tight">
                  {featured.name}
                </h3>
                {featured.description && (
                  <p className="mt-3 max-w-[22rem] text-[0.85rem] leading-[2.2] text-muted-foreground">
                    {featured.description}
                  </p>
                )}
                <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  {featured.area != null && (
                    <div>
                      <dt className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">
                        Area
                      </dt>
                      <dd className="text-[0.85rem]">{featured.area}m²</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">
                      Capacity
                    </dt>
                    <dd className="text-[0.85rem]">Max {featured.capacity}</dd>
                  </div>
                  {featured.categoryName && (
                    <div>
                      <dt className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">
                        Type
                      </dt>
                      <dd className="text-[0.85rem]">
                        {featured.categoryName}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-4 font-heading text-[1.25rem] text-accent">
                  ¥{featured.hourlyPrice.toLocaleString()}
                  <small className="ml-1 font-sans text-[0.7rem] text-muted-foreground">
                    /h
                  </small>
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      )}

      {/* Remaining — staggered 2-column grid */}
      {remaining.length > 0 && (
        <Container className="mt-10 md:mt-14">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10">
            {remaining.map((space, i) => (
              <ScrollReveal key={space.id} delay={(i + 1) * 0.1}>
                <Link
                  href={`/spaces/${space.slug}`}
                  className={`group block${i % 2 === 1 ? " md:mt-16" : ""}`}
                >
                  <div className="relative aspect-[3/2] overflow-hidden">
                    {space.mainImageUrl ? (
                      <Image
                        src={space.mainImageUrl}
                        alt={space.name}
                        fill
                        className="object-cover transition-opacity duration-400 group-hover:opacity-85"
                        sizes="(max-width: 640px) 100vw, 45vw"
                      />
                    ) : (
                      <div className="h-full w-full bg-surface" />
                    )}
                  </div>
                  {space.categoryName && (
                    <p className="mt-3 text-[0.55rem] uppercase tracking-[0.25em] text-accent">
                      {space.categoryName}
                    </p>
                  )}
                  <h3 className="mt-1 font-heading text-[1.25rem] font-light tracking-tight">
                    {space.name}
                  </h3>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    {space.area != null && `${space.area}m² · `}Max{" "}
                    {space.capacity} · ¥{space.hourlyPrice.toLocaleString()}/h
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      )}

      {/* View all link */}
      <Container className="mt-10 md:mt-14">
        <ScrollReveal>
          <div className="border-t border-border pt-6 text-right">
            <Link
              href="/spaces"
              className="group inline-flex items-center gap-3 text-[0.65rem] uppercase tracking-[0.15em] text-foreground transition-[gap] duration-300 hover:gap-5"
            >
              View all spaces
              <span className="h-px w-8 bg-foreground transition-[width] duration-300 group-hover:w-12" />
            </Link>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/homepage/spaces-section.tsx
git commit -m "feat(public): editorial spaces — featured spread + staggered grid"
```

---

## Task 6: Features セクション — 番号付き editorial リスト

**Files:**

- Create: `src/app/(public)/_components/homepage/features-section.tsx`

白背景のセクションに「Why Myrrh」見出し、番号付きリスト形式の特徴紹介。

- [ ] **Step 1: features-section.tsx を作成**

```tsx
import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

const FEATURES = [
  {
    title: "自然光設計",
    description:
      "全室に大きな窓を配置。時間帯で変化する光が、空間に深みを与えます。",
  },
  {
    title: "遮音性能",
    description:
      "プロフェッショナル水準の遮音設計。外部の喧騒を遮断し、深い集中を可能にします。",
  },
  {
    title: "即日予約",
    description:
      "オンラインで空き状況確認から決済まで完結。当日予約にも対応しています。",
  },
  {
    title: "柔軟なレイアウト",
    description:
      "可動式の家具と設備で、会議・撮影・イベントなど用途に合わせた配置変更が可能です。",
  },
] as const;

export function FeaturesSection(): ReactElement {
  return (
    <section className="bg-background py-[var(--spacing-section)]">
      <div className="mx-auto max-w-[40rem] px-4 md:px-6">
        <ScrollReveal>
          <div className="mb-10 text-center md:mb-14">
            <h2 className="text-h2 font-heading font-light tracking-tight">
              Why Myrrh
            </h2>
          </div>
        </ScrollReveal>

        <div>
          {FEATURES.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={i * 0.08}>
              <div
                className={`grid grid-cols-[3rem_1fr] gap-4 py-6 md:gap-6 md:py-8${
                  i === 0 ? " border-t border-border" : ""
                } border-b border-border`}
              >
                <span className="text-right font-heading text-[1.5rem] font-light leading-[1.3] text-border">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[0.9rem] font-normal tracking-[0.02em]">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-[0.8rem] leading-[1.9] text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/homepage/features-section.tsx
git commit -m "feat(public): editorial features — numbered list layout"
```

---

## Task 7: Stats セクション — インライン統計

**Files:**

- Create: `src/app/(public)/_components/homepage/stats-section.tsx`

ボーダーで区切られた横並び統計。セリフ数字 + 小さなキャプション。

- [ ] **Step 1: stats-section.tsx を作成**

```tsx
"use client";

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import {
  DURATION,
  EASE,
  REVEAL,
  STAGGER,
  SCROLL_TRIGGER,
} from "@/public/lib/animations";

const STATS = [
  { value: "12", label: "Spaces" },
  { value: "2,400+", label: "Bookings" },
  { value: "98%", label: "Satisfaction" },
  { value: "4.8", label: "Rating" },
] as const;

export function StatsSection(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = ref.current?.querySelectorAll("[data-stat]");
        if (!items?.length) return;
        gsap.fromTo(
          items,
          { y: REVEAL.fadeUp.y * 0.5, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.outQuart,
            stagger: STAGGER.element,
            scrollTrigger: { trigger: ref.current, ...SCROLL_TRIGGER.reveal },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="mx-auto max-w-[60rem] px-4 md:px-6">
      <div className="flex flex-wrap justify-center gap-x-10 gap-y-6 border-b border-t border-border py-8 md:gap-x-16 md:py-10">
        {STATS.map((stat) => (
          <div key={stat.label} data-stat="" className="text-center">
            <div className="font-heading text-[clamp(2rem,4vw,3rem)] font-light leading-none">
              {stat.value}
            </div>
            <div className="mt-2 text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/homepage/stats-section.tsx
git commit -m "feat(public): editorial stats — inline serif numbers"
```

---

## Task 8: CTA セクション — editorial CTA

**Files:**

- Create: `src/app/(public)/_components/homepage/cta-section.tsx`

中央寄せのイタリック見出し + 本文 + ボタン。シンプルで余白多め。

- [ ] **Step 1: cta-section.tsx を作成**

```tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export function CtaSection(): ReactElement {
  return (
    <section className="px-4 py-[var(--spacing-section)] text-center">
      <p className="mb-5 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
        Reservation
      </p>

      <h2 className="font-heading text-[clamp(2rem,3.5vw,3rem)] font-light italic leading-[1.25] tracking-tight">
        <SplitText>Find your perfect room</SplitText>
      </h2>

      <ScrollReveal delay={0.2}>
        <p className="mx-auto mt-5 max-w-[22rem] text-[0.85rem] leading-[2] text-muted-foreground">
          空き状況の確認から予約まで、オンラインで完結。
          まずは空間をご覧ください。
        </p>
      </ScrollReveal>

      <ScrollReveal delay={0.3}>
        <Link
          href="/spaces"
          className="mt-8 inline-block border border-foreground px-8 py-3 text-[0.65rem] uppercase tracking-[0.18em] text-foreground transition-colors duration-300 hover:bg-foreground hover:text-background"
        >
          View All Spaces
        </Link>
      </ScrollReveal>
    </section>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/homepage/cta-section.tsx
git commit -m "feat(public): editorial CTA — italic heading + bordered button"
```

---

## Task 9: page.tsx の書き換え — 6 セクション構成

**Files:**

- Modify: `src/app/(public)/page.tsx`

旧 5 セクション → 新 6 セクション（Hero, PullQuote, Spaces, Features, Stats, CTA）に変更。

- [ ] **Step 1: page.tsx を書き換え**

```tsx
/**
 * Homepage — Editorial Magazine layout
 *
 * 6-section composition:
 * 1. Hero — magazine cover split (image + text)
 * 2. PullQuote — centered serif italic quote
 * 3. Spaces — featured spread + staggered grid
 * 4. Features — numbered editorial list
 * 5. Stats — inline serif numbers
 * 6. CTA — italic heading + bordered button
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getShowcaseSpaces } from "@/shared/domain/sections/queries";

import { HomepageHero } from "./_components/homepage/hero-section";
import { PullQuoteSection } from "./_components/homepage/pullquote-section";
import {
  SpacesSection,
  type ShowcaseSpace,
} from "./_components/homepage/spaces-section";
import { FeaturesSection } from "./_components/homepage/features-section";
import { StatsSection } from "./_components/homepage/stats-section";
import { CtaSection } from "./_components/homepage/cta-section";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, rawSpaces] = await Promise.all([
    getWebSiteJsonLdData(),
    getShowcaseSpaces(6, true),
  ]);

  const spaces: ShowcaseSpace[] = rawSpaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    capacity: s.capacity,
    hourlyPrice: s.hourlyPrice,
    area: s.area,
    mainImageUrl: s.mainImageUrl,
    categoryName: s.category?.name ?? null,
  }));

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <HomepageHero />
      <PullQuoteSection />
      <SpacesSection spaces={spaces} />
      <FeaturesSection />
      <StatsSection />
      <CtaSection />
    </>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/page.tsx
git commit -m "feat(public): editorial homepage — 6-section magazine composition"
```

---

## Task 10: 全体検証 + ビルド

- [ ] **Step 1: validate + build**

```bash
bun run validate && bun run build:skip-env
```

Expected: PASS（型チェック + lint + ビルド全て通る）

- [ ] **Step 2: Anti-AI セルフレビュー（6問チェック）**

1. タイポグラフィに serif/sans の対比があるか？ → **yes**（Cormorant italic 見出し + Noto Sans 本文）
2. Accent カラーが控えめ（15% 以下）か？ → **yes**（accent はダッシュ・価格・カテゴリのみ）
3. セクション間で padding に変化があるか？ → **yes**（Hero は min-h-[85vh]、他は spacing-section）
4. アニメーションに主役/脇役の差があるか？ → **yes**（SplitText = 主役、ScrollReveal = 脇役）
5. カードに hover インタラクションがあるか？ → **yes**（opacity 変化 + gap 遷移）
6. SectionLabel に統一された装飾があるか？ → **yes**（uppercase tracking + 薄い境界線で統一）

6/6 PASS

- [ ] **Step 3: 完了コミット（必要なら）**

全タスクが個別コミット済みなので追加不要。

---

## 管理画面整合性チェックリスト

| チェック項目                                                                      | 結果              |
| --------------------------------------------------------------------------------- | ----------------- |
| `ShowcaseSpace` 型の互換性（旧: page.tsx 内定義 → 新: spaces-section.tsx 内定義） | ✅ 同一フィールド |
| `getShowcaseSpaces()` の引数・戻り値に変更なし                                    | ✅ 安全           |
| layout.tsx のプロバイダー構成に変更なし                                           | ✅ 安全           |
| ヘッダー・フッターに変更なし                                                      | ✅ 安全           |
| 他の公開ページ（/spaces, /reservation, /contact 等）に影響なし                    | ✅ 安全           |
| SEO（generateMetadata, WebSiteJsonLd）に変更なし                                  | ✅ 安全           |
| animations.ts の定数使用方法に変更なし                                            | ✅ 安全           |
| Design System Primitives (Heading, Container) の使用に変更なし                    | ✅ 安全           |
