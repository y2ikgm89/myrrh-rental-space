# Editorial Magazine 全公開ページ一貫性刷新 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームページで確立した Editorial Magazine デザイン言語を全28公開ルートに構造的に適用し、��一す��。

**Architecture:** Primitives レベルから再設計（既存10改修 + 新規4追加）し、ページカテゴリ別テンプレート（content/form/dashboard）で全ページに適用。破壊的変更を許容し、後方互換性ハックなしのクリーンな実装。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4 (@theme/OKLCH), TypeScript 6.0, GSAP (ScrollTrigger/ScrollReveal)

**Spec:** `docs/superpowers/specs/2026-04-03-editorial-magazine-consistency-design.md`

---

## Phase 1: CSS テーマ拡張

### Task 1: public.css テーマトークン追加

**Files:**

- Modify: `src/app/(public)/_styles/public.css`

- [ ] **Step 1: @theme にトークン追加**

`@theme { }` ブロック内の Spacing セクション末尾に追加:

```css
/* --------------------------------------------------------------------------
   * Section Backgrounds — alternating pattern
   * -------------------------------------------------------------------------- */
--color-surface-alt: oklch(0.975 0.006 60);
```

Typography セクション末尾に追加:

```css
--text-eyebrow: 0.6875rem;
--text-eyebrow--line-height: 1;
--text-eyebrow--letter-spacing: 0.18em;
--text-eyebrow--font-weight: 500;

--text-pullquote: clamp(1.5rem, 3vw + 0.5rem, 2.5rem);
--text-pullquote--line-height: 1.3;
--text-pullquote--letter-spacing: -0.01em;
--text-pullquote--font-weight: 300;
```

- [ ] **Step 2: ユーティリティクラス追加**

`@layer utilities` ブロック内に追加:

```css
/* Editorial 装飾ボーダー */
.editorial-border-top {
  border-top: 1px solid var(--color-border);
}

.editorial-border-accent {
  border-top: 2px solid var(--color-accent);
  width: 4rem;
}
```

- [ ] **Step 3: type-check**

Run: `bun run type-check`
Expected: PASS（CSS のみの変更なので型エラーなし）

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/_styles/public.css
git commit -m "style(public): add editorial theme tokens and utilities"
```

---

## Phase 2: Primitives 新規作���

### Task 2: Section コンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/section.tsx`

- [ ] **Step 1: Section を実装**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type SectionBackground = "default" | "surface" | "surface-alt";
type SectionBorder = "none" | "top" | "accent";
type SectionSpacing = "default" | "compact" | "none";

const bgClasses = {
  default: "bg-background",
  surface: "bg-surface",
  "surface-alt": "bg-surface-alt",
} as const satisfies Record<SectionBackground, string>;

const borderClasses = {
  none: "",
  top: "border-t border-border",
  accent: "editorial-border-accent",
} as const satisfies Record<SectionBorder, string>;

const spacingClasses = {
  default: "py-[var(--spacing-section)]",
  compact: "py-[var(--spacing-block)]",
  none: "",
} as const satisfies Record<SectionSpacing, string>;

interface SectionProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly background?: SectionBackground;
  readonly border?: SectionBorder;
  readonly spacing?: SectionSpacing;
  readonly id?: string;
}

export function Section({
  children,
  className,
  background = "default",
  border = "none",
  spacing = "default",
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        bgClasses[background],
        borderClasses[border],
        spacingClasses[spacing],
        className,
      )}
    >
      {children}
    </section>
  );
}
```

- [ ] **Step 2: type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/_shared/components/design-system/section.tsx
git commit -m "feat(design-system): add Section primitive"
```

### Task 3: Divider コンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/divider.tsx`

- [ ] **Step 1: Divider を実装**

