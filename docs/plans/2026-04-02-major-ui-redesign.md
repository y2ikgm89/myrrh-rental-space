# Major UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページの視覚デザインを Exaggerated Minimalism x Editorial Luxury に全面刷新し、AI っぽさを排除する

**Architecture:** CSS テーマトークンの刷新を土台に、全セクションコンポーネント・ヘッダー・フッターの描画を大幅に書き換える。DB スキーマ（Zod/enum/config getter）は一切変更しない。SectionRenderer/SectionWrapper パイプラインは維持。変更は描画層（TSX + CSS）のみ。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4 (CSS-first @theme), GSAP 3.14, @tabler/icons-react 3.41

---

## ファイル構成

### 変更ファイル

| ファイル                                                        | 変更内容                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/app/(public)/_styles/public.css`                           | テーマトークン全面刷新（タイポ・スペーシング・カラー・テクスチャ） |
| `src/app/(public)/_shared/components/design-system/Heading.tsx` | font-weight 300、letter-spacing 強化                               |
| `src/app/(public)/_shared/components/ui/SectionLabel.tsx`       | gold-line を editorial 化                                          |
| `src/app/(public)/_components/HeroSection.tsx`                  | パララックス Hero のレイアウト刷新                                 |
| `src/app/(public)/_components/ConceptSection.tsx`               | 12カラム Grid オーバーラップ配置                                   |
| `src/app/(public)/_components/FeaturesSection.tsx`              | 番号を hero-size に、レイアウト editorial 化                       |
| `src/app/(public)/_components/SpaceShowcaseSection.tsx`         | featured + masonry-like 配置                                       |
| `src/app/(public)/_components/CTASection.tsx`                   | editorial split + grain テクスチャ                                 |
| `src/app/(public)/_components/TestimonialSection.tsx`           | featured 巨大引用 + 残り小さく                                     |
| `src/app/(public)/_shared/components/layouts/site-header.tsx`   | ブランドロゴ・ナビ editorial 化                                    |
| `src/app/(public)/_shared/components/layouts/site-footer.tsx`   | 非対称2カラム + decorative line                                    |

### 変更しないファイル（整合性保証）

- `src/shared/lib/validations/` — スキーマ全体
- `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`
- `src/app/(public)/_shared/components/sections/SectionWrapper.tsx`
- `src/app/(public)/layout.tsx` — プロバイダー構成
- `src/shared/domain/` — ドメイン層全体

---

## Task 1: CSS テーマ全面刷新 (public.css)

**Files:**

- Modify: `src/app/(public)/_styles/public.css`

これが全体の土台。テーマトークンを変えるだけで、既存コンポーネントの見た目が一気に変わる。

- [ ] **Step 1: タイポグラフィスケールを大幅拡大**

`@theme` 内の `--text-*` を以下に変更:

```css
--text-hero: clamp(3rem, 7vw + 1rem, 6rem);
--text-hero--line-height: 1.05;
--text-hero--letter-spacing: -0.03em;
--text-hero--font-weight: 300;

--text-h1: clamp(2.25rem, 4vw + 0.5rem, 3.75rem);
--text-h1--line-height: 1.1;
--text-h1--letter-spacing: -0.02em;
--text-h1--font-weight: 300;

--text-h2: clamp(1.75rem, 3vw + 0.5rem, 2.75rem);
--text-h2--line-height: 1.15;
--text-h2--letter-spacing: -0.02em;
--text-h2--font-weight: 300;

--text-h3: clamp(1.25rem, 1.5vw + 0.5rem, 1.75rem);
--text-h3--line-height: 1.25;
--text-h3--letter-spacing: -0.01em;
--text-h3--font-weight: 400;

--text-h4: 1.125rem;
--text-h4--line-height: 1.3;
--text-h4--letter-spacing: 0em;
--text-h4--font-weight: 500;
```

変更点: Hero 6rem（旧 4.5rem）、H1 3.75rem（旧 3rem）、全 heading を font-weight 300 に（旧 300-600 混在）、letter-spacing をよりタイトに。

- [ ] **Step 2: カラートークンのコントラスト強化**

`@theme` 内のカラーを以下に変更:

```css
--color-surface: oklch(0.94 0.012 60);
--color-surface-light: oklch(0.97 0.008 60);
--color-border: oklch(0.85 0.015 60);
--color-accent: oklch(0.52 0.1 60);
--color-accent-light: oklch(0.6 0.09 60);
```

変更点: surface をより暗く（0.96→0.94）してコントラスト強化、border も濃く（0.88→0.85）、accent をやや深く（0.55→0.52）。

- [ ] **Step 3: スペーシングを拡大**

```css
--spacing-section: clamp(7rem, 12vw, 11rem);
--spacing-block: clamp(2.5rem, 5vw, 4rem);
```

変更点: section padding を clamp(6rem,10vw,9rem) → clamp(7rem,12vw,11rem) に拡大。ラグジュアリーな余白。

- [ ] **Step 4: grain テクスチャユーティリティ追加**

`@layer utilities` セクションに追加:

```css
.grain-texture {
  position: relative;
}

