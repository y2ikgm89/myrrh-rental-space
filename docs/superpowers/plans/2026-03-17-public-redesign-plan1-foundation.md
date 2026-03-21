# Public Pages Redesign — Plan 1: Foundation + Homepage

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Design System,共通レイアウト、コンテンツ基盤、ホームページを構築し、Page-First Architecture の基盤を確立する

**Architecture:** 公開ページを汎用セクション CMS から Page-First に移行。`public.css` のデザイントークンを刷新し、Design System Primitives で全ページの一貫性を担保。`PageContent` Prisma モデルでページ固有コンテンツを管理。トップページを最初の実装として基盤を実証する。

**Tech Stack:** Next.js 16.1.6 (PPR, `'use cache'`, `cacheTag`/`updateTag`) / React 19.2 (Compiler, `useActionState`, `useEffectEvent`) / Tailwind CSS 4.2 (CSS-first `@theme`) / Prisma 7.5 / GSAP 3.14 + Lenis 1.3 / Zod 4.3 / bun:test

**Spec:** `docs/superpowers/specs/2026-03-16-public-pages-redesign.md`

**Subsequent Plans:**

- Plan 2: スペース一覧・詳細 + 予約フロー
- Plan 3: コンテンツページ群（ニュース、ブログ、FAQ 等）
- Plan 4: レガシー削除 + E2E + パフォーマンス最適化

---

## Chunk 1: Design Tokens + Design System Primitives

### Task 1: Design Tokens (public.css 刷新)

**Files:**

- Modify: `src/app/(public)/_styles/public.css`

**Context:** 現在の `public.css` (222行) は Champagne Gold テーマ。Deep Neutral + Warm Accent に全面書き換え。`@theme` ブロックでトークン定義、`@layer base` でグローバルスタイル、`@layer compat` で旧トークンのエイリアス（`[...segments]` カスタムページ互換用）。

- [ ] **Step 1: 現在の public.css を読む**

```bash
# 現在のトークン構造を把握する
```

Read: `src/app/(public)/_styles/public.css`

- [ ] **Step 2: public.css を書き換え — @theme ブロック**