```tsx
import { cn } from "@/shared/lib/cn";

type DividerVariant = "subtle" | "accent" | "fade";

const variantClasses = {
  subtle: "border-t border-border",
  accent: "editorial-border-accent mx-auto",
  fade: "h-px bg-gradient-to-r from-transparent via-border to-transparent border-0",
} as const satisfies Record<DividerVariant, string>;

interface DividerProps {
  readonly variant?: DividerVariant;
  readonly className?: string;
}

export function Divider({ variant = "subtle", className }: DividerProps) {
  return <hr className={cn(variantClasses[variant], className)} />;
}
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/divider.tsx
git commit -m "feat(design-system): add Divider primitive"
```

### Task 4: EditorialCard コンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/editorial-card.tsx`

- [ ] **Step 1: EditorialCard を実装**

```tsx
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type EditorialCardVariant = "default" | "featured";

interface EditorialCardProps {
  readonly title: string;
  readonly description?: string;
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
  readonly meta?: ReactNode;
  readonly href: string;
  readonly variant?: EditorialCardVariant;
  readonly className?: string;
}

export function EditorialCard({
  title,
  description,
  image,
  meta,
  href,
  variant = "default",
  className,
}: EditorialCardProps) {
  if (variant === "featured") {
    return (
      <Link
        href={href}
        className={cn(
          "group grid grid-cols-1 gap-6 md:grid-cols-[5fr_4fr] md:gap-10",
          className,
        )}
      >
        {image ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 768px) 100vw, 55vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        ) : null}
        <div className="flex flex-col justify-center gap-3">
          {meta ? (
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {meta}
            </div>
          ) : null}
          <h3 className="font-heading text-h3 font-light transition-colors group-hover:text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="line-clamp-3 leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col border border-border bg-card transition-shadow duration-300 hover:shadow-lg rounded-lg overflow-hidden",
        className,
      )}
    >
      {image ? (
        <div className="relative aspect-[4/3] overflow-hidden bg-surface">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        {meta ? (
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {meta}
          </div>
        ) : null}
        <h3 className="font-heading text-h4 font-light">{title}</h3>
        {description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/editorial-card.tsx
git commit -m "feat(design-system): add EditorialCard primitive"
```

### Task 5: PageLayout コンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/page-layout.tsx`

- [ ] **Step 1: PageLayout を��装**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Container } from "./container";

type PageLayoutVariant = "content" | "form" | "dashboard";

interface PageLayoutProps {
  readonly variant: PageLayoutVariant;
  readonly children: ReactNode;
  readonly hero?: ReactNode;
  readonly cta?: ReactNode;
  readonly className?: string;
}

export function PageLayout({
  variant,
  children,
  hero,
  cta,
  className,
}: PageLayoutProps) {
  if (variant === "dashboard") {
    return (
      <Container className={cn("py-8 md:py-12", className)}>
        {children}
      </Container>
    );
  }

  if (variant === "form") {
    return (
      <>
        {hero}
        <Container className={cn("py-[var(--spacing-section)]", className)}>
          {children}
        </Container>
      </>
    );
  }

  // content
  return (
    <>
      {hero}
      <div className={className}>{children}</div>
      {cta}
    </>
  );
}
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/page-layout.tsx
git commit -m "feat(design-system): add PageLayout primitive"
```

---

## Phase 3: Primitives 改修

### Task 6: Heading — H3/H4 サンス化 + accent prop

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/heading.tsx`

- [ ] **Step 1: Heading を書き換え**

Read して全体を確認後、以下に書き換え:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type HeadingLevel = 1 | 2 | 3 | 4;

const levelClasses = {
  1: "text-h1",
  2: "text-h2",
  3: "text-h3",
  4: "text-h4",
} as const satisfies Record<HeadingLevel, string>;

const fontClasses = {
  1: "font-heading font-light",
  2: "font-heading font-light",
  3: "font-sans font-normal",
  4: "font-sans font-medium",
} as const satisfies Record<HeadingLevel, string>;

interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
  readonly accent?: boolean;
}

