---
description: ブランド定義 + カラーパレット + タイポグラフィスケール + セクション設計 + コンポーネント規約 + ホームページ構成 + モーション設計
paths:
  - src/app/(public*)/**
  - src/app/(public*)/_styles/public*.css
  - src/app/(public*)/_shared/lib/animations.ts
---

# Project Design Foundations（ブランド・タイポ・コンポーネント規約）

> Myrrh Rental Space — Editorial Magazine ブランドの SSoT。

## ブランド

Myrrh Rental Space — Editorial Magazine

Kinfolk / Cereal 誌を参考にした雑誌的レイアウト。大量の余白、セリフイタリック見出し、控えめなインタラクション。ブロンズアクセントは継続使用するが装飾は最小限。

## カラーパレット

OKLCH 形式。Luxury White × Bronze。

| ロール   | 配分 | 値                                   | メモ                            |
| -------- | ---- | ------------------------------------ | ------------------------------- |
| Dominant | 70 % | `oklch(0.985 0.005 60)` Warm White   | ページ背景                      |
| Support  | 20 % | `oklch(0.96 0.008 60)` Light Surface | カード・セクション背景          |
| Accent   | 10 % | `oklch(0.62 0.07 60)` Soft Bronze    | ラベル・CTA・価格のみ（≤ 15 %） |

## タイポグラフィ

- Serif heading: Cormorant Garamond（欧文 Hero/H1/H2）
- Sans body: Noto Sans JP（日本語全般、H3 以下、UI）
- Fallback: Cormorant Garamond → Noto Sans JP → serif（日本語グリフ自動フォールバック）
- スケール: モジュラー比 ~1.25（Major Third）。Hero はインパクト用の外れ値
- Fluid: `clamp(min, fluid, max)` を 375px → 1280px viewport にアンカー
- Font-weight / letter-spacing / line-height は全て `@theme --text-*--{font-weight,letter-spacing,line-height}` で集中管理（呼び出し側で `font-light` 等を重ねない）
- 見出しは `text-wrap: balance` + `word-break: auto-phrase`（日本語フレーズ折返し）を `@layer base` で全 h1–h6 に自動適用

### スケール（`src/app/(public)/_styles/public.css`）

| トークン           | 値                                         | 推定サイズ | 用途                                                                     |
| ------------------ | ------------------------------------------ | ---------- | ------------------------------------------------------------------------ |
| `--text-hero`      | `clamp(3rem, 2rem + 4.5vw, 5rem)`          | 48 → 80 px | Hero セクション専用（homepage のみ）                                     |
| `--text-page-hero` | `clamp(2.25rem, 1.75rem + 2vw, 3.5rem)`    | 36 → 56 px | 内部ページ hero h1（StandardHeroSection 全 variant、日本語見出し最適化） |
| `--text-h1`        | `clamp(1.875rem, 1.5rem + 1.75vw, 2.5rem)` | 30 → 40 px | ページメインタイトル                                                     |
| `--text-h2`        | `clamp(1.5rem, 1.25rem + 1.15vw, 2rem)`    | 24 → 32 px | セクション見出し                                                         |
| `--text-h3`        | `clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)`  | 20 → 24 px | サブセクション・カード見出し                                             |
| `--text-h4`        | `1.125rem`                                 | 18 px 固定 | ラベル的見出し                                                           |
| `--text-pullquote` | `clamp(1.5rem, 1.25rem + 1.15vw, 2rem)`    | 24 → 32 px | 記事中の強調引用                                                         |
| `--text-body`      | `1rem`                                     | 16 px      | 本文                                                                     |
| `--text-small`     | `0.875rem`                                 | 14 px      | メタ情報                                                                 |
| `--text-eyebrow`   | `0.6875rem` + `tracking-[0.18em]`          | 11 px      | セクションラベル（uppercase）                                            |
| `--text-label`     | `0.6875rem`                                | 11 px      | フォームラベル                                                           |

### 参考サイト

- [Kinfolk](https://www.kinfolk.com/) — Cormorant Garamond light、記事タイトル ~40px
- [The Gentlewoman](https://thegentlewoman.co.uk/) — セリフ light、余白多め
- [Cereal Magazine](https://readcereal.com/) — 抑制された階層、~32–40px タイトル
- [Monocle](https://monocle.com/) — タイト line-height、密度高め

## セクション設計

| 要素              | 値                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section padding   | DB 駆動セクションは `SectionWrapper` が `pt/pb-[var(--space-sm/md/lg/xl)]` を適用（`--space-*` は `public.css` の fluid 段階スケール）                |
| Homepage padding  | ホームの DB セクションも同じく `SectionWrapper` + `SectionDesign`。ヒーロー本体は `Page.pageHero`（`PageHero` コンポーネント）で別経路                |
| Homepage 背景     | 全セクション `bg-background`（白）統一。視覚変化は余白・タイポグラフィ・画像で確保                                                                    |
| Block padding     | Form/Auth/Dashboard: `py-[var(--spacing-block)]` = `clamp(2.5rem, 5vw, 4rem)`                                                                         |
| Hero              | ホーム: `pageHero.variant`（editorial-split / compact / minimal）。旧 `homepage-hero` Section は廃止                                                  |
| Container         | `mx-auto max-w-[var(--container-max)]` + 横 inset は `padding-inline: var(--container-padding-start/end)`（safe-area 考慮は `SectionWrapper` 参照）   |
| Container padding | Fluid: `clamp(1rem, 3vw, 3rem)`（`--container-padding`）。editorial 幅は `--container-editorial`（50rem）                                             |
| Container max     | `80rem` (1280px)                                                                                                                                      |
| セクション分離    | 余白は `--space-*` + 必要時 `border-t border-border`。`--spacing-section*` は廃止（`src` では使用禁止）                                               |
| Grid 傾向         | Container Queries: `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`                                                                                  |
| border-radius     | コンテナ/画像 = `rounded-lg`, 全ボタン = sharp（editorial 統一）, セクション境界 = sharp。`rounded-full` はバッジ・タグ・アイコンボタン・スピナーのみ |

## コンポーネント規約（要約）

主要コンポーネントの設計値は `_shared/components/design-system/` の SSoT を参照:

- **Card / Image / カードグリッド**: catalog/showcase variants、aspect-[3/2]、`rounded-lg`、hover opacity-85
- **CTA / Editorial Button**: シャープエッジ + bronze hover、`Button variant="editorial"` 統一
- **Form ボタン**: `bg-accent text-accent-foreground hover:bg-accent/90`（`rounded-full` 禁止）
- **セクションタイトル**: `text-center` + label (`0.8rem` uppercase tracking-[0.18em]) → `mt-4` heading (`clamp(2rem, 4vw, 3rem) font-light`) → description
- **PageLayout**: content / form / dashboard variants
- **PageHero**: editorial / compact / minimal variants
- **SiteCTA**: `bg-background` + `border-t`、editorial ボタン
- **EditorialCard**: featured = 横 5:4 / default = 縦積み
- **ArticleFooter**: `<footer>` 1 個に統合、タグ `border-y py-6`、シェア余白のみ（`@/public/components/ui/article-footer`）
- **Divider**: subtle / accent（中央 4rem）/ fade
- **ImageFrame**: デフォルト `rounded-lg`、editorial カード内では `rounded={false}`
- **タブ**: Radix Tabs primitive or `<nav><ul><Link aria-current="page">` + `text-base tracking-[0.12em] whitespace-nowrap` + active underline reveal
- **サイトロゴ**: `SiteBrand`（`(public)/_shared/components/layouts/site-brand.tsx`）が SSoT
- **選択カード（radio）**: `border-accent bg-accent/5`、未選択 `border-border hover:border-foreground/30`
- **選択コントロール（小）**: `bg-accent text-accent-foreground` 塗りつぶし
- **フォーム枠**: `border border-border p-6 sm:p-8`（1 枠で全フィールド囲む、個別枠・区切り線禁止）
- **StepIndicator**: active outline / completed fill / pending muted
- **ボタンテキスト最小**: editorial/CTA `text-xs`(12px)、secondary `text-[0.7rem]`(11.2px)。`text-[0.65rem]` 以下禁止

## ホームページ構成（Editorial Magazine）

1. **Hero** — 雑誌カバー風スプリット（左画像 + 右セリフイタリック見出し）
2. **HowItWorks** — ご利用の流れ 3 ステップ + バリュープロップ帯（1 セクションに統合）
3. **Spaces** — Center Stage Carousel（重なりカードスタック、無限スクロール、detail パネル + ドットナビ）
4. **Features** — 番号付き editorial リスト（01, 02, ...）
5. **CTA** — 日本語見出し + ボーダーボタン

## モーション設計

| 役割   | コンポーネント                       | 定数                               |
| ------ | ------------------------------------ | ---------------------------------- |
| 主役   | `SplitText` (words/lines/chars)      | `STAGGER.char/word/line`           |
| 脇役   | `ScrollReveal` (y:40 + opacity)      | `DURATION.normal`, `EASE.outQuart` |
| 背景   | `ParallaxImage` (subtle: 0.3)        | `PARALLAX.subtle/normal`           |
| CTA    | `MagneticButton` (elastic snap-back) | `EASE.outElastic`                  |
| ヒント | `ScrollIndicator`                    | Hero 下部                          |

- **Easing**: `animations.ts` の `EASE` / `DURATION` / `STAGGER` 定数を使用（マジックナンバー禁止）
- **Duration**: fast=0.3, normal=0.6, slow=0.8, hero=1.2
- **入場順序**: SplitText → ScrollReveal → ParallaxImage
- **制約**: 1 セクションで動く要素は最大 3 箇所