`@import "tailwindcss"` の後に `@theme` を定義。スペックの Section 2.1〜2.4 のトークンをすべて含める。

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  /* === Colors === */
  --color-background: oklch(0.985 0 0);
  --color-surface: oklch(0.96 0.005 80);
  --color-foreground: oklch(0.15 0.01 250);
  --color-muted-foreground: oklch(0.55 0.01 250);
  --color-border: oklch(0.88 0.005 80);

  --color-accent: oklch(0.45 0.03 60);
  --color-accent-light: oklch(0.94 0.015 60);
  --color-accent-foreground: oklch(0.985 0 0);

  --color-card: oklch(0.985 0 0);
  --color-card-foreground: oklch(0.15 0.01 250);
  --color-overlay: oklch(0 0 0 / 0.6);

  --color-success: oklch(0.55 0.15 145);
  --color-warning: oklch(0.7 0.15 70);
  --color-destructive: oklch(0.55 0.2 25);
  --color-info: oklch(0.55 0.1 250);

  /* === Typography === */
  --font-sans: "Noto Sans JP", sans-serif;
  --font-serif: "Noto Serif JP", serif;

  --text-hero: clamp(2.5rem, 5vw + 1rem, 4.5rem);
  --text-h1: clamp(2rem, 3vw + 0.5rem, 3rem);
  --text-h2: clamp(1.5rem, 2vw + 0.5rem, 2.25rem);
  --text-h3: clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem);
  --text-body: 1rem;
  --text-small: 0.875rem;
  --text-label: 0.6875rem;

  --leading-tight: 1.3;
  --leading-normal: 1.8;
  --leading-relaxed: 2;

  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.1em;

  /* === Spacing === */
  --spacing-section: clamp(5rem, 8vw, 7.5rem);
  --spacing-block: clamp(2rem, 4vw, 3rem);
  --spacing-element: 1.5rem;
  --spacing-inline: 1rem;

  --container-max: 80rem;
  --container-padding: clamp(1.5rem, 3vw, 3rem);

  /* === Radii === */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px oklch(0 0 0 / 0.07);
  --shadow-lg: 0 10px 15px oklch(0 0 0 / 0.1);
  --shadow-card: 0 1px 3px oklch(0 0 0 / 0.04), 0 1px 2px oklch(0 0 0 / 0.06);

  /* === Layout === */
  --header-height: 64px;
}
```

- [ ] **Step 3: @layer base — グローバルスタイル**

```css
@layer base {
  html {
    scroll-behavior: smooth;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    font-family: var(--font-sans);
    color: var(--color-foreground);
    background-color: var(--color-background);
    line-height: var(--leading-normal);
  }

  /* Lenis (desktop only) */
  html.lenis {
    height: auto;
  }
  html.lenis,
  html.lenis body {
    scroll-behavior: auto;
  }

  /* Focus visible */
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

- [ ] **Step 4: @layer compat — 旧トークンエイリアス**

`[...segments]` カスタムページのセクションコンポーネントが旧トークンを参照するため。

```css
@layer compat {
  :root {
    --color-primary: var(--color-accent);
    --color-primary-dark: var(--color-accent);
    --color-brand-primary: var(--color-accent);
    --color-brand-secondary: var(--color-accent);
  }
}
```

- [ ] **Step 5: @layer utilities — ユーティリティクラス**

```css
@layer utilities {
  .font-heading {
    font-family: var(--font-serif);
    letter-spacing: var(--tracking-tight);
  }
}
```

- [ ] **Step 6: type-check で既存コードとの互換性確認**

Run: `bun run type-check`

旧トークンを直接参照する Tailwind クラス（`text-primary`, `bg-primary-dark` 等）がエラーになる場合は `@layer compat` にクラスエイリアスを追加して対応。

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/_styles/public.css'
git commit -m "feat(public): rewrite design tokens — Deep Neutral + Warm Accent theme"
```

---

### Task 2: Design System Primitives — Container, Stack, Heading

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/container.tsx`
- Create: `src/app/(public)/_shared/components/design-system/stack.tsx`
- Create: `src/app/(public)/_shared/components/design-system/heading.tsx`
- Create: `src/app/(public)/_shared/components/design-system/__tests__/container.test.tsx`
- Create: `src/app/(public)/_shared/components/design-system/__tests__/heading.test.tsx`

**Context:** Layout と Typography のプリミティブ。全ページで使用するため最初に作る。

- [ ] **Step 1: Container のテストを書く**

```typescript
// __tests__/container.test.tsx
import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { Container } from "../container"

describe("Container", () => {
  it("renders with default max-width and padding", () => {
    const { container } = render(<Container>content</Container>)
    const el = container.firstElementChild
    expect(el?.className).toContain("max-w-[var(--container-max)]")
    expect(el?.className).toContain("mx-auto")
  })

  it("renders narrow variant", () => {
    const { container } = render(<Container variant="narrow">content</Container>)
    const el = container.firstElementChild
    expect(el?.className).toContain("max-w-3xl")
  })

  it("renders wide variant", () => {
    const { container } = render(<Container variant="wide">content</Container>)
    const el = container.firstElementChild
    expect(el?.className).toContain("max-w-screen-2xl")
  })
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `bun test src/app/'(public)'/_shared/components/design-system/__tests__/container.test.tsx`

- [ ] **Step 3: Container 実装**

```typescript
// container.tsx
import type { ReactNode } from "react"

type ContainerVariant = "default" | "narrow" | "wide"

const variantClasses: Record<ContainerVariant, string> = {
  default: "max-w-[var(--container-max)]",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
}

interface ContainerProps {
  readonly children: ReactNode
  readonly variant?: ContainerVariant
  readonly className?: string
  readonly as?: "div" | "section" | "article"
}

export function Container({
  children,
  variant = "default",
  className = "",
  as: Tag = "div",
}: ContainerProps) {
  return (
    <Tag
      className={`mx-auto px-[var(--container-padding)] ${variantClasses[variant]} ${className}`.trim()}
    >
      {children}
    </Tag>
  )
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `bun test src/app/'(public)'/_shared/components/design-system/__tests__/container.test.tsx`

- [ ] **Step 5: Heading のテストを書く**

```typescript
// __tests__/heading.test.tsx
import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { Heading } from "../heading"

describe("Heading", () => {
  it("renders h1 with hero size", () => {
    const { container } = render(<Heading level={1}>Title</Heading>)
    const el = container.querySelector("h1")
    expect(el).not.toBeNull()
    expect(el?.className).toContain("font-heading")
  })

  it("renders h2 with correct tag", () => {
    const { container } = render(<Heading level={2}>Subtitle</Heading>)
    expect(container.querySelector("h2")).not.toBeNull()
  })

  it("accepts className override", () => {
    const { container } = render(<Heading level={1} className="custom">T</Heading>)
    expect(container.querySelector("h1")?.className).toContain("custom")
  })
})
```

- [ ] **Step 6: Heading 実装**

```typescript
// heading.tsx
import type { ReactNode } from "react"

type HeadingLevel = 1 | 2 | 3 | 4

const levelClasses: Record<HeadingLevel, string> = {
  1: "text-[length:var(--text-h1)] font-bold leading-[var(--leading-tight)]",
  2: "text-[length:var(--text-h2)] font-bold leading-[var(--leading-tight)]",
  3: "text-[length:var(--text-h3)] font-semibold leading-[var(--leading-tight)]",
  4: "text-lg font-semibold leading-[var(--leading-tight)]",
}

interface HeadingProps {
  readonly level: HeadingLevel
  readonly children: ReactNode
  readonly className?: string
}

export function Heading({ level, children, className = "" }: HeadingProps) {
  const Tag = `h${level}` as const
  return (
    <Tag className={`font-heading tracking-[var(--tracking-tight)] ${levelClasses[level]} ${className}`.trim()}>
      {children}
    </Tag>
  )
}
```

- [ ] **Step 7: Stack 実装（テスト省略 — 単純なレイアウトユーティリティ）**

```typescript
// stack.tsx
import type { ReactNode } from "react"

type StackDirection = "vertical" | "horizontal"
type StackGap = "none" | "sm" | "md" | "lg" | "xl" | "section"

const gapClasses: Record<StackGap, string> = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
  section: "gap-[var(--spacing-section)]",
}

interface StackProps {
  readonly children: ReactNode
  readonly direction?: StackDirection
  readonly gap?: StackGap
  readonly className?: string
  readonly as?: "div" | "section" | "ul" | "nav"
}

export function Stack({
  children,
  direction = "vertical",
  gap = "md",
  className = "",
  as: Tag = "div",
}: StackProps) {
  const dirClass = direction === "vertical" ? "flex flex-col" : "flex flex-row"
  return (
    <Tag className={`${dirClass} ${gapClasses[gap]} ${className}`.trim()}>
      {children}
    </Tag>
  )
}
```

- [ ] **Step 8: 全テスト通過を確認**

Run: `bun test src/app/'(public)'/_shared/components/design-system/`

- [ ] **Step 9: Commit**

```bash
git add 'src/app/(public)/_shared/components/design-system/'
git commit -m "feat(public): add Container, Stack, Heading design system primitives"
```

---

### Task 3: Design System Primitives — Button, Card, Badge, Prose, ImageFrame

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/button.tsx`
- Create: `src/app/(public)/_shared/components/design-system/card.tsx`
- Create: `src/app/(public)/_shared/components/design-system/badge.tsx`
- Create: `src/app/(public)/_shared/components/design-system/prose.tsx`
- Create: `src/app/(public)/_shared/components/design-system/image-frame.tsx`
- Create: `src/app/(public)/_shared/components/design-system/__tests__/button.test.tsx`
- Create: `src/app/(public)/_shared/components/design-system/__tests__/card.test.tsx`
- Create: `src/app/(public)/_shared/components/design-system/index.ts` (barrel)

**Context:** インタラクティブコンポーネント。Button は CTA に、Card はスペース/記事カードに使用。

- [ ] **Step 1: Button テスト**

```typescript
// __tests__/button.test.tsx
import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { Button } from "../button"

describe("Button", () => {
  it("renders primary variant with accent bg", () => {
    render(<Button variant="primary">予約する</Button>)
    const btn = screen.getByRole("button", { name: "予約する" })
    expect(btn.className).toContain("bg-accent")
  })

  it("renders as anchor when href provided", () => {
    render(<Button variant="primary" href="/reservation">予約する</Button>)
    const link = screen.getByRole("link", { name: "予約する" })
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("href")).toBe("/reservation")
  })

  it("has minimum touch target size", () => {
    render(<Button variant="primary">CTA</Button>)
    const btn = screen.getByRole("button")
    expect(btn.className).toContain("min-h-11") // 44px
  })
})
```

- [ ] **Step 2: Button 実装**

```typescript
// button.tsx
import Link from "next/link"
import type { ReactNode } from "react"

type ButtonVariant = "primary" | "secondary" | "ghost" | "link"
type ButtonSize = "sm" | "md" | "lg"

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg shadow-sm",
  secondary:
    "border border-border bg-transparent text-foreground hover:bg-surface rounded-lg",
  ghost: "bg-transparent text-foreground hover:bg-surface rounded-lg",
  link: "text-accent underline underline-offset-4 hover:text-accent/80 p-0",
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm min-h-9",
  md: "px-5 py-2.5 text-base min-h-11",
  lg: "px-7 py-3 text-lg min-h-12",
}

