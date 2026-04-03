# Anti-AI デザイン刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページの AI っぽい UI パターンを排除し、Myrrh ブランド固有の editorial デザインに刷新する

**Architecture:** 描画層（TSX + CSS）のみ変更。Zod スキーマ・enum 値・config getter は一切変更しない。SectionRenderer → 各セクションコンポーネントのパイプラインを維持し、コンポーネント内部の描画ロジックのみ書き換える。管理画面の DesignPanel で設定した `SectionDesign`（padding, background, titleSize 等）は引き続き正常に反映される。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, GSAP 3.14, @tabler/icons-react 3.41

---

## ファイル構成

| ファイル                                                       | 変更内容                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/app/(public)/_components/FeaturesSection.tsx`             | `FeatureIcon` 廃止 → Tabler Icons マッピング + アクセント番号パターン |
| `src/app/(public)/_components/TestimonialSection.tsx`          | カードスタイル editorial 化 + `StarRating` 改善                       |
| `src/app/(public)/_components/GallerySection.tsx`              | ライトボックスコントロールを Tabler Icons に                          |
| `src/app/(public)/_shared/components/design-system/Button.tsx` | shimmer を控えめ narrow beam に + hover translateY                    |
| `src/app/(public)/_styles/public.css`                          | `bronze-shimmer` keyframes 改善                                       |

**変更しないファイル（整合性保証）:**

- `src/shared/lib/validations/section.ts` — スキーマ
- `src/shared/lib/validations/section-options.ts` — enum 値
- `src/shared/lib/validations/section-defaults.ts` — デフォルト getter
- `src/shared/lib/validations/section-parsers.ts` — パーサー
- `src/app/(public)/_shared/components/sections/SectionRenderer.tsx` — ルーター
- `src/app/(public)/_shared/components/sections/SectionWrapper.tsx` — ラッパー

---

## Task 1: FeaturesSection — アイコン刷新 + 番号パターン

**Files:**

- Modify: `src/app/(public)/_components/FeaturesSection.tsx`

**変更概要:**

- インライン SVG 3種（clock, shield, sparkles）の `FeatureIcon` コンポーネントを廃止
- `config.items[].icon` の string を Tabler Icons にマッピング（未知の値はアクセント番号にフォールバック）
- `bg-accent/50 rounded-lg` のアイコンボックスを廃止 → アイコン直置き or 番号表示
- `equal-grid` レイアウトに偶数アイテムの `mt-6` stagger を追加

**icon マッピング戦略:**

- `config.items[].icon` は free-form string（max 50）
- 既知の値（`"clock"`, `"shield"`, `"sparkles"` 等）→ 対応する Tabler Icon
- 未知 or 空 → アイテムの 1-based index を `01`, `02` 形式で表示

- [ ] **Step 1: FeatureIcon を書き換え**

`FeatureIcon` コンポーネントを以下に置き換える:

```tsx
import {
  IconClock,
  IconShieldCheck,
  IconSparkles,
  IconStar,
  IconWifi,
  IconParking,
  IconAirConditioning,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";

const ICON_MAP: Record<string, TablerIcon> = {
  clock: IconClock,
  shield: IconShieldCheck,
  sparkles: IconSparkles,
  star: IconStar,
  wifi: IconWifi,
  parking: IconParking,
  aircon: IconAirConditioning,
  kitchen: IconToolsKitchen2,
};

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
        className="h-5 w-5 text-accent/60"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    );
  }

  // フォールバック: アクセント番号
  return (
    <span
      className="font-heading text-3xl font-light leading-none text-accent/25"
      aria-hidden="true"
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}
```

- [ ] **Step 2: hero-first レイアウトの FeatureIcon 参照を FeatureIndicator に置換**

hero feature と rest features の両方で `<FeatureIcon>` を `<FeatureIndicator>` に変更。
hero の `size="hero"` prop は不要になる（Tabler Icon は単一サイズ、番号はフォントサイズで制御）。

hero feature のアイコンサイズは少し大きく:

```tsx
{
  /* Hero feature */
}
<div
  data-feature=""
  className="grid gap-5 @md:grid-cols-[auto_1fr] @md:items-start @md:gap-6"
>
  <div className="flex h-12 w-12 items-center justify-center">
    <FeatureIndicator icon={heroFeature.icon} index={0} />
  </div>
  {/* ... text content unchanged */}
</div>;
```

rest features:

```tsx
<div className="flex items-start gap-4">
  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
    <FeatureIndicator icon={feature.icon} index={restIndex + 1} />
  </div>
  {/* ... text content unchanged */}