export function Heading({ level, children, className, accent }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <>
      <Tag className={cn(fontClasses[level], levelClasses[level], className)}>
        {children}
      </Tag>
      {accent ? (
        <div className="mt-4 h-0.5 w-16 bg-accent" aria-hidden="true" />
      ) : null}
    </>
  );
}
```

**破壊的変更**: H3/H4 が `font-heading`(serif) → `font-sans`(sans) に変更。

- [ ] **Step 2: type-check**

Run: `bun run type-check`
Expected: PASS（props は後方互換 — accent は optional）

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/_shared/components/design-system/heading.tsx
git commit -m "feat(design-system)!: Heading H3/H4 sans font, add accent prop"
```

### Task 7: Stack — gap 拡張

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/stack.tsx`

- [ ] **Step 1: Stack を書き換え**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type StackDirection = "vertical" | "horizontal";
type StackGap = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "section";

const gapClasses = {
  none: "gap-0",
  xs: "gap-1.5",
  sm: "gap-3",
  md: "gap-5",
  lg: "gap-8",
  xl: "gap-12",
  "2xl": "gap-16",
  section: "gap-[var(--spacing-section)]",
} as const satisfies Record<StackGap, string>;

interface StackProps {
  readonly children: ReactNode;
  readonly direction?: StackDirection;
  readonly gap?: StackGap;
  readonly className?: string;
  readonly as?: "div" | "section" | "ul" | "nav";
}

export function Stack({
  children,
  direction = "vertical",
  gap = "md",
  className,
  as: Tag = "div",
}: StackProps) {
  return (
    <Tag
      className={cn(
        direction === "vertical" ? "flex flex-col" : "flex flex-row",
        gapClasses[gap],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
```

**破壊的変更**: sm=2→3, md=4→5, lg=6→8, xl=8→12。全使用箇所の間隔が広がる。

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/stack.tsx
git commit -m "feat(design-system)!: Stack gap values expanded for editorial breathing"
```

### Task 8: Button — editorial variant

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/button.tsx`

- [ ] **Step 1: editorial variant 追加**

Read して確認後、`variantClasses` と型に `editorial` を追加:

`ButtonVariant` 型に `"editorial"` を追加。

`variantClasses` に追加:

```
editorial: "border border-foreground text-foreground rounded-full transition-colors duration-300 hover:bg-foreground hover:text-background",
```

`sizeClasses` 適用条件を `variant !== "link"` から `variant !== "link"` のまま維持（editorial にもサイズ適用）。

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/button.tsx
git commit -m "feat(design-system): add Button editorial variant (border-invert CTA)"
```

### Task 9: Container — editorial variant

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/container.tsx`

- [ ] **Step 1: editorial variant 追加**

`ContainerVariant` 型に `"editorial"` を追加。

`variantClasses` に追加:

```
editorial: "max-w-[65ch]",
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/container.tsx
git commit -m "feat(design-system): add Container editorial variant (65ch)"
```

### Task 10: ImageFrame — aspect 拡張 + hover

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/image-frame.tsx`

- [ ] **Step 1: ImageFrame 拡張**

`AspectRatio` 型に `"landscape"` を追加。
`aspectClasses` に追加: `landscape: "aspect-[4/3]"`

`fill` prop を追加（boolean、`width`/`height` の代替）。
Image の className に `transition-transform duration-500 group-hover:scale-105` を追加。

```tsx
interface ImageFrameProps {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly fill?: boolean;
  readonly aspect?: AspectRatio;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
}
```

`fill` が true の場合は `<Image fill>` を使用し `width`/`height` を省略。

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/image-frame.tsx
git commit -m "feat(design-system): ImageFrame landscape aspect, fill prop, hover scale"
```

### Task 11: Prose — editorial variant

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/prose.tsx`

- [ ] **Step 1: editorial variant 追加**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type ProseVariant = "default" | "editorial";

interface ProseProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: ProseVariant;
}

export function Prose({
  children,
  className,
  variant = "default",
}: ProseProps) {
  return (
    <div
      className={cn(
        "prose prose-neutral max-w-[65ch] leading-[var(--leading-normal)]",
        "prose-a:text-accent prose-a:no-underline hover:prose-a:text-accent-light",
        "prose-blockquote:font-heading prose-blockquote:italic prose-blockquote:font-light prose-blockquote:text-pullquote prose-blockquote:border-accent",
        variant === "editorial" && "drop-cap",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/prose.tsx
git commit -m "feat(design-system): Prose editorial variant with drop-cap and serif blockquote"
```