interface ButtonBaseProps {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly children: ReactNode
  readonly className?: string
}

interface ButtonAsButton extends ButtonBaseProps {
  readonly href?: undefined
  readonly type?: "button" | "submit"
  readonly disabled?: boolean
  readonly onClick?: () => void
}

interface ButtonAsLink extends ButtonBaseProps {
  readonly href: string
}

type ButtonProps = ButtonAsButton | ButtonAsLink

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const classes =
    `inline-flex items-center justify-center font-medium transition-colors duration-200 ${variantClasses[variant]} ${variant !== "link" ? sizeClasses[size] : ""} ${className}`.trim()

  if ("href" in rest && rest.href) {
    return (
      <Link href={rest.href} className={classes}>
        {children}
      </Link>
    )
  }

  const { type = "button", disabled, onClick } = rest as ButtonAsButton
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${classes} disabled:opacity-50 disabled:pointer-events-none`}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 3: Card テスト + 実装**

Card: `bg-card border border-border rounded-lg shadow-card` + hover: `hover:shadow-lg hover:scale-[1.02] transition-all duration-300`。`href` prop でクリッカブル。

- [ ] **Step 4: Badge 実装**

Badge: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium`。variant: `default`, `success`, `warning`, `info`。

- [ ] **Step 5: Prose 実装**

