---
description: 公開ページ UI・スクロール/アニメ・マイページ・ホームヒーローの SSoT コンポーネント/定数
paths:
  - "src/app/(public)/**"
  - src/shared/lib/sections/definitions/page-hero/**
---

# SSOT — 公開 UI / マイページ / ホームヒーロー

プロジェクト全体で単一定義を厳守する定数・シングルトン。ローカル再定義・重複定義は禁止。

## 公開 UI / スクロール / アニメ

| 定数/変数                                                             | 場所                                                                                                        | メモ                                                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skeleton` (public)                                                   | `@/public/components/design-system/skeleton`                                                                | 公開ページ loading.tsx の base primitive SSoT。spinner-only fallback 禁止（→ `frontend/loading-skeleton.md`）                                      |
| `scrollToElement` / `scrollToElementById` / `scrollToTop`             | `@/public/lib/scroll`                                                                                       | `--header-height` 補正 + `prefers-reduced-motion` で `behavior: "instant"` 切替                                                                    |
| `ScrollReveal` / `ScrollRevealGroup`                                  | `@/public/components/animations/scroll-reveal`                                                              | 入場演出 SSoT。`.map` リストは `ScrollRevealGroup`（stagger）。個別 wrap は fold 外 opacity:0 の silent bug（→ `frontend/gsap/scroll-trigger.md`） |
| `CARD_GRID_COLS_MAP` / `getCardGridColsClass`                         | `@/public/lib/section-style-maps`                                                                           | 公開 Section カード列数 SSoT。`@container` + `@md:grid-cols-2 @3xl:grid-cols-3` の container query。consumer 側で親に `@container` 付与必須        |
| `GRID_COLS_MAP` / `GALLERY_GRID_COLS_MAP`                             | `@/public/lib/section-style-maps`                                                                           | InstagramSection / NewsListSection / GallerySection の列数 SSoT。viewport breakpoint 復活禁止                                                      |
| `HERO_PARALLAX_HEIGHT_MAP` / `StandardHeroSection.HEIGHT_MAP`         | `@/public/lib/section-style-maps` / `_components/StandardHeroSection.tsx`                                   | Hero 高さ SSoT。`@theme` token 参照、arbitrary svh 復活禁止                                                                                        |
| `getTitleClasses` / `getTitleStyle` / `getTextStyle` / `titleSizeMap` | `@/public/components/sections/section-style-helpers`                                                        | section title / text style 算出 SSoT（pure module）。`SectionWrapper.tsx` からの re-export 禁止                                                    |
| `--text-page-hero` / `StandardHeroSection` 全 5 variant h1            | `(public)/_styles/public.css` + `_components/StandardHeroSection.tsx`                                       | 内部ページ hero h1 専用 scale SSoT（`clamp(2.25rem, 1.75rem + 2vw, 3.5rem)`）。hero h1 への `text-h1` 等他 scale 上書き禁止                        |
| `NavigationItem.label` (ButtonLabelToken[]) / `TokenLabel` 共有 SC    | `prisma/schema.prisma` + `@/shared/domain/navigation/{queries,commands}` + `@/shared/components/TokenLabel` | ヘッダー/フッターメニュー項目の rich label SSoT。`label Json` で `ButtonLabelToken[]` を保持。`mobile-nav.tsx` は完全 hardcoded で対象外           |
| `TokenLabel` 共有 Server Component                                    | `@/shared/components/TokenLabel`                                                                            | `ButtonLabelToken[]` を順次 render する SSoT。各 consumer 内で `tokens.map(...)` の重複実装禁止                                                    |

## マイページ 共通コンポーネント

| 定数/変数                  | 場所                                               | メモ                                                                                          |
| -------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `IncompleteProfileNotice`  | `mypage/_components/incomplete-profile-notice.tsx` | 顧客プロフィール未完成時の警告 SSoT。layout で MypageNav 直後に配置、page 個別実装禁止        |
| `MypageSkeleton`           | `mypage/_components/mypage-skeleton.tsx`           | mypage `loading.tsx` 共通 placeholder。variant: `list` / `detail` / `form`、単一 spinner 禁止 |
| `ReservationTabs` (mypage) | `mypage/_components/reservation-tabs.tsx`          | 公開マイページの予約 active/past Tabs 分離 SSoT。**admin 側の `ReservationTabs` とは別実装**  |

## ホームヒーロー（Section row, order=-1）

ホーム hero は `Page.pageHero` JSON column ではなく **`Section` table の `type='page-hero'` row（order=-1）として保存**される（schema 上 Page に pageHero 列は存在しない）。挿入は `prisma/seed.ts` の idempotent ブロックが `DEFAULT_PAGE_HERO` で行い、`DEFAULT_PAGE_SECTIONS.home` には**含めない**例外。SectionRenderer は `case SectionType.PAGE_HERO` で `<PageHero config={config} />` に dispatch。

| 定数/変数              | 場所                                                   | メモ                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageHeroConfigSchema` | `@/shared/lib/sections/definitions/page-hero/schema`   | `Section.config` JSON（type='page-hero'）の正本                                                                                                                                                               |
| `DEFAULT_PAGE_HERO`    | `@/shared/lib/sections/definitions/page-hero/defaults` | seed.ts idempotent insert + restore migration の正本値                                                                                                                                                        |
| `<PageHero />`         | `@/public/components/page-hero/PageHero`               | variant dispatch（editorial-split / compact / minimal / media）。`SectionRenderer` の `case SectionType.PAGE_HERO` から委譲される。media variant は `detectMediaSourceType()` で image/video に派生し出し分け |

**新規 arbitrary 値（`[65ch]` / `[85vh]` / `[90svh]` / `[12rem]` 等）を追加する前に既存 token を grep し、不足なら `@theme` に追加してから `min-h-[var(--hero-min-height)]` 等の CSS var 参照形式で利用する**（→ `ssot-ui-components/design-tokens.md`）。