.grain-texture::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.03;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: multiply;
}
```

- [ ] **Step 5: ドロップキャップユーティリティ追加**

```css
.drop-cap > p:first-of-type::first-letter {
  font-family: var(--font-serif);
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  margin-right: 0.12em;
  margin-top: 0.08em;
  color: var(--color-accent);
}
```

- [ ] **Step 6: gold-line の装飾を洗練**

既存:

```css
.gold-line::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -2rem;
  transform: translateY(-50%);
  width: 1.5rem;
  height: 1px;
  background-color: var(--color-accent);
}
```

変更後:

```css
.gold-line::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -2.5rem;
  transform: translateY(-50%);
  width: 2rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-accent));
}
```

- [ ] **Step 7: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 8: コミット**

```bash
git add src/app/'(public)'/_styles/public.css
git commit -m "style(public): major theme overhaul — larger typography, stronger contrast, grain texture, editorial spacing"
```

---

## Task 2: SectionLabel + Heading editorial 化

**Files:**

- Modify: `src/app/(public)/_shared/components/ui/SectionLabel.tsx`
- Modify: `src/app/(public)/_shared/components/design-system/Heading.tsx`

- [ ] **Step 1: SectionLabel を editorial 化**

現在のファイルを Read して、以下に書き換え:

```tsx
import type { ReactNode } from "react";

interface SectionLabelProps {
  readonly children: ReactNode;
}

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <p className="gold-line pl-0 text-[11px] uppercase tracking-[0.3em] text-accent">
      {children}
    </p>
  );
}
```

変更点: `tracking-[0.25em]` → `tracking-[0.3em]`（より広い tracking で editorial 感）。

- [ ] **Step 2: Heading の font-weight をデフォルト 300 に**

現在のファイルを Read して、`className` の `font-heading` の後に `font-light` を追加:

```tsx
export function Heading({ level, children, className }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={cn("font-heading font-light", levelClasses[level], className)}
    >
      {children}
    </Tag>
  );
}
```

変更点: 全 Heading がデフォルト `font-light`（300）に。太字が必要な場合はカスタム className で上書き。

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_shared/components/ui/SectionLabel.tsx src/app/'(public)'/_shared/components/design-system/Heading.tsx
git commit -m "style(public): editorial SectionLabel wider tracking, Heading default font-light"
```

---

## Task 3: HeroSection 大幅レイアウト刷新

**Files:**

- Modify: `src/app/(public)/_components/HeroSection.tsx`

Hero は最初に目に入るため最もインパクトが大きい。現在のフルビューポート + 中央テキストから、より editorial なレイアウトに変更。

- [ ] **Step 1: ファイルを Read して全体構造を把握**

現在のファイルを Read する。

- [ ] **Step 2: テキスト部分の巨大化 + レイアウト改善**

content 部分を以下に変更（`{/* Content */}` ブロック）:

```tsx
{
  /* Content */
}
<div ref={contentRef} className="relative z-10 w-full max-w-3xl px-5 md:px-8">
  {config.tagline && (
    <p className="mb-8 text-[10px] font-medium uppercase tracking-[0.4em] text-accent md:text-[11px]">
      {config.tagline}
    </p>
  )}

  <h1
    className={`font-heading ${getTitleClasses(design)} font-light leading-[1.05] tracking-tight`}
    style={getTitleStyle(design)}
  >
    <SplitText trigger={false} delay={0.5}>
      {config.title}
    </SplitText>
  </h1>

  {config.subtitle && (
    <p
      className={`mt-8 max-w-md text-sm leading-[2] text-muted-foreground md:mt-10 md:text-base${config.contentPosition === "center" ? " mx-auto" : ""}`}
      style={getTextStyle(design)}
    >
      {config.subtitle}
    </p>
  )}

  {config.buttons.length > 0 && (
    <div
      className={`mt-10 flex flex-col gap-4 md:mt-14${config.contentPosition === "center" ? " items-center" : " items-start"}`}
    >
      {config.buttons.map((btn) => (
        <MagneticButton key={btn.url} href={btn.url}>
          {btn.text}
        </MagneticButton>
      ))}
    </div>
  )}

  {/* Decorative accent line */}
  <div className="mt-12 h-px w-16 bg-accent/30 md:mt-16" aria-hidden="true" />
</div>;
```