</div>
```

- [ ] **Step 3: equal-grid レイアウトに stagger 効果を追加**

偶数アイテム（0-based の奇数 index）に `mt-6` を追加してグリッドの高さを不均一にする:

```tsx
{
  layout === "equal-grid" && (
    <div className={`grid gap-8 ${getGridColsClass(config.columns)}`}>
      {items.map((feature, index) => (
        <div
          key={feature.title}
          data-feature=""
          className={`flex flex-col items-start gap-3${index % 2 === 1 ? " @md:mt-6" : ""}`}
        >
          <FeatureIndicator icon={feature.icon} index={index} />
          {/* ... text content unchanged */}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: icon-left レイアウトも同様に FeatureIndicator 化**

```tsx
{
  layout === "icon-left" && (
    <div className="flex flex-col gap-6">
      {items.map((feature, index) => (
        <div
          key={feature.title}
          data-feature=""
          className="flex items-start gap-4"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <FeatureIndicator icon={feature.icon} index={index} />
          </div>
          {/* ... text content unchanged */}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS（`FeatureIcon` の全参照を `FeatureIndicator` に置換済み、props 互換）

- [ ] **Step 6: コミット**

```bash
git add src/app/'(public)'/_components/FeaturesSection.tsx
git commit -m "refactor(public): replace AI-style icon boxes with Tabler Icons + accent numbers in FeaturesSection"
```

---

## Task 2: GallerySection — ライトボックスコントロール刷新

**Files:**

- Modify: `src/app/(public)/_components/GallerySection.tsx`

**変更概要:**

- インライン SVG（X, ChevronLeft, ChevronRight）→ Tabler Icons
- ボタンのホバー状態改善（`bg-surface rounded-full` 追加）

- [ ] **Step 1: Tabler Icons import 追加 + インライン SVG 置換**

ファイル先頭に追加:

```tsx
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
```

閉じるボタン（`GallerySection.tsx` ライトボックス内）:

```tsx
<button
  type="button"
  onClick={closeLightbox}
  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
  aria-label="閉じる"
>
  <IconX className="h-5 w-5" strokeWidth={1.5} />
</button>
```

前ボタン:

```tsx
<button
  type="button"
  onClick={() => navigateLightbox(-1)}
  className="absolute -left-14 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
  aria-label="前の画像"
>
  <IconChevronLeft className="h-5 w-5" strokeWidth={1.5} />
</button>
```

次ボタン:

```tsx
<button
  type="button"
  onClick={() => navigateLightbox(1)}
  className="absolute -right-14 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
  aria-label="次の画像"
>
  <IconChevronRight className="h-5 w-5" strokeWidth={1.5} />
</button>
```

- [ ] **Step 2: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_components/GallerySection.tsx
git commit -m "refactor(public): replace inline SVGs with Tabler Icons in GallerySection lightbox"
```

---

## Task 3: TestimonialSection — Editorial 化

**Files:**

- Modify: `src/app/(public)/_components/TestimonialSection.tsx`

**変更概要:**

- `variant: "default"` — カード枠 `rounded-lg border bg-card p-6` → 背景なし editorial blockquote
- `variant: "card"` — `border-l-4 border-l-primary` → 控えめな上部アクセントライン
- `variant: "minimal"` — 現行維持
- 引用符を大きな serif 装飾に統一（`font-heading text-[4rem]`）
- `StarRating` のアイコンを Tabler Icons に

- [ ] **Step 1: StarRating を Tabler Icons に置換**

```tsx
import { IconStar, IconStarFilled } from "@tabler/icons-react";

function StarRating({ rating }: { readonly rating: number }): ReactElement {
  return (
    <div className="flex gap-0.5" aria-label={`${rating}つ星`}>
      {Array.from({ length: 5 }, (_, i) =>
        i < rating ? (
          <IconStarFilled
            key={i}
            className="h-3.5 w-3.5 text-accent"
            aria-hidden="true"
          />
        ) : (
          <IconStar
            key={i}
            className="h-3.5 w-3.5 text-border"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 2: variant 別カードスタイルを editorial 化**

カードクラスの生成ロジックを以下に変更:

```tsx
const cardClasses =
  variant === "card"
    ? "rounded-lg bg-card p-8 border-t-2 border-t-accent/30 border-x-0 border-b-0 hover:shadow-lg transition-shadow"
    : variant === "minimal"
      ? "py-6"
      : "py-8"; // default: 枠なし editorial
```

- [ ] **Step 3: 引用符の装飾を統一改善**

`variant !== "minimal"` のブロック:

```tsx
{
  variant !== "minimal" && (
    <span
      className="block font-heading text-[4rem] leading-[0.8] text-accent/10"
      aria-hidden="true"
    >
      &ldquo;
    </span>
  );
}
```

テキスト部分で `variant === "default"` のときは `text-base` に拡大、`italic` 追加:

```tsx
<p
  className={`${variant === "minimal" ? "" : "mt-3"} ${variant === "default" ? "text-base leading-[1.9] italic" : "text-sm leading-relaxed"} text-foreground`}
  style={getTextStyle(design)}
>
```

- [ ] **Step 4: Author 部分の区切り線を variant に応じて変更**

```tsx
<div
  className={`mt-6 flex items-center gap-3 ${
    variant === "default"
      ? "" // 枠なし variant: 区切り線なし
      : variant === "card"
        ? "border-t border-border pt-4"
        : "border-t border-border/50 pt-4"
  }`}
>
```

- [ ] **Step 5: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/app/'(public)'/_components/TestimonialSection.tsx
git commit -m "refactor(public): editorial testimonial design — remove card borders, use Tabler star icons"
```

---

## Task 4: Button shimmer 改善

**Files:**

- Modify: `src/app/(public)/_styles/public.css`
- Modify: `src/app/(public)/_shared/components/design-system/Button.tsx`

**変更概要:**

- `bronze-shimmer` keyframes: 200% 全面スライド → 110% narrow beam（控えめ光沢）
- Button hover に `translateY(-1px)` + `shadow-md` 追加

- [ ] **Step 1: public.css の `bronze-shimmer` keyframes を改善**

既存:

```css
@keyframes bronze-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}
```

改善後:

```css
@keyframes bronze-shimmer {
  0% {
    background-position: -100% center;
  }
  100% {
    background-position: 200% center;
  }
}
```

- [ ] **Step 2: Button.tsx の primary variant クラスを改善**

既存:

```tsx
primary:
  "bg-accent text-white rounded-lg shadow-sm relative overflow-hidden hover:bg-[image:linear-gradient(110deg,transparent_25%,oklch(1_0_0/0.2)_50%,transparent_75%)] hover:bg-[length:200%_100%] hover:animate-[bronze-shimmer_1.5s_ease-in-out]",
```

改善後（narrow beam + translateY）:

```tsx
primary:
  "bg-accent text-white rounded-lg shadow-sm relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-[image:linear-gradient(110deg,transparent_33%,oklch(1_0_0/0.12)_50%,transparent_67%)] hover:bg-[length:250%_100%] hover:animate-[bronze-shimmer_2s_ease-in-out]",
```

変更点:

- `transparent_25%` → `transparent_33%`: beam を狭く
- `oklch(1_0_0/0.2)` → `oklch(1_0_0/0.12)`: 光沢を控えめに
- `200%` → `250%`: より穏やかな通過
- `1.5s` → `2s`: ゆっくり
- `transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md` 追加

- [ ] **Step 3: 型チェック + lint 実行**

```bash
bun run validate
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_styles/public.css src/app/'(public)'/_shared/components/design-system/Button.tsx
git commit -m "style(public): refine Button shimmer — narrower beam, subtle lift on hover"
```

---

## Task 5: 検証

- [ ] **Step 1: 全体検証**

```bash
bun run validate && bun run build
```

Expected: PASS（型チェック + lint + ビルド全て通る）

- [ ] **Step 2: Anti-AI セルフレビュー（6問チェック）**

1. タイポグラフィに serif/sans の対比があるか？ → **yes**（Cormorant + Noto Sans）
2. Accent カラーが控えめ（15% 以下）か？ → **yes**（Bronze ≤15%）
3. セクション間で padding に変化があるか？ → **yes**（SectionDesign の paddingTop/Bottom で管理）
4. アニメーションに主役/脇役の差があるか？ → **yes**（SplitText=主役, ScrollReveal=脇役）
5. カードに hover インタラクションがあるか？ → **yes**（SpaceCard: shadow-lg + scale-105）
6. SectionLabel コンポーネントを使っているか？ → **yes**（全セクションで使用）

6/6 PASS

- [ ] **Step 3: コミット（必要なら squash）**

全タスクが個別コミット済みなので追加不要。

---

## 管理画面整合性チェックリスト

| チェック項目                                                                                                    | 結果    |
| --------------------------------------------------------------------------------------------------------------- | ------- |
| `FeaturesConfig.items[].icon` の string 解釈が変わるが、既存値 `"clock"/"shield"/"sparkles"` は ICON_MAP で対応 | ✅ 安全 |
| 未知の icon 値はアクセント番号にフォールバック（既存データ破壊なし）                                            | ✅ 安全 |
| `TestimonialConfig.variant` の enum 値 `"default"/"card"/"minimal"` は変更なし                                  | ✅ 安全 |
| `GalleryConfig` のスキーマは一切変更なし                                                                        | ✅ 安全 |
| `SectionDesign` の padding/background/titleSize 等の反映は SectionWrapper 経由で維持                            | ✅ 安全 |
| `SectionRenderer.tsx` の switch 文は変更なし                                                                    | ✅ 安全 |
| 管理画面の DesignPanel / セクション編集フォームへの影響なし                                                     | ✅ 安全 |