```typescript
// prose.tsx
import type { ReactNode } from "react"

interface ProseProps {
  readonly children: ReactNode
  readonly className?: string
}

export function Prose({ children, className = "" }: ProseProps) {
  return (
    <div
      className={`prose prose-neutral max-w-[65ch] leading-[var(--leading-normal)] ${className}`.trim()}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 6: ImageFrame 実装**

`next/image` + `aspect-ratio` + skeleton loading placeholder。`sizes` prop 必須（Next.js 公式推奨）。

```typescript
// image-frame.tsx
import Image from "next/image"

type AspectRatio = "video" | "square" | "portrait" | "wide"

const aspectClasses: Record<AspectRatio, string> = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[2/1]",
}

interface ImageFrameProps {
  readonly src: string
  readonly alt: string
  readonly width: number
  readonly height: number
  readonly aspect?: AspectRatio
  readonly sizes: string
  readonly priority?: boolean
  readonly className?: string
}

export function ImageFrame({
  src,
  alt,
  width,
  height,
  aspect,
  sizes,
  priority = false,
  className = "",
}: ImageFrameProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-surface ${aspect ? aspectClasses[aspect] : ""} ${className}`.trim()}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
```

- [ ] **Step 7: Barrel export (index.ts)**

```typescript
// index.ts
export { Button } from "./button";
export { Card } from "./card";
export { Badge } from "./badge";
export { Container } from "./container";
export { Heading } from "./heading";
export { ImageFrame } from "./image-frame";
export { Prose } from "./prose";
export { Stack } from "./stack";
```

- [ ] **Step 8: 全テスト実行**

Run: `bun test src/app/'(public)'/_shared/components/design-system/`

- [ ] **Step 9: Commit**

```bash
git add 'src/app/(public)/_shared/components/design-system/'
git commit -m "feat(public): add Button, Card, Badge, Prose, ImageFrame primitives"
```

---

### Task 4: Animation Constants + Primitives

**Files:**

- Modify: `src/app/(public)/_shared/lib/animations.ts`
- Create: `src/app/(public)/_shared/components/animations/scroll-reveal.tsx`
- Create: `src/app/(public)/_shared/components/animations/fade-in.tsx`
- Modify: `src/app/(public)/_shared/components/animations/ParallaxImage.tsx` → rename to `parallax-layer.tsx`
- Modify: `src/app/(public)/_shared/components/animations/SplitText.tsx` → rename to `split-text.tsx`

**Context:** 既存のアニメーション定数を簡素化。既存の ScrollReveal, SplitText, ParallaxImage を kebab-case にリネーム + リファクタリング。新規 FadeIn を追加。

- [ ] **Step 1: animations.ts を読んでリファクタリング**

Read: `src/app/(public)/_shared/lib/animations.ts`

既存の定数を簡素化（スペック Section 2.5 に準拠）。不要な定数を削除。

- [ ] **Step 2: animations.ts を書き換え**

```typescript
// animations.ts — simplified
export const DURATION = {
  fast: 0.3,
  normal: 0.6,
  slow: 0.8,
  hero: 1.2,
} as const;

export const EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
  elastic: "elastic.out(1, 0.3)",
} as const;

export const STAGGER = {
  char: 0.03,
  word: 0.06,
  card: 0.1,
} as const;

export const SCROLL_TRIGGER = {
  reveal: {
    start: "top 85%",
    toggleActions: "play none none none",
  },
} as const;

export type Duration = (typeof DURATION)[keyof typeof DURATION];
export type Ease = (typeof EASE)[keyof typeof EASE];
```

- [ ] **Step 3: ScrollReveal をリファクタリング**

既存の ScrollReveal.tsx を読み、`scroll-reveal.tsx` として再実装。`useGSAP` + `ScrollTrigger` + `prefers-reduced-motion` 対応。

- [ ] **Step 4: FadeIn を新規作成**

CSS animation ベースのシンプルなフェードイン（GSAP 不要）。IntersectionObserver で発火。

- [ ] **Step 5: 既存 ParallaxImage, SplitText を kebab-case にリネーム**

ファイル名変更 + import パス更新。既存の機能は維持、定数参照を新 `animations.ts` に更新。

- [ ] **Step 6: type-check**

Run: `bun run type-check`

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/_shared/lib/animations.ts' 'src/app/(public)/_shared/components/animations/'
git commit -m "refactor(public): simplify animation constants and rename to kebab-case"
```

---

## Chunk 2: Layout Components

### Task 5: PageHero コンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/page-hero.tsx`
- Create: `src/app/(public)/_shared/components/layouts/__tests__/page-hero.test.tsx`

**Context:** 2つのバリアント: `full`（画像背景 + オーバーレイ + SplitText）と `compact`（タイトル + パンくず、背景なし）。Server Component。

- [ ] **Step 1: テスト**

```typescript
import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { PageHero } from "../page-hero"

describe("PageHero", () => {
  it("renders compact variant with title", () => {
    render(<PageHero variant="compact" title="スペース一覧" />)
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined()
  })

  it("renders full variant with background image", () => {
    render(
      <PageHero
        variant="full"
        title="Myrrh"
        subtitle="特別な空間で、特別な時間を"
        image={{ src: "/hero.jpg", alt: "Hero", width: 1920, height: 1080 }}
      />,
    )
    expect(screen.getByRole("img")).toBeDefined()
  })
})
```

- [ ] **Step 2: 実装**

`full` variant: `relative min-h-[80vh]` with `next/image` as background (`fill`, `object-cover`), overlay (`bg-overlay`), SplitText for title, CTA Button.

`compact` variant: `py-[var(--spacing-block)] bg-surface`, Container + Heading h1 + optional breadcrumb slot.

- [ ] **Step 3: テスト通過 + Commit**

---

### Task 6: SiteHeader（リファクタリング）

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/Header.tsx`

**Context:** 既存の Header (386行) をリファクタリング。デザイントークンを新テーマに更新。構造は維持（scroll behavior, mobile menu, GSAP）。カラー参照を `accent`/`foreground` 系に変更。Header に常時「予約する」CTA ボタンを追加。

- [ ] **Step 1: 既存 Header.tsx を読む**

- [ ] **Step 2: カラートークン参照を更新**

旧: `text-primary-dark`, `bg-primary` 等
新: `text-accent`, `bg-accent` 等

- [ ] **Step 3: 予約 CTA ボタンを追加**

デスクトップ: ナビリンクの右に `<Button variant="primary" size="sm" href="/reservation">予約する</Button>`
モバイル: メニュー内の最上部に CTA

- [ ] **Step 4: type-check + ビルド確認**

Run: `bun run type-check`

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/_shared/components/layouts/Header.tsx'
git commit -m "refactor(public): update Header to new design tokens + add reservation CTA"
```

---

### Task 7: SiteFooter（リファクタリング）

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/Footer.tsx`

**Context:** 既存の Footer (359行) のカラートークンを新テーマに更新。構造は維持（3-column, microdata, hours）。

- [ ] **Step 1: Footer.tsx のカラートークン参照を更新**

- [ ] **Step 2: type-check + Commit**

---

### Task 8: SiteCTA コンポーネント（新規）

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/site-cta.tsx`

**Context:** 全ページ共通の予約誘導セクション。`bg-surface` 背景、見出し + ボタン群。Server Component。

- [ ] **Step 1: 実装**

```typescript
// site-cta.tsx
import { Container } from "../design-system/container"
import { Heading } from "../design-system/heading"
import { Button } from "../design-system/button"
import { Stack } from "../design-system/stack"

interface SiteCTAProps {
  readonly heading?: string
  readonly body?: string
  readonly primaryHref?: string
  readonly primaryLabel?: string
}

export function SiteCTA({
  heading = "ご予約・お問い合わせ",
  body = "お気軽にご相談ください",
  primaryHref = "/reservation",
  primaryLabel = "予約する",
}: SiteCTAProps) {
  return (
    <section className="bg-surface py-[var(--spacing-section)]">
      <Container>
        <Stack gap="lg" className="items-center text-center">
          <Heading level={2}>{heading}</Heading>
          {body ? (
            <p className="text-muted-foreground max-w-[50ch]">{body}</p>
          ) : null}
          <Stack direction="horizontal" gap="md">
            <Button variant="primary" size="lg" href={primaryHref}>
              {primaryLabel}
            </Button>
            <Button variant="secondary" size="lg" href="/contact">
              お問い合わせ
            </Button>
          </Stack>
        </Stack>
      </Container>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

---

### Task 9: Breadcrumb コンポーネント（新規）

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/breadcrumb.tsx`

**Context:** JSON-LD BreadcrumbList 付きパンくずリスト。全ページ（トップ除く）に表示。

- [ ] **Step 1: 実装**

ホームアイコン + セパレータ + パス配列。`BreadcrumbJsonLd` を内部で出力。

- [ ] **Step 2: Commit**

---

### Task 10: MobileNav（新規）

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/mobile-nav.tsx`

**Context:** モバイル下部固定ナビ（4アイコン: ホーム / スペース / 予約 / メニュー）。`"use client"` Client Component。

- [ ] **Step 1: 実装**

`fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border`。4アイコン: `Home`, `LayoutGrid`, `CalendarCheck`, `Menu` (Lucide)。現在のパスで active 状態を切り替え。

- [ ] **Step 2: Commit**

---

### Task 11: Layout.tsx リファクタリング

**Files:**

- Modify: `src/app/(public)/layout.tsx`

**Context:** ExperienceShell を削除し、必要な Provider のみ直接配置。Lenis をデスクトップのみで初期化する LenisProvider を追加。MobileNav を追加。

- [ ] **Step 1: 既存 layout.tsx を読む**
- [ ] **Step 2: ExperienceShell の import を削除**

ExperienceShell を import している箇所を特定し、layout.tsx から Lenis の初期化を直接行うクライアントコンポーネントに置換。

- [ ] **Step 3: LenisProvider を作成**

既存の `SmoothScrollProvider.tsx` をベースに、モバイル無効化ロジックを追加。`window.matchMedia('(min-width: 768px)')` でデスクトップのみ Lenis を初期化。

```
Create: src/app/(public)/_shared/components/providers/LenisProvider.tsx
```

- [ ] **Step 4: layout.tsx を更新**

```typescript
// 簡素化された構造
<html lang="ja" className={`${notoSansJP.variable} ${notoSerifJP.variable}`}>
  <body>
    <Suspense>
      <AriaLiveProvider>
        <div className="flex min-h-screen flex-col">
          <SkipLink />
          <AnnouncementBarWrapper />
          <Suspense fallback={null}>
            <HeaderWithData />
          </Suspense>
          <main id="main-content" className="flex-1">
            <LenisProvider>
              <NuqsAdapter>{children}</NuqsAdapter>
            </LenisProvider>
          </main>
          <Footer />
          <MobileNav />
          <Suspense fallback={null}>
            <DynamicContent />
          </Suspense>
          <AriaLiveRegion />
        </div>
      </AriaLiveProvider>
    </Suspense>
  </body>
</html>
```

- [ ] **Step 5: type-check + build**

Run: `bun run validate`

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(public)/layout.tsx' 'src/app/(public)/_shared/components/providers/' 'src/app/(public)/_shared/components/layouts/'
git commit -m "refactor(public): simplify layout — remove ExperienceShell, add LenisProvider + MobileNav"
```

---

## Chunk 3: Content Infrastructure + Homepage

### Task 12: PageContent Prisma モデル

**Files:**

- Modify: `prisma/schema.prisma`

**Context:** 新しい `PageContent` モデルを追加。既存の `Page`/`Section` モデルは維持（カスタムページ用）。

- [ ] **Step 1: schema.prisma に PageContent モデルを追加**

```prisma
model PageContent {
  id              String   @id @default(uuid()) @db.Uuid
  pageKey         String   @unique
  content         Json
  metaTitle       String?
  metaDescription String?
  ogpTitle        String?
  ogpDescription  String?
  ogpImage        String?
  updatedAt       DateTime @updatedAt

  @@map("page_contents")
}
```

- [ ] **Step 2: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add-page-content-model`

- [ ] **Step 3: Prisma Client 再生成**

Run: `bun run db:generate`

- [ ] **Step 4: type-check**

Run: `bun run type-check`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/shared/generated/
git commit -m "feat: add PageContent Prisma model for Page-First architecture"
```

---

### Task 13: コンテンツ型定義 + クエリ

**Files:**

- Create: `src/app/(public)/_shared/lib/content/types.ts`
- Create: `src/app/(public)/_shared/lib/content/schemas.ts`
- Create: `src/app/(public)/_shared/lib/content/queries.ts`
- Create: `src/app/(public)/_shared/lib/content/__tests__/schemas.test.ts`

**Context:** ページ固有のコンテンツ型を Zod スキーマで定義。`getPageContent<T>(pageKey, schema)` は `'use cache'` で DB クエリをキャッシュ。

- [ ] **Step 1: 共通型定義 (types.ts)**

```typescript
// types.ts
export interface ButtonItem {
  readonly label: string;
  readonly href: string;
  readonly variant: "primary" | "secondary" | "ghost";
}

export interface ImageRef {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface FeatureCard {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}
```

- [ ] **Step 2: Zod スキーマ (schemas.ts)**

```typescript
// schemas.ts
import { z } from "zod/v4";

export const buttonItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  variant: z.enum(["primary", "secondary", "ghost"]),
});

export const imageRefSchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number(),
  height: z.number(),
});

export const featureCardSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

// Homepage
export const homepageContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    subtitle: z.string(),
    image: imageRefSchema,
    cta: buttonItemSchema,
  }),
  concept: z.object({
    label: z.string(),
    heading: z.string(),
    body: z.string(),
    image: imageRefSchema,
  }),
  features: z.object({
    label: z.string(),
    heading: z.string(),
    items: z.array(featureCardSchema),
  }),
  cta: z.object({
    heading: z.string(),
    body: z.string(),
    buttons: z.array(buttonItemSchema),
  }),
});

export type HomepageContent = z.infer<typeof homepageContentSchema>;
```

- [ ] **Step 3: スキーマテスト**

```typescript
// __tests__/schemas.test.ts
import { describe, expect, it } from "bun:test";
import { homepageContentSchema } from "../schemas";

describe("homepageContentSchema", () => {
  it("validates correct content", () => {
    const content = {
      hero: {
        title: "Myrrh Rental Space",
        subtitle: "特別な空間で、特別な時間を",
        image: { src: "/hero.jpg", alt: "Hero", width: 1920, height: 1080 },
        cta: { label: "予約する", href: "/reservation", variant: "primary" },
      },
      concept: {
        label: "CONCEPT",
        heading: "私たちの想い",
        body: "テスト本文",
        image: { src: "/concept.jpg", alt: "Concept", width: 800, height: 600 },
      },
      features: {
        label: "FEATURES",
        heading: "特徴",
        items: [{ icon: "Sparkles", title: "清潔", description: "説明" }],
      },
      cta: {
        heading: "ご予約",
        body: "お気軽に",
        buttons: [{ label: "予約", href: "/reservation", variant: "primary" }],
      },
    };
    const result = homepageContentSchema.safeParse(content);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = homepageContentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: クエリ関数 (queries.ts)**

```typescript
// queries.ts
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { z } from "zod/v4";
import { prisma } from "@/shared/lib/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/cache";

export async function getPageContent<T>(
  pageKey: string,
  schema: z.ZodType<T>,
  defaultContent: T,
): Promise<T> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGE_CONTENT, `page-content-${pageKey}`);

  const row = await prisma.pageContent.findUnique({
    where: { pageKey },
    select: { content: true },
  });

  if (!row) return defaultContent;

  const result = schema.safeParse(row.content);
  if (!result.success) return defaultContent;

  return result.data;
}

