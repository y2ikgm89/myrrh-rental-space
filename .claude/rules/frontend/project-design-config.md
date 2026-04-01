---
paths:
  - src/app/(public*)/**
---

# Project Design Config（プロジェクト固有）

> 顧客ブランド固有のデザイン値を一箇所に集約。他のルールファイル・スキルはここを参照する。
> 別プロジェクトへ移植時はこのファイルのみ書き換える。

## ブランド

- **名前**: Myrrh Rental Space
- **ムード**: warm-minimal + elegant
- **性格**: 上質、洗練、安心、控えめな華やかさ

## カラーパレット

| 役割        | 配分 | 値                                   | トークン                |
| ----------- | ---- | ------------------------------------ | ----------------------- |
| Dominant    | 70%  | `oklch(0.995 0.002 250)` White       | `bg-background`         |
| Support     | 20%  | `oklch(0.97 0.003 250)` Surface      | `bg-surface`            |
| Accent      | 10%  | `oklch(0.75 0.06 65)` Champagne Gold | `text-primary-dark`     |
| Accent dark | —    | `oklch(0.55 0.08 65)` Darker Gold    | `gold-line`, CTA border |
| Muted text  | —    | `oklch(0.45 0.01 250)`               | `text-muted-foreground` |

**使用ルール**: Gold は `SectionLabel`、`MagneticButton`（CTA）、英語名、価格表示のみ。15%以下に抑える。

## タイポグラフィ

| 要素    | フォント      | クラス                                    | 備考                                                                     |
| ------- | ------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Heading | Noto Serif JP | `font-heading`                            | `@theme` で `--text-h*--font-weight/line-height/letter-spacing` 自動適用 |
| Body    | Noto Sans JP  | `font-sans`                               | normal weight                                                            |
| Label   | —             | `text-[11px] uppercase tracking-[0.25em]` | `gold-line` 装飾付き                                                     |

- **スケール比**: 1:4.5（body 16px → h1 72px）
- **Heading サイズ**: Fluid `clamp()` — `text-h1`/`text-h2`/`text-h3`/`text-hero`（breakpoint 不要）
- **正本**: `public.css` の `@theme` ブロック（`--text-hero`, `--text-h1`, `--text-h2`, `--text-h3`）

## セクション設計

| 要素              | 値                                                                   |
| ----------------- | -------------------------------------------------------------------- |
| Section padding   | Fluid: `py-[var(--spacing-section)]` = `clamp(5rem, 8vw, 7.5rem)`    |
| Hero              | `min-h-[80vh]`                                                       |
| Container         | `mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]` |
| Container padding | Fluid: `clamp(1.5rem, 3vw, 3rem)`                                    |
| Container max     | `80rem` (1280px)                                                     |
| セクション分離    | 背景色交互切替（white ↔ surface）、区切り線なし                      |
| Grid 傾向         | Container Queries: `@container` + `@md:grid-cols-2 @3xl:grid-cols-3` |
| border-radius     | コンテナ/画像=`rounded-lg`, CTA=`rounded-full`, セクション境界=sharp |

## コンポーネント規約

| コンポーネント     | スタイル                                                        | 備考                    |
| ------------------ | --------------------------------------------------------------- | ----------------------- |
| カード             | `border border-border bg-card` + `hover:shadow-lg`              | shadow 常時表示禁止     |
| カード画像         | `aspect-[4/3]` + `group-hover:scale-105 duration-500`           | —                       |
| カード情報         | Label(11px Gold) → Heading → Body(muted) → Metadata(`border-t`) | —                       |
| CTA ボタン         | `MagneticButton`（`rounded-full border border-primary-dark`）   | 1-2個/ページ            |
| Secondary ボタン   | テキスト + 下線 reveal                                          | —                       |
| Form ボタン        | `bg-primary text-primary-foreground rounded-lg`                 | —                       |
| セクションタイトル | `SectionLabel` → `mt-4` heading → `mt-4` description(muted)     | —                       |
| 画像               | `object-cover`, ParallaxImage or `hover:scale-105`              | Concept: `aspect-[4/5]` |

## モーション設計

| 役割   | コンポーネント                       | 定数                               |
| ------ | ------------------------------------ | ---------------------------------- |
| 主役   | `SplitText` (words/lines/chars)      | `STAGGER.char/word/line`           |
| 脇役   | `ScrollReveal` (y:40 + opacity)      | `DURATION.normal`, `EASE.outQuart` |
| 背景   | `ParallaxImage` (subtle: 0.3)        | `PARALLAX.subtle/normal`           |
| CTA    | `MagneticButton` (elastic snap-back) | `EASE.outElastic`                  |
| ヒント | `ScrollIndicator`                    | Hero 下部                          |

- **Easing**: `animations.ts` の `EASE` / `DURATION` / `STAGGER` 定数を使用（マジックナンバー禁止）
- **Duration**: fast=0.3, normal=0.6, slow=0.8, hero=1.5
- **入場順序**: SplitText → ScrollReveal → ParallaxImage
- **制約**: 1セクションで動く要素は最大3箇所

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