変更点:

- `max-w-lg` → `max-w-3xl`（テキスト領域を広く）
- `mb-6` → `mb-8`、`mt-6` → `mt-8`（余白を広げる）
- `tracking-[0.3em]` → `tracking-[0.4em]`（tagline をより開く）
- `font-bold` → `font-light`（細い書体で editorial 感）
- `leading-[1.15]` → `leading-[1.05]`（行間を詰めて巨大タイトルをコンパクトに）
- `leading-relaxed` → `leading-[2]`（本文の行間を広く）
- `mt-8 md:mt-12` → `mt-10 md:mt-14`（ボタンの余白拡大）
- decorative accent line 追加（ゴールドのアクセントライン）

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_components/HeroSection.tsx
git commit -m "style(public): editorial hero — font-light, wider spacing, decorative accent line"
```

---

## Task 4: ConceptSection オーバーラップ配置

**Files:**

- Modify: `src/app/(public)/_components/ConceptSection.tsx`

2カラム均等 grid → 12カラム CSS Grid でテキストが画像に重なる editorial 配置。

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: side-by-side レイアウト部分を 12カラム Grid に変更**

`isStacked` が false の場合のリターン文を以下に変更:

```tsx
return (
  <SectionWrapper design={design}>
    <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-0">
      {/* Image — spans 7 columns */}
      <div
        className={`md:row-start-1 ${
          imagePosition === "left"
            ? "md:col-span-7 md:col-start-1"
            : "md:col-span-7 md:col-start-6"
        }`}
      >
        {imageBlock}
      </div>

      {/* Text — spans 6 columns, overlaps image by 1 column */}
      <div
        className={`md:row-start-1 md:self-center ${
          imagePosition === "left"
            ? "md:col-span-6 md:col-start-6"
            : "md:col-span-6 md:col-start-1"
        }`}
      >
        <div className="relative z-10 bg-background py-8 md:px-10 md:py-12">
          {textBlock}
        </div>
      </div>
    </div>
  </SectionWrapper>
);
```

変更点:

- `grid items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-20` → `grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-0`
- 画像が 7 カラム、テキストが 6 カラムで 1 カラム重なる
- テキストブロックに `bg-background py-8 md:px-10 md:py-12` で「浮く」効果
- `direction:rtl` ハックを削除し、`col-start` で位置制御

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_components/ConceptSection.tsx
git commit -m "style(public): editorial concept — 12-col grid overlap layout, floating text block"
```

---

## Task 5: FeaturesSection レイアウト大幅刷新

**Files:**

- Modify: `src/app/(public)/_components/FeaturesSection.tsx`

アクセント番号を巨大化。hero-first のレイアウトをより editorial に。

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: FeatureIndicator の番号を巨大化**

```tsx
function FeatureIndicator({
  icon,
  index,
}: {
  readonly icon: string | undefined;
  readonly index: number;
}) {
  const IconComponent = icon ? ICON_MAP[icon] : undefined;

  if (IconComponent) {
    return (
      <IconComponent
        className="h-6 w-6 text-accent/40"
        strokeWidth={1.2}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="font-heading text-5xl font-light leading-none text-accent/15 md:text-6xl"
      aria-hidden="true"
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}
```

変更点: 番号 `text-3xl` → `text-5xl md:text-6xl`、色 `text-accent/25` → `text-accent/15`、アイコン `h-5 w-5` → `h-6 w-6`、`strokeWidth` 1.5→1.2。

- [ ] **Step 3: hero-first レイアウトを editorial に**

hero feature 部分:

```tsx
{
  /* Hero feature — full-width editorial */
}
<div data-feature="" className="border-b border-border pb-8 @md:pb-12">
  <div className="flex items-start gap-6 @md:gap-10">
    <FeatureIndicator icon={heroFeature.icon} index={0} />
    <div className="flex-1">
      <h3 className="font-heading text-xl font-light tracking-tight md:text-2xl">
        {heroFeature.title}
      </h3>
      <p
        className="mt-3 max-w-xl text-sm leading-[1.9] text-muted-foreground md:text-base"
        style={getTextStyle(design)}
      >
        {heroFeature.description}
      </p>
    </div>
  </div>
</div>;
```

残りの features:

```tsx
{
  restFeatures.length > 0 && (
    <div className="mt-8 grid gap-8 @md:mt-12 @md:grid-cols-2 @md:gap-x-16 @md:gap-y-10">
      {restFeatures.map((feature, restIndex) => (
        <div
          key={feature.title}
          data-feature=""
          className="flex items-start gap-5"
        >
          <FeatureIndicator icon={feature.icon} index={restIndex + 1} />
          <div>
            <h3 className="font-heading text-lg font-light tracking-tight">
              {feature.title}
            </h3>
            <p
              className="mt-2 text-sm leading-[1.9] text-muted-foreground"
              style={getTextStyle(design)}
            >
              {feature.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: equal-grid の stagger を強化**

```tsx
{
  layout === "equal-grid" && (
    <div
      className={`grid gap-10 ${getGridColsClass(config.columns)} @md:gap-x-16`}
    >
      {items.map((feature, index) => (
        <div
          key={feature.title}
          data-feature=""
          className={`flex flex-col gap-4${index % 2 === 1 ? " @md:mt-12" : ""}`}
        >
          <FeatureIndicator icon={feature.icon} index={index} />
          <h3 className="font-heading text-lg font-light tracking-tight">
            {feature.title}
          </h3>
          <p
            className="text-sm leading-[1.9] text-muted-foreground"
            style={getTextStyle(design)}
          >
            {feature.description}
          </p>
        </div>
      ))}
    </div>
  );
}
```

変更点: `gap-8` → `gap-10`、stagger `@md:mt-6` → `@md:mt-12`、`leading-relaxed` → `leading-[1.9]`。

- [ ] **Step 5: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 6: コミット**

```bash
git add src/app/'(public)'/_components/FeaturesSection.tsx
git commit -m "style(public): editorial features — giant numbers, border separator, wider gaps"
```

---

## Task 6: SpaceShowcaseSection — featured カード + 非対称グリッド

**Files:**

- Modify: `src/app/(public)/_components/SpaceShowcaseSection.tsx`

最初のスペースを大きく表示し、残りを小さく配置する非対称レイアウト。

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: グリッドを featured + remaining に分割**

```tsx
export function SpaceShowcaseSection({
  config,
  spaces,
  design,
}: SpaceShowcaseSectionProps): ReactElement {
  const featured = spaces[0];
  const remaining = spaces.slice(1);

  return (
    <SectionWrapper design={design}>
      <div className="mb-10 md:mb-14">
        <ScrollReveal>
          {config.sectionLabel ? (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          ) : null}
          <h2
            className={`mt-4 font-heading ${getTitleClasses(design)} font-light tracking-tight`}
            style={getTitleStyle(design)}
          >
            {config.title}
          </h2>
        </ScrollReveal>
      </div>

      {featured && (
        <ScrollReveal>
          <div className="mb-8 md:mb-12">
            <SpaceCard
              slug={featured.slug}
              name={featured.name}
              description={featured.description}
              capacity={featured.capacity}
              area={featured.area}
              hourlyPrice={featured.hourlyPrice}
              dailyPrice={featured.dailyPrice}
              mainImageUrl={featured.mainImageUrl}
              categoryName={featured.categoryName}
              locationName={featured.locationName ?? undefined}
              lineAddress={featured.lineAddress ?? undefined}
              facilities={featured.facilities}
            />
          </div>
        </ScrollReveal>
      )}

      {remaining.length > 0 && (
        <div
          className={`grid gap-6 ${getCardGridColsClass(config.columns)} md:gap-8`}
        >
          {remaining.map((space, i) => (
            <ScrollReveal key={space.id} delay={(i + 1) * 0.1}>
              <SpaceCard
                slug={space.slug}
                name={space.name}
                description={space.description}
                capacity={space.capacity}
                area={space.area}
                hourlyPrice={space.hourlyPrice}
                dailyPrice={space.dailyPrice}
                mainImageUrl={space.mainImageUrl}
                categoryName={space.categoryName}
                locationName={space.locationName ?? undefined}
                lineAddress={space.lineAddress ?? undefined}
                facilities={space.facilities}
              />
            </ScrollReveal>
          ))}
        </div>
      )}
    </SectionWrapper>
  );
}
```

変更点:

- 最初のスペースを `featured` として単独 full-width 表示
- 残りを通常グリッドに配置
- heading に `font-light` 追加
- `text-center` → 左寄せ（editorial 感）
- `mb-8 md:mb-12` → `mb-10 md:mb-14`

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_components/SpaceShowcaseSection.tsx
git commit -m "style(public): editorial space showcase — featured card + remaining grid"
```