export async function getPageContentMeta(pageKey: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGE_CONTENT, `page-content-meta-${pageKey}`);

  return prisma.pageContent.findUnique({
    where: { pageKey },
    select: {
      metaTitle: true,
      metaDescription: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImage: true,
    },
  });
}
```

**注意:** `CACHE_TAGS.PAGE_CONTENT` を `src/shared/lib/cache/tags.ts` に追加する必要がある。

- [ ] **Step 5: CACHE_TAGS に PAGE_CONTENT を追加**

Read + Edit: `src/shared/lib/cache/tags.ts` — `PAGE_CONTENT: "page-content"` を追加。

- [ ] **Step 6: テスト実行**

Run: `bun test src/app/'(public)'/_shared/lib/content/`

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/_shared/lib/content/' src/shared/lib/cache/
git commit -m "feat(public): add PageContent types, schemas, and cached queries"
```

---

### Task 14: ホームページデフォルトコンテンツ + シードデータ

**Files:**

- Create: `src/app/(public)/_shared/lib/content/defaults/homepage.ts`
- Modify: `prisma/seed.ts` (PageContent のシードを追加)

**Context:** DB にコンテンツがない場合のフォールバック値 + 開発用シードデータ。

- [ ] **Step 1: デフォルトコンテンツ**