### Task 12: Input — Editorial form style

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/input.tsx`

- [ ] **Step 1: Input を Editorial form style に書き換え**

Read して全体を確認後、スタイルを変更:

- ラベル: `text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground`（`mb-1.5 text-sm` から変更）
- Input: `border-0 border-b bg-transparent px-0 py-3`（`rounded-lg border px-3 py-2` から変更）
- Focus: `focus-visible:border-accent`（ring スタイルから変更）
- Error border: `border-destructive`

変更箇所:

ラベルの className を変更:

```
"mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
```

Input の className を変更:

```
`w-full min-h-11 border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors
  placeholder:text-muted-foreground/60
  focus-visible:outline-none focus-visible:border-accent
  disabled:opacity-50 disabled:cursor-not-allowed
  ${error ? "border-destructive" : "border-border"}`
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/input.tsx
git commit -m "feat(design-system)!: Input editorial form style (border-bottom)"
```

### Task 13: Select — Editorial form style

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/select.tsx`

- [ ] **Step 1: Select を Editorial form style に書き換え**

Input と同一パターンでラベル・select のスタイルを変更。

ラベル:

```
"mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
```

Select:

```
`w-full min-h-11 border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors
  focus-visible:outline-none focus-visible:border-accent
  disabled:opacity-50 disabled:cursor-not-allowed
  ${error ? "border-destructive" : "border-border"}`
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/select.tsx
git commit -m "feat(design-system)!: Select editorial form style (border-bottom)"
```

### Task 14: Textarea — Editorial form style

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/textarea.tsx`

- [ ] **Step 1: Textarea を Editorial form style に書き換え**

Input と同一パターンでラベル・textarea のスタイルを変更。

ラベル:

```
"mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
```

Textarea:

```
`w-full min-h-[120px] border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors
  placeholder:text-muted-foreground/60 resize-y
  focus-visible:outline-none focus-visible:border-accent
  disabled:opacity-50 disabled:cursor-not-allowed
  ${error ? "border-destructive" : "border-border"}`
```

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/design-system/textarea.tsx
git commit -m "feat(design-system)!: Textarea editorial form style (border-bottom)"
```

---

## Phase 4: 共通レイアウト改���

### Task 15: PageHero 再設計

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/page-hero.tsx`

- [ ] **Step 1: PageHero を3バリアントに再設計**

Read して現行実装を確認後、以下に書き換え:

```tsx
import Image from "next/image";
import type { ReactNode } from "react";
import { Container } from "../design-system/container";
import { Heading } from "../design-system/heading";
import { Stack } from "../design-system/stack";
import { SectionLabel } from "../ui/SectionLabel";

interface ImageRef {
  readonly src: string;
  readonly alt: string;
}

interface PageHeroEditorialProps {
  readonly variant: "editorial";
  readonly title: string;
  readonly subtitle?: string;
  readonly label?: string;
  readonly image: ImageRef;
  readonly breadcrumb?: ReactNode;
}

interface PageHeroCompactProps {
  readonly variant: "compact";
  readonly title: string;
  readonly breadcrumb?: ReactNode;
}

interface PageHeroMinimalProps {
  readonly variant: "minimal";
  readonly title: string;
}

type PageHeroProps =
  | PageHeroEditorialProps
  | PageHeroCompactProps
  | PageHeroMinimalProps;