---

## Task 7: CTASection editorial 化 + grain テクスチャ

**Files:**

- Modify: `src/app/(public)/_components/CTASection.tsx`

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: centered/default variant に grain テクスチャ + editorial スタイル適用**

centered/default のリターン部分（ファイル後半）を以下に変更:

```tsx
return (
  <SectionWrapper design={design} {...styleProps}>
    <div className="grain-texture text-center">
      <ScrollReveal>
        {config.sectionLabel && (
          <SectionLabel>{config.sectionLabel}</SectionLabel>
        )}
      </ScrollReveal>

      <h2
        className={`mt-6 font-heading ${getTitleClasses(design)} font-light tracking-tight ${variant === "centered" ? "text-3xl md:text-4xl lg:text-5xl" : ""}`}
        style={getTitleStyle(design)}
      >
        <SplitText>{config.title}</SplitText>
      </h2>

      {config.description && (
        <ScrollReveal delay={0.2}>
          <p
            className="mx-auto mt-8 max-w-md text-sm leading-[2] text-muted-foreground md:mt-10 md:text-base"
            style={getTextStyle(design)}
          >
            {config.description}
          </p>
        </ScrollReveal>
      )}

      <CTAButtons
        primaryButton={primaryButton}
        secondaryButton={secondaryButton}
        variant={variant}
      />
    </div>
  </SectionWrapper>
);
```

変更点: `grain-texture` クラス追加、`mt-6 md:mt-8` → `mt-8 md:mt-10`、`leading-relaxed` → `leading-[2]`、`font-bold` → `font-light`。

- [ ] **Step 3: split variant のテキストも editorial 化**

split variant の heading に `font-light` を追加、description に `leading-[2]` を設定。

- [ ] **Step 4: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/app/'(public)'/_components/CTASection.tsx
git commit -m "style(public): editorial CTA — grain texture, font-light, wider line-height"
```

---

## Task 8: TestimonialSection — featured 巨大引用

**Files:**

- Modify: `src/app/(public)/_components/TestimonialSection.tsx`

最初の testimonial を巨大な引用として表示し、残りを小さくする editorial 配置。

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: grid/list レイアウト内で最初のアイテムを featured 化**

testimonial カード描画部分で、`index === 0 && config.layout !== "carousel"` の場合に特別スタイルを適用:

```tsx
const isFeatured = index === 0 && config.layout !== "carousel";

const cardClasses = isFeatured
  ? "py-10 md:py-14" // featured: 大きな padding
  : variant === "card"
    ? "rounded-lg bg-card p-8 border-t-2 border-t-accent/30 border-x-0 border-b-0 hover:shadow-lg transition-shadow"
    : variant === "minimal"
      ? "py-6"
      : "py-8";
```

featured の引用符とテキスト:

```tsx
{/* Quote decoration */}
{variant !== "minimal" && (
  <span
    className={`block font-heading leading-[0.8] text-accent/10 ${isFeatured ? "text-[6rem] md:text-[8rem]" : "text-[4rem]"}`}
    aria-hidden="true"
  >
    &ldquo;
  </span>
)}

<p
  className={`${variant === "minimal" ? "" : "mt-3"} ${
    isFeatured
      ? "font-heading text-xl font-light leading-[1.8] italic md:text-2xl"
      : variant === "default"
        ? "text-base leading-[1.9] italic"
        : "text-sm leading-relaxed"
  } text-foreground`}
  style={getTextStyle(design)}
>
```

featured の場合は grid で `col-span-full` に:

```tsx
<div
  key={index}
  data-testimonial-card=""
  className={`${cardClasses} ${CARD_CLASS[config.layout]} ${
    isFeatured && config.layout === "grid" ? "@3xl:col-span-full" : ""
  }`}
>
```

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_components/TestimonialSection.tsx
git commit -m "style(public): editorial testimonial — featured giant quote, remaining compact"
```