```typescript
// defaults/homepage.ts
import type { HomepageContent } from "../schemas";

export const defaultHomepageContent: HomepageContent = {
  hero: {
    title: "Myrrh Rental Space",
    subtitle: "特別な空間で、特別な時間を",
    image: {
      src: "/images/hero-default.jpg",
      alt: "ヒーロー画像",
      width: 1920,
      height: 1080,
    },
    cta: { label: "スペースを見る", href: "/spaces", variant: "primary" },
  },
  concept: {
    label: "CONCEPT",
    heading: "私たちの想い",
    body: "Myrrh Rental Space は、特別な瞬間のための空間を提供します。",
    image: {
      src: "/images/concept-default.jpg",
      alt: "コンセプト",
      width: 800,
      height: 600,
    },
  },
  features: {
    label: "FEATURES",
    heading: "Myrrh の特徴",
    items: [
      {
        icon: "Sparkles",
        title: "洗練された空間",
        description: "細部までこだわった上質な内装",
      },
      {
        icon: "Clock",
        title: "柔軟な利用時間",
        description: "1時間単位でご利用いただけます",
      },
      {
        icon: "Shield",
        title: "安心のサポート",
        description: "専任スタッフが丁寧にご対応",
      },
    ],
  },
  cta: {
    heading: "ご予約・お問い合わせ",
    body: "お気軽にご相談ください",
    buttons: [
      { label: "予約する", href: "/reservation", variant: "primary" },
      { label: "お問い合わせ", href: "/contact", variant: "secondary" },
    ],
  },
};
```