export function PageHero(props: PageHeroProps) {
  if (props.variant === "editorial") {
    return (
      <section data-hero className="relative min-h-[60vh] bg-surface">
        <div className="grid min-h-[60vh] grid-cols-1 md:grid-cols-[5fr_4fr]">
          <div className="relative aspect-[4/3] md:aspect-auto">
            <Image
              src={props.image.src}
              alt={props.image.alt}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 55vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center px-[var(--container-padding)] py-12 md:py-0">
            <Stack gap="md">
              {props.breadcrumb}
              {props.label ? <SectionLabel>{props.label}</SectionLabel> : null}
              <Heading level={1}>{props.title}</Heading>
              {props.subtitle ? (
                <p className="max-w-[40ch] text-lg leading-relaxed text-muted-foreground">
                  {props.subtitle}
                </p>
              ) : null}
            </Stack>
          </div>
        </div>
      </section>
    );
  }

  if (props.variant === "compact") {
    return (
      <section className="bg-surface py-[var(--spacing-block)]">
        <Container>
          <Stack gap="sm">
            {props.breadcrumb}
            <Heading level={1}>{props.title}</Heading>
          </Stack>
        </Container>
      </section>
    );
  }

  // minimal
  return (
    <Container className="py-8 md:py-12">
      <Heading level={1}>{props.title}</Heading>
    </Container>
  );
}
```

- [ ] **Step 2: 全 PageHero 使用箇所を確認**

Run: `bun run type-check`

PageHero の型が変わるため、使用箇所でコンパイルエラーが発生する可能性あり。
旧 `"full"` variant を使っている箇所は `"editorial"` に変更し、`image` prop の `width`/`height` を削除（`fill` 使用のため不要）。

該当ファイルを grep:

```bash
grep -r "PageHero" src/app/ --include="*.tsx" -l
```

各使用箇所で `variant="full"` → `variant="editorial"` に修正。`image` prop から `width`/`height` を削除。

- [ ] **Step 3: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/layouts/page-hero.tsx
# PageHero 使用箇所も add
git commit -m "feat(layouts)!: PageHero redesign — editorial/compact/minimal variants"
```

### Task 16: SiteCTA 共通コンポーネント抽出

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/site-cta.tsx`
- Modify: `src/app/(public)/_components/homepage/cta-section.tsx`（SiteCTA を使うように変更）

- [ ] **Step 1: site-cta.tsx を作成**

ホームページの CTA セクションから共通部分を抽出:

```tsx
import { Container } from "../design-system/container";
import { Stack } from "../design-system/stack";
import { Button } from "../design-system/button";
import { SectionLabel } from "../ui/SectionLabel";
import { ScrollReveal } from "../animations/scroll-reveal";

interface SiteCTAProps {
  readonly label?: string;
  readonly title: string;
  readonly description?: string;
  readonly buttonText: string;
  readonly buttonHref: string;
}