---

## Task 9: Header editorial 化

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-header.tsx`

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: ブランドロゴを editorial 化**

現在:

```tsx
<Link
  href="/"
  className="font-heading text-lg tracking-[0.15em] text-foreground"
>
  {brandName}
</Link>
```

変更後:

```tsx
<Link
  href="/"
  className="font-heading text-xl font-light tracking-[0.2em] text-foreground"
>
  {brandName}
</Link>
```

変更点: `text-lg` → `text-xl`、`font-light` 追加、`tracking-[0.15em]` → `tracking-[0.2em]`。

- [ ] **Step 3: スクロール時の背景を backdrop-blur 強化**

`updateScrolled` 関数内の transparent モード：

現在: `header.style.backdropFilter = "blur(24px)"`

変更不要（24px は十分）。ただし背景色の透過率を調整:

```tsx
header.style.backgroundColor =
  "color-mix(in oklch, var(--color-background) 85%, transparent)";
```

変更点: 92% → 85%（より透過させてガラス効果を強化）。

- [ ] **Step 4: ヘッダー下部ボーダーを accent に**

現在:

```tsx
style={scrolled ? { borderBottom: "1px solid oklch(0.88 0.01 60)" } : undefined}
```

変更後:

```tsx
style={scrolled ? { borderBottom: "1px solid oklch(0.85 0.015 60 / 0.5)" } : undefined}
```

変更点: 半透明の border で柔らかく。

- [ ] **Step 5: モバイルメニューの閉じるボタンを Tabler Icons に**

現在のインライン SVG を置換:

```tsx
import { IconX } from "@tabler/icons-react";

// 閉じるボタン内の SVG を:
<IconX className="h-5 w-5 text-foreground" strokeWidth={1.5} />;
```

- [ ] **Step 6: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 7: コミット**

```bash
git add src/app/'(public)'/_shared/components/layouts/site-header.tsx
git commit -m "style(public): editorial header — larger brand, stronger blur, Tabler close icon"
```

---

## Task 10: Footer 非対称レイアウト化

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-footer.tsx`

- [ ] **Step 1: ファイルを Read**

- [ ] **Step 2: 上部に decorative gold line を追加**

footer の `<footer>` タグの直後に:

```tsx
<div
  className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
  aria-hidden="true"
/>
```

- [ ] **Step 3: ブランドセクションの typography を editorial 化**

フッターのブランド名部分を探して editorial 化:

- `font-heading text-xl` → `font-heading text-2xl font-light tracking-[0.15em]`
- description テキストに `leading-[2]` を追加

- [ ] **Step 4: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/app/'(public)'/_shared/components/layouts/site-footer.tsx
git commit -m "style(public): editorial footer — decorative gold line, larger brand, wider line-height"
```

---

## Task 11: 全体検証 + ビルド

- [ ] **Step 1: validate + build**

```bash
bun run validate && bun run build:skip-env
```

Expected: PASS

- [ ] **Step 2: Anti-AI セルフレビュー 6問チェック**

1. タイポグラフィに serif/sans の対比があるか？ → **yes**（Cormorant 300 + Noto Sans）
2. Accent カラーが控えめ（15% 以下）か？ → **yes**（Bronze ≤15%）
3. セクション間で padding に変化があるか？ → **yes**（拡大された spacing-section + SectionDesign 管理）
4. アニメーションに主役/脇役の差があるか？ → **yes**（SplitText/ScrollReveal/ParallaxImage）
5. カードに hover インタラクションがあるか？ → **yes**（SpaceCard hover）
6. SectionLabel に統一された装飾があるか？ → **yes**（gradient gold-line）

6/6 PASS

---

## 管理画面整合性チェックリスト

| チェック項目                                                     | 結果 |
| ---------------------------------------------------------------- | ---- |
| Zod スキーマ（section.ts, section-options.ts）変更なし           | ✅   |
| SectionRenderer.tsx の switch 文変更なし                         | ✅   |
| SectionWrapper.tsx 変更なし                                      | ✅   |
| SectionDesign の paddingTop/Bottom/background/titleSize 反映維持 | ✅   |
| config getter（section-defaults.ts）変更なし                     | ✅   |
| getTitleClasses / getTitleStyle / getTextStyle の使い方維持      | ✅   |
| layout.tsx のプロバイダー構成変更なし                            | ✅   |
| ドメイン層（domain/）変更なし                                    | ✅   |