- [ ] **Step 2: seed.ts に PageContent シードを追加**

Read: `prisma/seed.ts` — 既存のシード構造を確認し、`PageContent` の upsert を追加。

- [ ] **Step 3: Commit**

---

### Task 15: ホームページ実装

**Files:**

- Modify: `src/app/(public)/page.tsx`
- Create: `src/app/(public)/_components/homepage/hero-section.tsx`
- Create: `src/app/(public)/_components/homepage/concept-section.tsx`
- Create: `src/app/(public)/_components/homepage/features-section.tsx`

**Context:** ホームページを SectionRenderer ベースから Page-First に完全書き換え。`getPageContent` でコンテンツ取得、ページ固有コンポーネントでレンダリング。

- [ ] **Step 1: page.tsx を書き換え**

```typescript
// src/app/(public)/page.tsx
import { connection } from "next/server"
import { Suspense } from "react"
import { getPageContent } from "./_shared/lib/content/queries"
import { homepageContentSchema } from "./_shared/lib/content/schemas"
import { defaultHomepageContent } from "./_shared/lib/content/defaults/homepage"
import { HeroSection } from "./_components/homepage/hero-section"
import { ConceptSection } from "./_components/homepage/concept-section"
import { FeaturesSection } from "./_components/homepage/features-section"
import { SiteCTA } from "./_shared/components/layouts/site-cta"
import { SpaceShowcase } from "./_components/homepage/space-showcase"
import { generatePageMetadata } from "./_shared/lib/seo/page-metadata"

export async function generateMetadata() {
  await connection()
  return generatePageMetadata("home")
}

export default async function HomePage() {
  await connection()
  const content = await getPageContent(
    "homepage",
    homepageContentSchema,
    defaultHomepageContent,
  )

  return (
    <>
      <HeroSection content={content.hero} />
      <ConceptSection content={content.concept} />
      <Suspense fallback={null}>
        <SpaceShowcase />
      </Suspense>
      <FeaturesSection content={content.features} />
      <SiteCTA
        heading={content.cta.heading}
        body={content.cta.body}
      />
    </>
  )
}
```