export function SiteCTA({
  label = "Reservation",
  title,
  description,
  buttonText,
  buttonHref,
}: SiteCTAProps) {
  return (
    <section className="bg-foreground py-[var(--spacing-section)]">
      <Container className="text-center">
        <Stack gap="lg" className="items-center">
          <ScrollReveal>
            <Stack gap="md" className="items-center">
              {label ? (
                <span className="text-xs uppercase tracking-[0.18em] text-background/60">
                  {label}
                </span>
              ) : null}
              <h2 className="font-heading text-h2 font-light italic text-background">
                {title}
              </h2>
              {description ? (
                <p className="max-w-[45ch] leading-relaxed text-background/70">
                  {description}
                </p>
              ) : null}
            </Stack>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <Button
              variant="editorial"
              size="lg"
              href={buttonHref}
              className="border-background text-background hover:bg-background hover:text-foreground"
            >
              {buttonText}
            </Button>
          </ScrollReveal>
        </Stack>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: ホームページ cta-section を SiteCTA ベースに書き換え**

Read `src/app/(public)/_components/homepage/cta-section.tsx` して、SiteCTA を import して使うように変更。Puck の defaultProps パターンは維持しつつ、レンダリング部分を SiteCTA に委譲。

- [ ] **Step 3: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/layouts/site-cta.tsx src/app/(public)/_components/homepage/cta-section.tsx
git commit -m "feat(layouts): extract SiteCTA shared component from homepage CTA"
```

### Task 17: Breadcrumb 微調整

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/breadcrumb.tsx`

- [ ] **Step 1: SectionLabel トーンに合わせる**

Read して確認後、テキストスタイルを `text-xs uppercase tracking-[0.1em]` 系に統一（現行が異なる場合のみ）。セパレーターやアイコンは維持。

- [ ] **Step 2: type-check & commit**

Run: `bun run type-check`

```bash
git add src/app/(public)/_shared/components/layouts/breadcrumb.tsx
git commit -m "style(layouts): breadcrumb typography aligned to editorial tone"
```

---

## Phase 5: Content Pages 適用

### Task 18: About ページ

**Files:**

- Modify: `src/app/(public)/about/page.tsx`

- [ ] **Step 1: Read して現行実装を確認**
- [ ] **Step 2: PageLayout variant="content" + Section ラッパー適用**

SectionRenderer を維持しつつ、全体を `PageLayout variant="content"` でラップ。
末尾に SiteCTA を追加。各セクション間で background 交互パターン。

- [ ] **Step 3: type-check & commit**

```bash
git commit -m "feat(public): about page — editorial magazine layout"
```

### Task 19: Spaces 一覧

**Files:**

- Modify: `src/app/(public)/spaces/page.tsx`

- [ ] **Step 1: Read して現行実装を確認**
- [ ] **Step 2: PageLayout + PageHero compact + Section**

FilterBar は維持。SpaceGrid のカードスタイルを EditorialCard トーンに近づける（SpaceGrid が別コンポーネントの場合はそこを修正）。末尾に SiteCTA。

- [ ] **Step 3: type-check & commit**

```bash
git commit -m "feat(public): spaces list — editorial magazine layout"
```

### Task 20: Space 詳細

**Files:**

- Modify: `src/app/(public)/spaces/[slug]/page.tsx`

- [ ] **Step 1: Read して現行実装を確認**
- [ ] **Step 2: 既にアライン済みの構造を微調整**

2カラム + sticky sidebar は維持。Section ラッパーで各コンテンツブロックをラップ。ScrollReveal をサイドバーに追加（未適用の場合）。

- [ ] **Step 3: type-check & commit**

```bash
git commit -m "feat(public): space detail — editorial section wrappers"
```

### Task 21: Journal

**Files:**

- Modify: `src/app/(public)/journal/page.tsx`

- [ ] **Step 1: Read → PageLayout + Section 適用**
- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): journal — editorial magazine layout"
```

### Task 22: Events 一覧

**Files:**

- Modify: `src/app/(public)/events/page.tsx`

- [ ] **Step 1: Read → PageLayout + PageHero compact + Section**

FullCalendar を Section background="surface" でラップ。

- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): events list — editorial magazine layout"
```

### Task 23: Event 詳細

**Files:**

- Modify: `src/app/(public)/events/[slug]/page.tsx`

- [ ] **Step 1: Read → PageLayout + Container editorial + Section**
- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): event detail — editorial layout"
```

### Task 24: FAQ

**Files:**

- Modify: `src/app/(public)/faq/page.tsx`

- [ ] **Step 1: Read → PageLayout + Section + ScrollReveal on accordion items**

アコーディオン各アイテムに ScrollReveal + stagger delay を追加。editorial-border-top で区切り。

- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): FAQ — editorial layout with scroll animations"
```

### Task 25: Privacy / Terms

**Files:**

- Modify: `src/app/(public)/privacy/page.tsx`
- Modify: `src/app/(public)/terms/page.tsx`

- [ ] **Step 1: Read → PageLayout + Section ラッパー**
- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): privacy/terms — editorial section wrappers"
```

---

## Phase 6: Form Pages 適用

### Task 26: Contact

**Files:**

- Modify: `src/app/(public)/contact/page.tsx`

- [ ] **Step 1: Read → PageLayout variant="form" 適用**

2カラムレイアウトは維持（既にアライン済み）。Input/Select/Textarea は Phase 3 で変更済みなので自動反映。

- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): contact — editorial form layout"
```

