---
paths:
  - src/app/(public*)/**
---

# Project Design Config（プロジェクト固有）

> 顧客ブランド固有のデザイン値を一箇所に集約。他のルールファイル・スキルはここを参照する。
> 別プロジェクトへ移植時はこのファイルのみ書き換える。

## ブランド

Myrrh Rental Space — Editorial Magazine

Kinfolk / Cereal 誌を参考にした雑誌的レイアウト。大量の余白、セリフイタリック見出し、控えめなインタラクション。ブロンズアクセントは継続使用するが装飾は最小限。

## カラーパレット

OKLCH形式。Luxury White × Bronze。

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

| トークン           | 値                                         | 推定サイズ | 用途                                 |
| ------------------ | ------------------------------------------ | ---------- | ------------------------------------ |
| `--text-hero`      | `clamp(3rem, 2rem + 4.5vw, 5rem)`          | 48 → 80 px | Hero セクション専用（homepage のみ） |
| `--text-h1`        | `clamp(1.875rem, 1.5rem + 1.75vw, 2.5rem)` | 30 → 40 px | ページメインタイトル                 |
| `--text-h2`        | `clamp(1.5rem, 1.25rem + 1.15vw, 2rem)`    | 24 → 32 px | セクション見出し                     |
| `--text-h3`        | `clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)`  | 20 → 24 px | サブセクション・カード見出し         |
| `--text-h4`        | `1.125rem`                                 | 18 px 固定 | ラベル的見出し                       |
| `--text-pullquote` | `clamp(1.5rem, 1.25rem + 1.15vw, 2rem)`    | 24 → 32 px | 記事中の強調引用                     |
| `--text-body`      | `1rem`                                     | 16 px      | 本文                                 |
| `--text-small`     | `0.875rem`                                 | 14 px      | メタ情報                             |
| `--text-eyebrow`   | `0.6875rem` + `tracking-[0.18em]`          | 11 px      | セクションラベル（uppercase）        |
| `--text-label`     | `0.6875rem`                                | 11 px      | フォームラベル                       |

### 参考サイト

- [Kinfolk](https://www.kinfolk.com/) — Cormorant Garamond light、記事タイトル ~40px
- [The Gentlewoman](https://thegentlewoman.co.uk/) — セリフ light、余白多め
- [Cereal Magazine](https://readcereal.com/) — 抑制された階層、~32–40px タイトル
- [Monocle](https://monocle.com/) — タイト line-height、密度高め

## セクション設計

| 要素              | 値                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --- | ---------------------------------------------------------------- |
| Section padding   | DB 駆動セクションは `SectionWrapper` が `pt/pb-[var(--space-sm                                                                                  | md                                              | lg  | xl)]` を適用（`--space-\*`は`public.css` の fluid 段階スケール） |
| Homepage padding  | ホームの DB セクションも同じく `SectionWrapper` + `SectionDesign`。ヒーロー本体は `Page.pageHero`（`PageHero` コンポーネント）で別経路          |
| Homepage 背景     | 全セクション `bg-background`（白）統一。視覚変化は余白・タイポグラフィ・画像で確保                                                              |
| Block padding     | Form/Auth/Dashboard: `py-[var(--spacing-block)]` = `clamp(2.5rem, 5vw, 4rem)`                                                                   |
| Hero              | ホーム: `pageHero.variant`（editorial-split / compact / minimal）。旧 `homepage-hero` Section は廃止                                            |
| Container         | `mx-auto max-w-[var(--container-max)]` + 横 inset は `padding-inline: var(--container-padding-start                                             | end)`（safe-area 考慮は `SectionWrapper` 参照） |
| Container padding | Fluid: `clamp(1rem, 3vw, 3rem)`（`--container-padding`）。editorial 幅は `--container-editorial`（50rem）                                       |
| Container max     | `80rem` (1280px)                                                                                                                                |
| セクション分離    | 余白は `--space-*` + 必要時 `border-t border-border`。`--spacing-section*` は廃止（`src` では使用禁止）                                         |
| Grid 傾向         | Container Queries: `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`                                                                            |
| border-radius     | コンテナ/画像=`rounded-lg`, 全ボタン=sharp（editorial 統一）, セクション境界=sharp。`rounded-full` はバッジ・タグ・アイコンボタン・スピナーのみ |

## コンポーネント規約

| コンポーネント              | スタイル                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 備考                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| カード（カタログ）          | `border border-border` シャープエッジ（rounded-lg/shadow 禁止）                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | hover: image opacity                                                                                                                                                                                                                                      |
| カード（ショーケース）      | 枠なし、ずらしグリッド + `group-hover:opacity-85`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | トップページのみ                                                                                                                                                                                                                                          |
| カード画像                  | カタログ: `aspect-[3/2]`、ショーケース: `aspect-[3/2]` or auto                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                         |
| カード情報                  | Label(11px Gold) → Heading(serif light) → Body(muted) → Metadata(inline)                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                         |
| カタロググリッド            | 2列固定（`sm:grid-cols-2`）+ ページネーション                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 3列禁止、件数増=ページ分割                                                                                                                                                                                                                                |
| CTA ボタン                  | `Button variant="editorial"`: シャープエッジ + bronze hover（`hover:bg-accent`）                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 全ページ統一                                                                                                                                                                                                                                              |
| Secondary ボタン            | テキスト + 下線 reveal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                         |
| Form ボタン                 | `bg-accent text-accent-foreground hover:bg-accent/90`（シャープエッジ — `rounded-full` 禁止）                                                                                                                                                                                                                                                                                                                                                                                                                                        | フォーム内 CTA（primary）                                                                                                                                                                                                                                 |
| Button editorial            | `border border-foreground hover:bg-accent hover:text-accent-foreground`（シャープエッジ）                                                                                                                                                                                                                                                                                                                                                                                                                                            | 全ページ CTA 統一                                                                                                                                                                                                                                         |
| セクションタイトル          | `text-center`、label(`0.8rem` uppercase tracking-[0.18em]) → `mt-4` heading(`clamp(2rem,4vw,3rem) font-light`) → description(muted)。accent line は Hero のみ                                                                                                                                                                                                                                                                                                                                                                        | ホームページ全セクション統一                                                                                                                                                                                                                              |
| 画像                        | `object-cover`, hover で `opacity-85` 遷移                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                         |
| ヘッダーブランド            | `font-heading font-light italic tracking-[0.08em]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | セリフイタリック                                                                                                                                                                                                                                          |
| ナビリンク                  | `text-[0.75rem] uppercase tracking-[0.18em]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | hover:text-foreground                                                                                                                                                                                                                                     |
| 番号付きリスト              | `font-heading font-light italic text-accent/50`（HowItWorks: 2.5rem / Features: 2rem）                                                                                                                                                                                                                                                                                                                                                                                                                                               | 01, 02, 03 形式                                                                                                                                                                                                                                           |
| PageLayout                  | content: hero+sections+CTA / form: hero+centered / dashboard: container                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                         |
| PageHero                    | editorial: スプリット / compact: bg-surface+heading / minimal: heading のみ                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                         |
| SiteCTA                     | bg-background + border-t、editorial ボタン（余白で分離）                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | content ページ末尾                                                                                                                                                                                                                                        |
| Section                     | 全セクション白背景統一、border-top/accent 装飾で分離                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | セクション間の分離                                                                                                                                                                                                                                        |
| EditorialCard               | featured: 横��割5:4 / default: 縦積みカード                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | hover:shadow-lg                                                                                                                                                                                                                                           |
| ArticleFooter               | `<footer>` 1 個に統合。タグは `border-y py-6` の上下線バンド、シェアは余白のみ分離（罫線なし）。タグなし時はシェアに `border-t pt-8`。`mt-12 border-t pt-6` の2連続ブロック禁止                                                                                                                                                                                                                                                                                                                                                      | `@/public/components/ui/article-footer`（posts/news/preview 共通、Kinfolk/Cereal/WordPress 準拠）                                                                                                                                                         |
| Divider                     | subtle: border / accent: 中央4rem / fade: gradient                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | セクション内の区切り                                                                                                                                                                                                                                      |
| ImageFrame                  | デフォルト `rounded-lg`。editorial カード内では `rounded={false}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | sharp edge 統一                                                                                                                                                                                                                                           |
| 一覧カード（list variant）  | 遷移表示は `hover:bg-accent/5` + タイトル色変化のみ。`IconArrowRight` + `group-hover:translate-x-1` 等の矢印 affordance 禁止                                                                                                                                                                                                                                                                                                                                                                                                         | Editorial トーンで矢印は冗長（`event-card.tsx` list variant 参照）。グリッド列定義から `_auto` 列も同時削除                                                                                                                                               |
| ボタンテキスト最小値        | editorial/CTA: `text-xs`（12px）、secondary リンク: `text-[0.7rem]`（11.2px）。`text-[0.65rem]` 以下禁止                                                                                                                                                                                                                                                                                                                                                                                                                             | uppercase + tracking で体感さらに小さくなるため                                                                                                                                                                                                           |
| 公開ページ タブ（primary）  | Radix Tabs primitive（ページ内 tabpanel 切替）or `<nav><ul><Link aria-current="page">`（ページ遷移ナビ）+ `text-base tracking-[0.12em] whitespace-nowrap` + active: `underline decoration-2 underline-offset-[6px] decoration-accent` / inactive: `decoration-transparent` + `transition-colors`。レイアウトは外側 `<div className="flex justify-center">` wrapper + 内側 `TabList/ul className="flex border-b border-border">` の 2 層分離（`flex w-fit justify-center` の同一要素指定は flex item 等幅分布バグを誘発するため禁止） | `events-view-switcher.tsx`（Radix Tabs）/ `mypage-nav.tsx`（nav）が canonical。`border-b-2 border-accent` on `inline-block` は Chromium の intrinsic width バグで Japanese + tracking の下線が text 末尾まで届かないため禁止（→ `gotchas.md`）            |
| サイトロゴ（Header/Footer） | `next/image` + `priority`（header のみ・LCP）+ `unoptimized`（SVG 公式推奨）+ `onError` でテキストフォールバック + `width`/`height` intrinsic + `className="h-6 md:h-8 w-auto object-contain"` + `sizes="(max-width: 768px) 120px, 160px"`。`<Link>` は `aria-label="サイト名 — ホームへ戻る"` で包む（WebAIM: alt=サイト名、"Home" は冗長）。未設定／`useLogo=false`／読込失敗時は `font-heading font-light italic tracking-[0.08em]` のテキストへフォールバック                                                                    | `SiteBrand` コンポーネント（`(public)/_shared/components/layouts/site-brand.tsx`）が SSoT。brand は Settings `siteName` / `headerLogoUrl` / `footerLogoUrl` / `useHeaderLogo` / `useFooterLogo` を `HeaderSettings.brand` / `FooterSettings.brand` に集約 |
| 選択カード（radio）         | `border-accent bg-accent/5`（ring/shadow なし）。未選択: `border-border hover:border-foreground/30`                                                                                                                                                                                                                                                                                                                                                                                                                                  | 予約フォーム                                                                                                                                                                                                                                              |
| 選択コントロール（小）      | `bg-accent text-accent-foreground`（塗りつぶし）。時間/日付/利用時間                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 明確なフィードバック                                                                                                                                                                                                                                      |
| フォーム枠                  | `border border-border p-6 sm:p-8`（1枠で全フィールド囲む。個別枠・区切り線禁止）                                                                                                                                                                                                                                                                                                                                                                                                                                                     | space-y-6 で間隔統一                                                                                                                                                                                                                                      |
| StepIndicator               | active: outline（`border-accent text-accent`）/ completed: fill（`bg-accent`）/ pending: muted                                                                                                                                                                                                                                                                                                                                                                                                                                       | 現在地 vs 完了の区別                                                                                                                                                                                                                                      |

## ホームページ構成（Editorial Magazine）

1. **Hero** — 雑誌カバー風スプリット（左画像 + 右セリフイタリック見出し）
2. **HowItWorks** — ご利用の流れ3ステップ + バリュープロップ帯（1セクションに統合）
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
- **制約**: 1セクションで動く要素は最大3箇所

## レスポンシブ設計（Tailwind 4 公式準拠）

### ブレイクポイント policy

public.css / admin.css 両方で **Tailwind default bp 維持 + `--breakpoint-3xl` 追加** の 6 段階構成。完全リセット（`--breakpoint-*: initial`）は shadcn/ui・Radix エコシステム互換性を損なうため不採用。

| bp  | 値       | px   | semantic 用途                                    |
| --- | -------- | ---- | ------------------------------------------------ |
| sm  | `40rem`  | 640  | large phone                                      |
| md  | `48rem`  | 768  | tablet portrait                                  |
| lg  | `64rem`  | 1024 | tablet landscape / laptop (admin サイドバー出現) |
| xl  | `80rem`  | 1280 | desktop                                          |
| 2xl | `96rem`  | 1536 | large desktop                                    |
| 3xl | `120rem` | 1920 | ultra wide / 2K-4K monitor                       |

### 採用方針

- **マクロレイアウト**（Hero split, 2 カラム text+image, フォームグリッド）: **viewport breakpoint**（`md:grid-cols-2`）
- **カードグリッド / ダッシュボード widget**: **Container Queries**（`@container` + `@md:grid-cols-2 @3xl:grid-cols-3`）
- **管理画面 dashboard**: **named container**（`@container/main` on `MainContent.tsx` → children で `@md/main:` / `@3xl/main:`）— サイドバー折りたたみ時の適応に必須
- **ultra-wide 対応**: `@3xl` / `3xl:` variant を使用。default `lg:grid-cols-3` の上位として追加

### Layout tokens（public.css / admin.css 共通プレフィックス）

| トークン                    | public 値                    | admin 値                     | 用途                                     |
| --------------------------- | ---------------------------- | ---------------------------- | ---------------------------------------- |
| `--container-max`           | `80rem` (1280px)             | `100rem` (1600px)            | ページ幅の上限                           |
| `--container-padding`       | `clamp(1rem, 3vw, 3rem)`     | `clamp(1rem, 2vw, 2rem)`     | fluid 水平 padding                       |
| `--container-header-max`    | `90rem` (1440px)             | N/A                          | site-header の拡張幅                     |
| `--container-measure`       | `65ch`                       | N/A                          | editorial Prose の読みやすさ上限         |
| `--prose-narrow`            | `40ch`                       | N/A                          | Hero subtitle 等の狭い測度               |
| `--prose-medium`            | `45ch`                       | N/A                          | SiteCTA 説明文等                         |
| `--header-height`           | 3.5rem (mobile) / 4rem (md+) | 3.5rem (mobile) / 4rem (md+) | sticky UI・scroll offset の SSoT         |
| `--hero-min-height`         | `60svh`                      | N/A                          | Hero 最小高さ                            |
| `--modal-max-height`        | `85vh`                       | `85vh`                       | Dialog の最大高                          |
| `--lightbox-max-height`     | `90svh`                      | N/A                          | image-gallery lightbox                   |
| `--lightbox-max-width`      | `90vw`                       | N/A                          | 同上                                     |
| `--dropdown-min-width`      | `12rem`                      | `12rem`                      | filter-bar / その他 DropdownMenu.Content |
| `--sidebar-width`           | N/A                          | `18rem` (288px)              | admin desktop sidebar                    |
| `--sidebar-width-collapsed` | N/A                          | `4rem` (64px)                | admin collapsed sidebar                  |
| `--touch-target-min`        | `2.75rem` (44px)             | `2.75rem` (44px)             | WCAG 2.5.5 Enhanced 最小ヒットエリア     |

### WCAG 2.5.5 Enhanced (AAA) 準拠

全 Button / interactive element は **44×44 CSS px 以上**。public Button / admin Button 両方とも sm/md/lg/icon すべて `min-h-11`（44px）以上。

### Viewport metadata（Next.js 16）

| layout                        | themeColor                     | interactiveWidget | colorScheme |
| ----------------------------- | ------------------------------ | ----------------- | ----------- |
| `src/app/(public)/layout.tsx` | DB 動的（Settings）            | `resizes-visual`  | `"light"`   |
| `src/app/(admin)/layout.tsx`  | light/dark array（Trust Blue） | `resizes-visual`  | `"light"`   |

`interactiveWidget: "resizes-visual"` により仮想キーボード表示時に visual viewport が縮小される（入力中に送信ボタンが可視維持）。

## UX 定数

| 定数                     | 値           | 根拠                                                                                            |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------- |
| ホバープレビューディレイ | 500ms        | 意図的ホバーと通過を区別する最短値。2秒は遅すぎ、即時はチラつく                                 |
| 料金表記                 | `/h`, `/day` | 英語略記で統一。`/時間` `/日` は使用しない。「日本語メイン + 英語アクセント」デザイン言語に準拠 |

## 管理画面テーマ

- **テーマ名**: Swiss Industrial Admin（全顧客共通・固定）
- **Primary**: Trust Blue `oklch(0.55 0.20 260)`
- **Background**: `oklch(0.98 0.005 250)`
- **Sidebar**: bg `oklch(0.18 0.03 260)`, accent `oklch(0.55 0.20 260)`

## 参照ファイル

| ファイル                                           | 内容                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `(public*)/_styles/public*.css`                    | 公開ページテーマ変数                                   |
| `(public*)/_shared/lib/animations.ts`              | DURATION / EASE / STAGGER / PARALLAX 定数              |
| `(public*)/_shared/components/animations/`         | SplitText, ParallaxImage, MagneticButton, ScrollReveal |
| `(public*)/_shared/components/ui/SectionLabel.tsx` | ゴールドライン付きラベル                               |
| `(admin)/_styles/admin.css`                        | 管理画面テーマ変数                                     |

## ヘッダーレイアウト（Apple / Kinfolk / Airbnb 方式）

3 列 Grid の対称配置（Logo 左 / Nav 中央 / Auth+CTA 右）は Apple / Kinfolk / Airbnb 等の Editorial 系業界標準構造。`grid-cols-3` で各列 `minmax(0, 1fr)` 均等、`col-start-*` で明示配置 + `justify-self-*` で内部位置を制御する。

**container 外側**:

```tsx
<div className="mx-auto grid max-w-[90rem] grid-cols-2 items-center justify-items-start gap-6 px-5 py-4 md:grid-cols-3 md:gap-10 md:px-8 md:py-5 lg:gap-16">
```

- `max-w-[90rem]` (= 1440px) で Apple 相当の幅制約、viewport 1920px 超でも中央寄せ
- モバイル: `grid-cols-2`（Brand + Trigger）、デスクトップ: `md:grid-cols-3`（Brand + Nav + Auth）
- `justify-items-start` で全 item の default alignment を start（stretch を回避）

**各要素の配置**:

| 要素           | class                                   | 効果                                           |
| -------------- | --------------------------------------- | ---------------------------------------------- |
| Brand          | なし（直接配置、inline-flex 内部）      | container default で cell 左端に shrink-to-fit |
| Nav            | `md:col-start-2 md:justify-self-center` | col2 中央（厳密 offset 0px）                   |
| Auth + CTA     | `md:col-start-3 md:justify-self-end`    | col3 右端                                      |
| Mobile Trigger | `justify-self-end md:hidden`            | mobile 時右端                                  |

**Radix NavigationMenu は公式構造 `Root > List > Item` 単体**。認証リンク・CTA を Root 内に混在させず、Root の兄弟として配置する（accessibility 契約の純粋化）。参照実装: `src/app/(public)/_shared/components/layouts/site-header.tsx`。

## カレンダーヘッダーレイアウト（Google / Outlook / Editorial 方式）

カレンダーの月ナビは `[今日] [<] [>]` 左集約が業界標準（Google Calendar / Outlook / Notion Calendar）。「今日」が最頻アクションで F パターン到達最短、prev/next は対で隣接維持する。Editorial トーンでは月タイトル（MonthPicker）を**中央配置**し、ページ見出しとして機能させる。

片側のみナビがある 3 要素構成で真に中央配置するには `grid-cols-[1fr_auto_1fr]` + 空 spacer パターンを使う:

```tsx
<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
  <div className="flex items-center gap-2 justify-self-start">
    <TodayButton /> <PrevMonthButton /> <NextMonthButton />
  </div>
  <div className="justify-self-center">
    <MonthPicker ... />
  </div>
  <div aria-hidden="true" />
</div>
```

- `justify-between` は要素が 2 個の場合のみ真に対称。3 要素で「左群 + 中央 + 空」にするには grid が必須（flex では不可能）
- 「今日」ボタンは `<` / `>` と同じ `h-10` に揃える（`px-4` で横長化してグループ一体感）
- 左集約グループ内のボタンは同一 border treatment で揃える（`[今月] [<] [>]` 全て `h-10 border border-border hover:border-foreground/30`）。borderless chevron と bordered 「今月」の混在は視覚不一致を招く。矢印を borderless にするのは中央フランキング（`< 2026年5月 >` 型）で「月名=主役、矢印=脇役」を強調する時のみ
- **中央配置ボタンに trailing icon（`▾` / chevron 等）を置く場合は `absolute left-full` で flow 外に出す** — `<button>Label<span>▾</span></button>` を `grid-cols-[1fr_auto_1fr]` の auto 列に置くと、button 幾何中心は「Label + icon」全幅の中央になり、Label テキストの光学中心が兄弟の flex 中央揃え要素（タブ等）と比べて icon 幅分だけ左にずれる。`<span aria-hidden className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2">▾</span>` で icon を flow 外に出すと Label が auto 列の真ん中に揃う。参照実装: `month-picker.tsx` のトリガーボタン
- 参照実装: `src/app/(public)/events/_components/calendar-month-nav.tsx`（shared component） / `event-calendar-view.tsx` / `event-list-view.tsx`

## Disclosure trigger chevron（Radix / shadcn 準拠）

Accordion / Select / Popover / custom picker の trigger に付く `▾` / chevron は **`aria-expanded` と rotate で state 連動させる**。`group-hover:translate-y-*` 等の装飾-only hover アニメは禁止（open 中も `▾` のまま state と矛盾し、hover で下がる動きに意味がない）。

```tsx
<button aria-expanded={open} className="group relative ...">
  {label}
  <span
    aria-hidden="true"
    className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180"
  >
    ▾
  </span>
</button>
```

- trigger に `aria-expanded={open}` が既に付与されていれば CSS のみで state feedback 実現（JS 不要）
- `▾` + `rotate-180` = `▴` 相当の視覚表現（Unicode 文字切替より transform の方が滑らか）
- Radix Accordion `data-[state=open]:rotate-180` も同義だが、custom trigger では `aria-expanded` 属性セレクタを使う（Radix primitive 外でも機能）
- 参照実装: `src/app/(public)/events/_components/month-picker.tsx`

## Editorial underline reveal（Apple / Aesop / Kinfolk 方式）

Nav リンクの hover / focus / active 状態で `::after` 疑似要素が左→右に `scaleX(0→1)` アニメーションし、bronze accent の 1px 下線を reveal する。業界標準 Editorial pattern。

```tsx
const DESKTOP_NAV_LINK_CLASS =
  "relative whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 aria-[current=page]:text-foreground aria-[current=page]:after:origin-left aria-[current=page]:after:scale-x-100";
```

- `aria-[current=page]` で現在ページに常時表示（WAI-ARIA landmark）
- `data-[state=open]` で Radix dropdown trigger の active state と統合
- `prefers-reduced-motion` は CSS `transition-transform` のみで自動対応（GSAP 不使用）
- **LogoutButton 等 Custom button にも同スタイル適用**で一貫した視覚 feedback（参照: `logout-button.tsx` desktop-nav variant）

## Loading button anti-layout-shift（Apple / Stripe / Airbnb 方式）

pending state で text を変えると button 幅が変化してレイアウトシフト発生。業界標準:

- text は常時不変（「ログアウト」を維持、「ログアウト中...」に切替えない）
- icon を `IconLoader2` + `animate-spin` に差し替え
- `aria-busy={isPending}` で SR 通知
- `<span className="sr-only">中</span>` で visual 影響なく状態伝達

```tsx
<button
  type="button"
  disabled={isPending}
  aria-busy={isPending}
  className={VARIANT_CLASS[variant]}
>
  {isPending ? (
    <IconLoader2 className={cn(ICON_CLASS, "animate-spin")} aria-hidden />
  ) : (
    <IconLogout className={ICON_CLASS} aria-hidden />
  )}
  <span>ログアウト</span>
  {isPending && <span className="sr-only">中</span>}
</button>
```

参照実装: `src/app/(public)/_shared/components/ui/logout-button.tsx`。

## Editorial デザイン Gotchas（gotchas.md より移動）

- **editorial ボタンは全箇所 `Button variant="editorial"` で統一** — raw `<Link>` + インラインスタイルで editorial ボタンを実装しない。`button.tsx` の editorial variant（シャープエッジ + bronze hover）が Single Source of Truth。site-header / cta-section / site-cta すべてで Button コンポーネントを使用
- **公開ページで `bg-foreground`（ダーク反転セクション）禁止** — Editorial Magazine（Kinfolk/Cereal）は全コンテンツセクション白背景が基本。ダーク全幅セクションは Accent 10% 制約を超え、トーンが崩れる。SiteCTA は `bg-background` + `border-t border-border`（余白で分離）
- **`editorial-border-accent` CSS クラスは Divider 専用** — `width: 4rem` を持つ短い装飾線。`Section border="accent"` 等の全幅要素に使うとレイアウトが 4rem 幅に潰れる。Section の accent border は `border-t-2 border-accent`（Tailwind ユーティリティ）を使用
- **Button editorial に色反転 override を書かない** — ダーク背景用の `className="border-background text-background hover:bg-background hover:text-accent"` は Button の variant 設計を迂回するハック。背景を `bg-background`（白）にし、editorial variant をそのまま使う
- **`section-design.ts` の値配列変更時は DesignFields + 型ガードも同期必須** — `DesignFields.tsx` の `backgroundOptions`/`paddingOptions`/`maxWidthOptions` + Set-based 型ガード（`isBgValue` 等）が `sectionBgValues`/`sectionSpacingValues`/`sectionMaxWidthValues` と 1:1 対応