- [ ] **Step 2: HeroSection 実装**

`PageHero` の `full` variant を使用。`SplitText` でタイトルアニメーション。

```typescript
// _components/homepage/hero-section.tsx
import { PageHero } from "../../_shared/components/layouts/page-hero"
import type { HomepageContent } from "../../_shared/lib/content/schemas"

interface HeroSectionProps {
  readonly content: HomepageContent["hero"]
}

export function HeroSection({ content }: HeroSectionProps) {
  return (
    <PageHero
      variant="full"
      title={content.title}
      subtitle={content.subtitle}
      image={content.image}
      cta={content.cta}
    />
  )
}
```

- [ ] **Step 3: ConceptSection 実装**

2カラム: テキスト（左）+ 画像（右、ParallaxLayer）。モバイルは縦積み。

```typescript
// _components/homepage/concept-section.tsx
import { Container } from "../../_shared/components/design-system/container"
import { Heading } from "../../_shared/components/design-system/heading"
import { Prose } from "../../_shared/components/design-system/prose"
import { ImageFrame } from "../../_shared/components/design-system/image-frame"
import { ScrollReveal } from "../../_shared/components/animations/scroll-reveal"
import type { HomepageContent } from "../../_shared/lib/content/schemas"

interface ConceptSectionProps {
  readonly content: HomepageContent["concept"]
}

export function ConceptSection({ content }: ConceptSectionProps) {
  return (
    <section className="py-[var(--spacing-section)]">
      <Container>
        <ScrollReveal>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-4 text-[length:var(--text-label)] font-medium uppercase tracking-[var(--tracking-wide)] text-muted-foreground">
                {content.label}
              </p>
              <Heading level={2} className="mb-6">
                {content.heading}
              </Heading>
              <Prose>
                <p>{content.body}</p>
              </Prose>
            </div>
            <ImageFrame
              src={content.image.src}
              alt={content.image.alt}
              width={content.image.width}
              height={content.image.height}
              aspect="portrait"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </ScrollReveal>
      </Container>
    </section>
  )
}
```

- [ ] **Step 4: FeaturesSection 実装**

3カラムグリッド。各カード: Lucide アイコン + タイトル + 説明文。`ScrollReveal` with stagger。

- [ ] **Step 5: SpaceShowcase 実装**

既存の `getShowcaseSpaces()` クエリを使い、スペースカードを3-4枚表示。「すべてのスペースを見る」リンク付き。

- [ ] **Step 6: type-check + validate**

Run: `bun run validate`

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/page.tsx' 'src/app/(public)/_components/homepage/'
git commit -m "feat(public): rewrite homepage with Page-First architecture"
```

---

### Task 16: validate + build 確認

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テスト実行**

Run: `bun run test`

- [ ] **Step 2: type-check + lint**

Run: `bun run validate`

- [ ] **Step 3: ビルド**

Run: `bun run build`

ビルドエラーがあれば修正。特に旧トークン参照の残留に注意。

- [ ] **Step 4: Commit (修正があれば)**

---

## 依存関係まとめ

```
Task 1 (tokens) ← Task 2,3 (primitives) ← Task 5-10 (layout components)
                                          ← Task 15 (homepage)
Task 12 (Prisma) ← Task 13 (queries) ← Task 14 (defaults) ← Task 15 (homepage)
Task 4 (animations) ← Task 5 (PageHero) ← Task 15 (homepage)
Task 11 (layout.tsx) ← Task 15 (homepage) — 最終検証
```

**並列実行可能なグループ:**

- Group A: Task 1 → Task 2 → Task 3
- Group B: Task 12 → Task 13 → Task 14
- Task 4 は Group A 完了後に着手可能
- Task 5-10 は Group A + Task 4 完了後
- Task 11, 15 は全タスク完了後