### Task 27: Reservation

**Files:**

- Modify: `src/app/(public)/reservation/page.tsx`

- [ ] **Step 1: Read → PageLayout variant="form" + PageHero compact**

StepIndicator 維持。フォームの Input/Select/Textarea は Phase 3 で変更済み。ステップカードを bg-surface rounded-lg に統一。

- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): reservation — editorial form layout"
```

### Task 28: Login / Forgot / Reset Password

**Files:**

- Modify: `src/app/(public)/login/page.tsx`
- Modify: `src/app/(public)/forgot-password/page.tsx`
- Modify: `src/app/(public)/reset-password/page.tsx`

- [ ] **Step 1: Read → PageLayout variant="form" + PageHero minimal**

Container variant="narrow"。ソーシャルボタンを Button editorial variant に変更。

- [ ] **Step 2: type-check & commit**

```bash
git commit -m "feat(public): auth pages — editorial form layout"
```

---

## Phase 7: Dashboard Pages 適用

### Task 29: Mypage レイアウト + トップ

**Files:**

- Modify: `src/app/(public)/mypage/layout.tsx`
- Modify: `src/app/(public)/mypage/page.tsx`

- [ ] **Step 1: Read → layout に PageLayout variant="dashboard" 骨格を適用**

既存の認証・Customer 紐づけロジック（`verifyCustomerSession` + `ensureCustomerLinked`）は絶対に変更しない。レイアウトの外枠のみ調整。

- [ ] **Step 2: mypage/page.tsx に Heading accent + Divider 適用**
- [ ] **Step 3: type-check & commit**

```bash
git commit -m "feat(public): mypage layout/top — editorial dashboard style"
```

### Task 30: Mypage サブページ（予約詳細、問い合わせ、設定、イベント）

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/page.tsx`
- Modify: `src/app/(public)/mypage/inquiries/page.tsx`
- Modify: `src/app/(public)/mypage/settings/page.tsx`
- Modify: `src/app/(public)/mypage/events/page.tsx`

- [ ] **Step 1: 各ページを Read → Heading + Section + Stack で構造化**

機能ロジックは一切変更しない。レイアウト・スタイリングのみ。

- [ ] **Step 2: settings の ProfileForm は Editorial form style（Phase 3 で自動適用済み）**
- [ ] **Step 3: type-check & commit**

```bash
git commit -m "feat(public): mypage subpages — editorial dashboard style"
```

---

## Phase 8: 検証 + クリーンアップ

### Task 31: 全体 validate

- [ ] **Step 1: type-check + lint**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: ビルド**

Run: `bun run build`
Expected: PASS

### Task 32: レビュー — editorial-consistency-reviewer

- [ ] **Step 1: editorial-consistency-reviewer エージェント起動**

全公開ページの editorial トーン統一をチェック。hover パターン、tracking 値、font-weight、Button スタイル、ブランドロゴスタイルの不統一を検出。

### Task 33: レビュー — project-reviewer + accessibility-reviewer

- [ ] **Step 1: project-reviewer エージェント起動**

型安全、セマンティックカラートークン、React Compiler 互換性、eslint-react v3 パターンをチェック。

- [ ] **Step 2: accessibility-reviewer エージェント起動**

キーボード操作、スクリーンリーダー対応、カラーコントラスト、フォームラベル、ARIA 属性をチェック。

### Task 34: 最終コミット + ルールファイル更新

- [ ] **Step 1: project-design-config.md の Primitives テーブルを更新**

10 → 14 Primitives に更新。

- [ ] **Step 2: design-system-memory.md の Primitives テーブルを更新**
- [ ] **Step 3: CLAUDE.md のキーファイル情報を更新（必要に応じて）**
- [ ] **Step 4: 最終 commit**

```bash
git commit -m "docs: update design system docs for refreshed primitives"
```
