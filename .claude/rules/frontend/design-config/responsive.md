---
description: レスポンシブ設計（ブレイクポイント policy / Container Queries / Layout tokens / WCAG 2.5.5 / viewport metadata / z-index 階層）+ UX 定数 + 管理画面テーマ
paths:
  - src/app/(public*)/**
  - src/app/(public*)/_styles/public*.css
  - src/app/(admin)/_styles/admin*.css
  - src/app/(admin)/**
  - src/app/(public*)/layout.tsx
  - src/app/(admin)/layout.tsx
---

# レスポンシブ設計 + UX 定数 + 管理画面テーマ

> Tailwind 4 公式準拠の 6 段ブレイクポイント + Container Queries + Layout tokens SSoT + WCAG 2.5.5 タッチターゲット + Viewport metadata + 公開ページ z-index 階層。

## ブレイクポイント policy

6 段階構成（sm〜3xl）の値・semantic 用途・`--breakpoint-3xl` 追加理由は `tailwind-patterns/responsive-breakpoints.md` SSoT を参照。

## 採用方針

マクロレイアウトに viewport breakpoint、カードグリッドに Container Queries を使い分ける canonical 方針は `tailwind-patterns/container-queries.md` SSoT を参照。named container（`@container/main`）/ `CARD_GRID_COLS_MAP` も同ファイルに記載。

## Layout tokens（public.css / admin.css 共通プレフィックス）

| トークン                    | public 値                                            | admin 値                     | 用途                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--container-max`           | `80rem` (1280px)                                     | `100rem` (1600px)            | ページ幅の上限                                                                                                                                                                                                                                                                                                                                                                                     |
| `--container-padding`       | `clamp(1rem, 3vw, 3rem)`                             | `clamp(1rem, 2vw, 2rem)`     | fluid 水平 padding                                                                                                                                                                                                                                                                                                                                                                                 |
| `--container-header-max`    | `90rem` (1440px)                                     | N/A                          | site-header の拡張幅                                                                                                                                                                                                                                                                                                                                                                               |
| `--container-measure`       | `65ch`                                               | N/A                          | editorial Prose の読みやすさ上限                                                                                                                                                                                                                                                                                                                                                                   |
| `--prose-narrow`            | `40ch`                                               | N/A                          | Hero subtitle 等の狭い測度                                                                                                                                                                                                                                                                                                                                                                         |
| `--prose-medium`            | `45ch`                                               | N/A                          | SiteCTA 説明文等                                                                                                                                                                                                                                                                                                                                                                                   |
| `--header-height`           | 3.5rem (mobile) / 4rem (md+)                         | 3.5rem (mobile) / 4rem (md+) | sticky UI・scroll offset の SSoT                                                                                                                                                                                                                                                                                                                                                                   |
| `--hero-header-offset`      | `var(--header-height)` (transparent) / `0px` (solid) | N/A                          | **hero の被り補正 pt の SSoT**。`#main-content` に default `0px`、`[data-header-transparent]` で `header-height` を設定。透過ヘッダー時のみ `<main>` の負マージン (`-header-height`) を相殺。**hero pt に `--header-height` 直書き禁止** — solid モード（`@default(solid)`）は負マージンが無く二重計上＝ヘッダー高さ分の死に余白になる（→ `design-config/public-page-gotchas.md` §余白の二重計上） |
| ページ chrome 全体高さ      | `min-h-dvh`                                          | `min-h-dvh`                  | layout / global-not-found / maintenance / auth ページの最外 wrapper。`h-screen` / `min-h-screen` / `100vh` 全廃済 (PR #216、iOS Safari address bar bug 対策)                                                                                                                                                                                                                                       |
| `--hero-min-height`         | `60svh`                                              | N/A                          | Hero 最小高さ (svh = small viewport で安定固定)                                                                                                                                                                                                                                                                                                                                                    |
| `--modal-max-height`        | `85vh`                                               | `85vh`                       | Dialog の最大高                                                                                                                                                                                                                                                                                                                                                                                    |
| `--lightbox-max-height`     | `90svh`                                              | N/A                          | image-gallery lightbox                                                                                                                                                                                                                                                                                                                                                                             |
| `--lightbox-max-width`      | `90vw`                                               | N/A                          | 同上                                                                                                                                                                                                                                                                                                                                                                                               |
| `--dropdown-min-width`      | `12rem`                                              | `12rem`                      | filter-bar / その他 DropdownMenu.Content                                                                                                                                                                                                                                                                                                                                                           |
| `--sidebar-width`           | N/A                                                  | `18rem` (288px)              | admin desktop sidebar                                                                                                                                                                                                                                                                                                                                                                              |
| `--sidebar-width-collapsed` | N/A                                                  | `4rem` (64px)                | admin collapsed sidebar                                                                                                                                                                                                                                                                                                                                                                            |
| `--touch-target-min`        | `2.75rem` (44px)                                     | `2.75rem` (44px)             | WCAG 2.5.5 Enhanced 最小ヒットエリア                                                                                                                                                                                                                                                                                                                                                               |

## WCAG 2.5.5 Enhanced (AAA) 準拠

44×44 CSS px 要件・要素別サイズ基準・`--touch-target-min` token・例外条項・禁止/OK パターンは `frontend/accessibility/touch-text.md` SSoT を参照。このファイルでは `--touch-target-min: 2.75rem` token を Layout tokens 表（下記）にのみ掲載する。

## Viewport metadata（Next.js 16）

| layout                        | themeColor                     | interactiveWidget | colorScheme |
| ----------------------------- | ------------------------------ | ----------------- | ----------- |
| `src/app/(public)/layout.tsx` | DB 動的（Settings）            | `resizes-visual`  | `"light"`   |
| `src/app/(admin)/layout.tsx`  | light/dark array（Trust Blue） | `resizes-visual`  | `"light"`   |

`interactiveWidget: "resizes-visual"` により仮想キーボード表示時に visual viewport が縮小される（入力中に送信ボタンが可視維持）。

## 公開ページ z-index 階層（SSoT）

| 層                     | クラス      | 用途                                                            |
| ---------------------- | ----------- | --------------------------------------------------------------- |
| Modal / Dialog overlay | `z-50`      | mobile menu Dialog, image lightbox                              |
| Sticky header          | `z-40`      | `site-header.tsx`（**他要素で使用禁止**）                       |
| Active content / nav   | `z-30`      | Carousel active card, carousel nav arrows, sticky bottom bar 等 |
| Side content           | `z-20` 以下 | Carousel side cards (distance 1+) 等                            |

**規律**: `absolute` / `fixed` 配置の interactive UI を `z-40` 以上にしない。スクロール時に sticky header（z-40）と stacking 衝突し、**DOM 順で後勝ちすると要素がヘッダーの上に貼り付く silent bug** を起こす。実例: `spaces-carousel.tsx` の nav arrows が当初 `z-40` でヘッダーと衝突 → `z-30` に修正（2026-05-01）。新規 `z-*` クラス追加時は本表を必ず参照。Lexical fullscreen 等で動的 z-index を inline style で扱うパターンは `tailwind-patterns/inline-style-vs-arbitrary.md` 参照。

## UX 定数

| 定数                     | 値           | 根拠                                                                                            |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------- |
| ホバープレビューディレイ | 500ms        | 意図的ホバーと通過を区別する最短値。2 秒は遅すぎ、即時はチラつく                                |
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
