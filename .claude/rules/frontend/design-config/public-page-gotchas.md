---
description: 公開ページの実装 Gotchas（フォーム UI / レスポンシブ標準 / Page-First Architecture / ブログサイドバー / 料金表示 / Select SSoT / autoComplete）
paths:
  - src/app/(public*)/**
---

# 公開ページ実装 Gotchas

> 公開フォーム UI 統一 + レスポンシブ標準 + Page-First Architecture + ブログサイドバー + 実装 SSoT (料金表示 / フィルタ Select / autoComplete)。

## 公開フォーム UI 統一

- **フォームフィールド間隔は `space-y-6` または `Stack gap="lg"`（gap-6 = 24px）に統一** — `space-y-4` / `Stack gap="md"` は禁止。ContactForm・ProfileForm・認証フォーム全てで統一済み
- **サーバーエラー表示は `<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">` に統一** — 素の `<p className="text-sm text-destructive">` は a11y 不足（`role="alert"` 欠落）かつ視認性不足
- **管理画面ページタイトルは `text-2xl font-bold tracking-tight text-foreground` に統一** — ログインページのモバイル表示含む。`text-xl font-semibold` は禁止
- **OGP/SNS シェアプレビューは `max-w-lg` で制約** — `aspect-[1200/630]` が親幅に追従するため、制約なしだとプレビューが巨大になる。`max-w-lg`（512px）を外側ラッパーに適用。`PageSeoForm.tsx` で設定
- **`items-stretch` + ImageFrame `aspect-[*]` は CSS conflict** — CSS `aspect-ratio` は `height: auto` のときのみ適用される仕様。grid `items-stretch` で子要素 height が cell に合わせて明示設定されると aspect-ratio が無視され、`<ImageFrame aspect="landscape">` の 4:3 制約が機能しない。`object-cover` で「accidentally working」状態（画像が content height に追従、aspect 崩れ）になりやすい silent bug。**意図的な fixed aspect は `items-start`** で、`items-stretch` は明示的に「画像を content と揃える」意図のときのみ（aspect 制約を撤廃して `className="h-full"` で stretch）。検出: `getComputedStyle(imgFrame).aspectRatio === "auto"` で aspect 無効化を確認。参照実装: `space-list/space-card.tsx` horizontal layout（2026-05-12 で items-stretch ⇄ items-start を試行錯誤、最終的に business 判断で items-stretch 採用）
- **公開 Badge と管理 Badge の variant 型は異なる** — 公開 `"default"|"success"|"warning"|"info"`、管理 shadcn/ui `"secondary"|"outline"|"destructive"` 等。共有 `enums/helpers.ts` の `*_BADGE_VARIANTS` は管理用。公開ページでは `Record<Enum, BadgeVariant>` をコンポーネント内に定義する
- **conform `useForm({ defaultValue })` の初期値設計** — single `defaultValue` (`DefaultValue<T>` 型) を渡す。schema 全フィールド宣言は不要 (FormData 経由で server 側が `parseWithZod` で defaults 適用)。`z.literal(true)` 等の checkbox は HTML `<input type="checkbox" required>` + Zod `.refine(v => v === true)` で表現する
- **eslint-plugin-react-hooks 7.1.x 新ルール挙動** — `react-hooks/set-state-in-effect` はリテラル値（`true` / `false` / `[]`）の setState を検出しない（動的値のみ）。`@eslint-react/set-state-in-effect` は両方検出するためルール併記で disable が必要なケースあり。`react-hooks/immutability` は hook 戻り値を同 hook の callback 引数内で参照すると TDZ 扱いで検出。正当な修正は eslint-disable ではなく render 中 state sync / `useSyncExternalStore` / render 中 derive / callback 引数化

## 公開ページ レスポンシブ標準

- **公開ページ見出しの `text-wrap` / `word-break` は `@layer base` が SSoT** — `public.css` の `@layer base` が `h1`–`h6` に `text-wrap: balance` + `word-break: auto-phrase`（日本語フレーズ折返し, Chrome 119+）を自動適用する。個別コンポーネントで `text-wrap-*` / `break-*` ユーティリティを重ねない。`whitespace-nowrap` が必要な特殊ケース（バッジ等）は例外
- **`SectionWrapper` の `LAYOUT_CONTAINER_WIDTH_CLASSES` は名前と幅が逆転** — `sm: --prose-narrow` / `md: --prose-medium` / `lg: --container-max` (1280px / **wider**) / `xl: --container-editorial` (50rem=800px / **narrower**) / `full: max-w-none`。`xl` は editorial 幅で `lg` より狭い反直感マッピング。フルワイド（viewport 全幅）が必要なら `containerWidth: "full"`、標準ページ幅は `lg`、editorial 記事測度は `xl`
- **公開ページ見出しの font-weight / letter-spacing / line-height も `@theme --text-*--*` が SSoT** — `text-h1` 等の utility を使う箇所で `font-light` / `leading-*` / `tracking-*` を重ねない（→ `tailwind-patterns/theme-tokens.md` §Typography SSoT）。意図的 override は editorial-card featured variant のみ
- **公開カレンダーの曜日色は日 = `text-destructive`、土 = `text-info`** — 日本標準のカレンダー配色。日曜始まり。今日マーカーは `bg-accent text-accent-foreground rounded-full`。曜日ヘッダーは `bg-surface` + 枠線
- **日本語ラベルのタブ/ナビに `uppercase` 禁止** — `uppercase` は Latin 専用。日本語タブは Journal タブパターン（`text-sm tracking-[0.18em]`、uppercase なし）に合わせる。ヘッダーナビ（`text-[0.75rem] uppercase`）は英語ラベル向け
- **空状態の CTA は `Button variant="editorial" size="sm"` を使用** — テキストリンクは余白の中で埋もれる。メッセージテキストは `text-muted-foreground`（base サイズ）、ボタンは `space-y-4` で配置
- **カードグリッドは Container Queries、マクロレイアウトは viewport breakpoint** — 採用方針の詳細は `tailwind-patterns/container-queries.md` SSoT を参照。
- **Heading サイズは `text-h1`/`text-h2`/`text-h3`/`text-h4`/`text-hero` クラスを使う** — `@theme` で `--text-*--line-height/letter-spacing/font-weight` が自動適用される
- **Design System Primitives (Container, Stack, Heading, Badge, Prose, ImageFrame) は Server Component** — `"use client"` は不要
- **`grid-cols-2` には必ず `grid-cols-1 sm:grid-cols-2` を使う** — 375px 未満でクラムドになる
- **ヘッダー（タイトル + Badge）は `flex-col sm:flex-row` でモバイル縦積み** — `flex justify-between` のみだとバッジが押しつぶされる
- **カード・セクションパディングは `p-4 sm:p-6`** — `p-6` 固定はモバイルで過剰。空状態は `p-6 md:p-12`
- **見出しマージンは `mb-4 md:mb-8`** — `mb-8` 固定はモバイルで過剰
- **アクションボタン群は `flex-col sm:flex-row gap-2 sm:gap-3`** — モバイルで横並びだとはみ出す
- **中央寄せ bar（announcement / toolbar）+ サイドコントロールは絶対配置せず flex in-flow** — コントロールを `absolute` で float させ、中央コンテンツを `mx-N` 固定 margin で避ける構成は、margin が全コントロールの footprint（indicator / arrows / dismiss）を予約しきれず、狭幅で長文がコントロール下に潜り込む silent overlap になる（`mx-8`=32px が右側コントロール 〜124px を予約できず重なった実例）。**コントロール = `shrink-0` の in-flow sibling、中央コンテンツ = `flex-1 min-w-0` で残余幅を占有 + 折り返し/truncate** にすると重なりが構造的に不可能になり responsive も自動成立する。装飾的 indicator は狭幅で `hidden sm:inline-block`、バー高さ可変は既存 `ResizeObserver` が追従。検出は `getBoundingClientRect()` 実測（static class 確認では不可、`accessibility/touch-text.md` §Playwright MCP 実測）。実例: `AnnouncementBar` 絶対配置全廃 → flex in-flow（PR #450、touch-target overlap 側は `accessibility/touch-text.md` §partially obscured と整合）
- **テキストリンクのタッチターゲットは `px-3 py-1.5` 以上** — 素の `<a>` テキストは 44px 未満。`rounded-md` + padding で確保
- **CSS media queries は modern syntax を使う** — `@media (width < 48rem)` を使用。`@media (max-width: 767px)` のハードコードは禁止
- **DB VARCHAR で管理する非 Prisma enum は `enums/helpers.ts` に `as const` 定数を定義** — `CANCELLED_BY.CUSTOMER` / `CANCELLED_BY.ADMIN` のパターン
- **`inline-block` + `uppercase` + `tracking-[0.18em]` のテキスト折り返し** — `letter-spacing` が広い uppercase テキストは `inline-block` だとボタン枠内で折り返される。`inline-flex items-center justify-center whitespace-nowrap` を使用する
- **Badge base は `whitespace-nowrap` + `text-xs` 込み** — admin / public の両 Badge コンポーネントが `inline-flex items-center whitespace-nowrap ... text-xs` を base に持つ。呼び出し側で重ねない
- **ホームページセクション見出しは日英併記** — 英語 uppercase ラベル + 日本語見出し。HowItWorks / Spaces / Features / CTA で統一済み
- **`exactOptionalPropertyTypes` 下で Next.js `Link` に optional `onClick` を渡す場合は条件スプレッド** — `{...(props.onClick && { onClick: props.onClick })}` を使用
- **`<header>` に `role="banner"`、`<footer>` に `role="contentinfo"` を明示** — HTML5 暗黙 role は一部 AT で認識されない
- **公開モバイルメニューは Radix Dialog 必須** — 手動オーバーレイ（`useState` + `fixed inset-0`）禁止
- **Radix `Dialog.Title` に手動 `id` / `Dialog.Content` に手動 `aria-labelledby` 禁止** — Radix が context 経由で `titleId` を自動生成。手動 `id={xxx}` を spread すると Radix 内部 ID を上書きして `DialogContent requires a DialogTitle` warning が発火する silent bug
- **Radix `NavigationMenu.Link` は `asChild` + `active` prop 必須** — Next.js 統合の公式パターン
- **`<details>` を `Dialog.Close asChild` でラップ禁止** — summary クリックで accordion 開閉と Dialog 閉じが競合
- **Dialog / メニュー閉じコールバックは `onClick` を使う（`onNavigate` ではない）**
- **`text-foreground` から `hover:text-foreground` は no-op バグ** — base が `text-muted-foreground` のときのみ `hover:text-foreground` が有効
- **公開ページ layout の Client Component で `useSession()` 禁止** — Better Auth クライアントが全公開ページバンドルに含まれる。認証状態は layout の Server Component で `getCurrentCustomerUser()` から解決し discriminator を prop で渡す
- **PPR で `getCurrentCustomerUser()` を layout 本体 `await` 禁止** — 必ず `<Suspense>` 内の async SC wrapper から呼ぶ
- **`site-header.tsx` の brand Link / authLink には `whitespace-nowrap` 必須**
- **公開ページのページ固有 `fixed bottom-*` UI は `bottom-16` で MobileNav の上に積む** — MobileNav は `fixed bottom-0 z-50` で高さ 64px
- **`PageLayout` `cta` prop（SiteCTA）の直前セクションは `pb-[var(--space-lg)]` 必須**
- **Container 内 section divider は `<Container>` の中の `<div>` に border を付ける**

## 余白の二重計上 (double-counting) 禁止

「補正用の余白」と「基本の余白」が別々の場所で同じ間隔を足し、合算で過大な死に余白になる silent bug の頻出パターン。**1 つの間隔は 1 箇所でだけ表現**する。検出は `getBoundingClientRect()` 実測か「ヘッダー直下/要素間の空白が異様に広い」で気付く。

- **hero の被り補正 pt は `--hero-header-offset` 経由**（`--header-height` 直書き禁止） — hero は透過ヘッダー前提で `pt-[var(--header-height)]` を持つが、`<main>` の負マージン (`-header-height`) で相殺されるのは透過モードのみ。solid モード（`@default(solid)`）は負マージンが無く、in-flow ヘッダー直下に更に header-height 分の pt が乗って約 56-64px の死に帯になる。`pt-[var(--hero-header-offset)]` / `pt-[calc(var(--hero-header-offset)+1rem)]` を使う（SSoT は `design-config/responsive.md` Layout tokens）。新規 hero variant も同様（実例: PR #446）
- **`SectionWrapper` を `skipContainer` で full-bleed する section は `skipPadding` も併用** — `SectionWrapper` は `layout.padding`（default `md`）で外側 `<section>` に py を付与する SSoT。`skipContainer` で画像を横 full-bleed にしても `skipPadding` を付けないと、外側 py が full-bleed 画像の上下に死に帯を作り、かつ内部 text 列の py と二重計上される。full-bleed split は両方指定する（実例: `ConceptSection` split、PR #447）
- **`space-y-*` コンテナ + 各子の `border-t pt-*` divider は gap の二重計上** — `space-y` の margin（要素間ギャップ）と、子要素自身の divider `pt`（border 下の余白）が両方効き、要素間が合算で過大になる（実例: `/access` チャプター間が `space-y-28`(112px) + `pt-24`(96px) = 約 208px）。divider 前後は `space-y`（=線の上）と `pt`（=線の下）で**均衡**させ、合計が過大にならない一段ずつの値にする
- **横長リストカードはモバイルで `flex-col` 縦積み（画像上）** — `flex items-start` で固定幅画像（`w-32`=128px 等）を左に置く横長カードは、モバイルで写真が小さく視認性不足。`flex flex-col gap-4 md:flex-row md:items-start` + 画像 `w-full md:w-64` + `sizes` を `100vw`（mobile）/ 固定（md+）に切替え、モバイルは画像フル幅→詳細縦積みにする（実例: `/spaces` `SpaceCard` horizontal、PR #448）
- **連続する同 bg・同 padded セクションは境界で `pb + pt` が二重計上される** — 各セクションは対称 `py`（`SectionWrapper` の `layout.padding` / `Section` primitive / 直書き `py`）を持つため、背景変化も border も無い隣接境界では上 `pb` ＋ 下 `pt` が合算され、`lg` 連続だと desktop 260px / mobile 130px の死に余白になる（実例: home の showcase→features→cta）。**2 本立てで是正**: ① content セクションは `md`(85/48px) に統一し `lg/xl` は hero/dramatic 専用に限定（→ `foundations.md §セクション設計`）② borderless 同 bg の stacked セクションは**交互配置**（padded→`none`→padded）を保ち、全境界を単側 padding（1 単位）に揃える。`SiteCTA` / `related-*` を生む `Section` primitive(`design-system/section.tsx`) の default 余白 `lg→md`、`PostList` / `NewsList` / `ArticleLayout` body 下 `pb-lg→pb-md` も同根。**検出**: `getBoundingClientRect()` で隣接セクションの `pb + pt` を実測し >180px を疑う（desktop 1440 / mobile 390 両方で計測）。**既存 DB セクションの是正は冪等 backfill**（`scripts/backfill-home-section-spacing.ts`、旧 default `lg` のみ更新で admin 値を保護、`backfill-page-hero-buttons.ts` と同 P2 ops）。実例: PR #465

## Page-First Architecture（公開ページ）

- **`SpaceCard` の `imageUrls` prop は optional** — 1 枚以下は `ImageFrame`、2 枚以上で `ImageCarousel`
- **`ImageCarousel` は `next/image` 直接使用の許容例外**
- **`SectionWrapper` と `Section` Primitive を混同しない** — SectionWrapper（DB 駆動）vs Section Primitive（静的レイアウト用）
- **一覧ページの trailing sections から同種セクション除外必須** — `/spaces` から `space-list`、`/events` から `event-calendar` を `trailingSections` フィルタで除外
- **ページ固有 CTA を持つページは `cta` セクションも除外** — `/faq` / `/contact` で重複防止
- **listing / form / calendar セクションは page-specific（opt-in 制）で二重表示を構造防止** — `page-templates.ts` の `UNIVERSAL_SECTION_TYPES`（hero/cta/gallery/embed/concept 等プレゼンテーション系）には含めず、追加を許可するテンプレの `additionalSectionTypes` にのみ宣言する。`reservation`（reservation-form が Step 1 でスペース選択を内包）は `space-list`/`space-showcase` を `additionalSectionTypes` に **入れないだけ** で AddSectionDialog の候補から自動的に外れる（旧: `allowedSectionTypes` を手書きで除外していた PR #240 方式は universal+page-specific モデル化で不要に）。universal セクションは全テンプレで追加可。`__tests__/unit/shared/lib/sections/page-templates.test.ts` が no-orphans + universal/page-specific 排他 + reservation の space-list/showcase 非含有を gate
- **レガシーセクション（`_components/*.tsx`）も Editorial Magazine 準拠必須**
- **hero 直下の一覧セクションは上余白を縮小** — `pt-10 pb-[var(--space-lg)] md:pt-14`
- **ホームヒーローは `Page.pageHero` のみ** — `homepage-hero` Section type / registry は廃止
- **`public-queries.ts` の全関数に `'use cache'` + `safeFetch` + `toPlainObject` 必須**
- **同種の公開 UI コンポーネント重複禁止** — `_shared/components/ui/` を確認、`FilterBar` が唯一
- **`_shared/components/` は kebab-case 必須**、`_components/` レガシーは PascalCase 維持
- **`@layer compat` と旧カラートークンは削除済み** — `--color-primary` / `--color-brand-primary` は存在しない
- **公開ページの `hover:text-accent` は原則禁止** — `hover:text-foreground` に統一
- **`tracking` は `tracking-[0.18em]` を標準値とする**
- **Button primary の bronze shimmer アニメーション廃止**
- **ImageFrame の hover は `opacity-85`（`scale-105` 廃止）**
- **SC children を CC 内でタブ切替する場合は CSS `hidden` を使用** — page.tsx から両ビューを props で渡し DOM 保持
- **公開詳細ページのレイアウト 2 系統**（PR #246-#256、2026-05-26 完成）:
  - **(A) `ArticleLayout` 統一の 4 系統** (events / news / posts / terms): `bg-surface py-2 shadow-inner` パンくず帯 + `ArticleHeader` (eyebrow + h1 + hairline divider w-16 + meta + media、Kinfolk hairline pattern、media は `mx-auto max-w-3xl` (768px) 制約 — PR #253 で max-w-4xl から絞った業界標準範囲) + 本文 + optional `<SiteCTA>`。**カテゴリ別 hero 配置** (`ArticleLayout.heroPosition` prop): events は `"full-width"` (default、Airbnb / Booking.com / Eventbrite 業界標準で gallery 強調)、posts / news は `"in-grid"` (WordPress Astra / GeneratePress / Newspaper / Hashnode で Search / Recent / Popular widget を hero 同 row sticky 常時可視)、terms は `"in-grid"` (Stripe Terms / GitHub TOS / Notion Terms で TOC を hero 同 row sticky)
  - **(B) `Variant E` (Booking × Editorial Hybrid) 独立構造の 1 系統** (spaces): PR #256 で `ArticleLayout` 経由廃止、`page.tsx` 内で直接構築。`bg-surface py-2 shadow-inner` breadcrumb 帯 + **中央寄せ Hero header** (eyebrow "— Space —" + serif h1 + hairline w-12 accent、Kinfolk magazine cover pure) + **2-col grid `lg:grid-cols-[1fr_320px]`** で 左カラム (gallery mosaic 4-grid + Quick stats row + SpaceInfo + Reviews) / 右 aside (sticky ReservationWidget border-accent 4 辺枠 + serif typography + Reservation/Inquiry uppercase tracking + 即予約 USP 3 列)。widget は 1 つの 2-col grid 内で本文全体 scroll を sticky 追従。**Quick stats row** (Airbnb / Vrbo 業界標準): gallery 直下に `<dl class="grid grid-cols-2 md:grid-cols-4">` で 評価 / 収容人数 / 広さ / 所在地 / カテゴリ を icon + label (eyebrow uppercase) + value (font-heading text-lg) 配置。**SpaceInfo** は drop-cap About (`first-letter:text-6xl text-accent`) + 左寄せ editorial Amenities (`・` prefix) + Access editorial list + italic 駐車場注記
- **旧「②固定型 `PageHero variant="compact"` + Section」廃止**（`_shared/components/layouts/page-hero.tsx` 削除済）
- **events 固有**: `ArticleLayout` の `toc` / `mobileToc` slot に `EventInfoPanel`（右サイド sticky 情報カード / mobile 本文冒頭 inline、Eventbrite / Peatix / Lu.ma 業界標準）を注入し、CTA は `#event-register` アンカー + `scroll-mt-[calc(var(--header-height)+2rem)]` で本文末尾の登録フォームへ誘導。`AddToCalendar` は主導線位置から退避し `<details>` 折りたたみ + 「予約しなくても追加できます」注記で `ArticleFooter` 直前に控えめ配置（業界標準 — 主 CTA を阻害しないリマインダー UX）
- **`EventInfoPanel` は Minimal Editorial pattern (Apple Store / Stripe / Notion booking 業界標準)** — 単一 `bg-background` panel に 3 ゾーン: ① **Status band** (`px-8 pt-7 pb-5 sm:px-10`) で Badge 単独配置 ② **Detail list** (`dl px-8 sm:px-10`) で 開催日時 / 開催場所 / 定員 / 参加費 の 4 DetailRow (`dt` ラベル `text-xs muted` + `dd` 値 `text-sm foreground`、`dt pt-5` + `dd mb-5 last:mb-7` rhythm) ③ **CTA block** (`registration.kind === "open"` のみ、`bg-foreground text-background min-h-12 sharp edge`、editorial 規約 `rounded-md` 禁止)。**価格 DetailRow は inline 表示**: `flex items-baseline gap-x-2` で `formatPrice(price)` + `text-xs muted「/ 1 名（税込）」`（`/` を inline 単位区切りとして使用、Peatix / Eventbrite / Airbnb 業界標準）、`price === 0` は「無料」単独。**開催日時 DetailRow は 2 行表示**: `<span flex-col gap-0.5>` で `formatEventDate(start)` + `formatEventTimeRange(start, end)` を両方 `text-sm text-foreground` の同等級で並列 (Lu.ma / Peatix / Airbnb / Google Calendar 業界標準、日付 / 時間は同等の意思決定情報)。**hero block (`bg-surface`) 採用禁止** — 2026-05-21 Minimal Editorial 移行で hero impact / 価格 hero typography を廃止、単一 panel + typographic rhythm のみで Luxury White × Bronze brand の Dominant 70% 配分を strict 維持
- **Badge `variant="default"` は `bg-surface` / `bg-background` 上で背景同色に溶ける silent bug** — Badge primitive の `default` variant は `bg-surface text-foreground` で warm cream / warm white 系の親背景上で枠が消える。`EventInfoPanel.OutlineBadge` (`bg-background + border border-border + text-muted-foreground`) で local 回避（border が outline 枠を提供、bg は親同色だが border で visible 確保）。**ネガティブ状態 Badge** (deadline-passed / closed / archived 等) は本 outline パターン推奨。Badge primitive 自体の variant 拡張 (`outline` 追加等) は影響範囲確認 + 全 consumer 用法洗い出しが必要なため別 PR 推奨
- **`formatEventDate` / `formatEventTimeRange` は SSoT** (`@/public/lib/format-event-date`) — `formatEventDateTimeRange` (1 行 `2026年5月15日(金) 10:00 - 12:00` — メール / iCal LOCATION / EventCard 等で利用) と並立。`EventInfoPanel` 等の 2 行 hero 表示用に分離関数を使う。`Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", ... })` formatter は module-level に static 定義 (per-call instantiate 禁止)
- **記事本文は `Prose` Primitive 必須** — `<Prose variant="editorial">`（drop-cap + リンク色 + blockquote スタイル）
- **共有コンポーネントの descendant selector override 禁止** — `[&_a]:py-0` 等を外部から制御しない、`size` / `variant` prop を追加
- **記事詳細ページのフッターは `ArticleFooter`（`@/public/components/ui/article-footer`）に統合**
- **記事詳細ページのレイアウトは `ArticleLayout` + `ArticleHeader` に統一** — `Container` + `BlogLayout` + `contentClassName` div の 4 階層ネスト禁止
- **`ArticleLayout` の `toc` / `mobileToc` prop が渡されると `BlogLayout` をバイパスして独自 2-col grid になる** — `lg:grid-cols-[1fr_280px]` + `<aside lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:self-start>` (PR #249 で sticky 修復)。`mobileToc` は `<article>` 内 hero 下 body 最上部に inline 表示 (PR #248 で配置位置を breadcrumb 直下から変更)
- **`BlogLayout` の `showSidebar={false}` は明示的 fast path** — DB fetch をスキップ（page-level `Page.showSidebar` override は PR #230 で廃止、グローバル `Settings.sidebarWidgets` enable 状態のみが正本）
- **`/posts` はブログ一覧、`/news` はお知らせ一覧** — `/journal` は廃止済み
- **`SearchBar` は `searchFilterParsers`（q + page）固定**
- **`PageContent` モデルは廃止済み** — 全ページが `Page` + `Section` で管理
- **セクションタイプは kebab-case 文字列** — DB の `Section.type` は `String @db.VarChar(64)`
- **新セクションタイプ追加は `definitions/` ディレクトリ作成のみ** — Prisma マイグレーション不要
- **AutoSectionForm は field メタデータなしのフィールドをスキップ**
- **AutoSectionForm のフィールドに `setValue` パターン禁止** — conform `defaultValue` prop + `useInputControl` で制御
- **セクション編集の canonical 構成は「内容 / デザイン」タブ** — `AutoSectionForm` が `content` group を「内容」タブ、`design` + `advanced` group を「デザイン」タブに振り分ける（WordPress ブロックインスペクタ準拠、内容デフォルト）。`design` フィールドが無いセクションは単一ペインにフォールバック。`Tabs` は `forceMount` + `data-[state=inactive]:hidden` で非アクティブタブも DOM 保持必須（Lexical/PortableText state と FormData を切替で失わない silent bug 回避）。`TabsTrigger` は admin primitive の `type="button"` default で form submit を誘発しない
- **`design` group のフィールドを編集 UI から隠す抑止フラグを section panel に再導入禁止** — 旧 `contentOnly` prop（`SectionEditPanel` が `AutoSectionForm` に渡し design グループ全体を非描画にしていた）は scrim/variant/高さ/transition 等の編集可能フィールドを UI から到達不能にする silent bug の温床だった（2026-06-01 #369/#370 で削除）。新規 design フィールドは適切な group (`design`/`advanced`) を付ければタブに自動表示される。`config.layout` (`sectionLayoutSchema`) は各 `SectionWrapper` が消費する実フィールドでデッドではない（隠さない）
- **背景メディア上テキストの可読性 scrim はオン/オフ + 濃さの 2 コントロール** — `createScrimFields()` (`definitions/_shared/scrim.ts`) が `scrimEnabled` (boolean, default true) + `scrimTone` + `scrimOpacity` を提供。オフでも濃さ値は保持、文字側 3 層防御は維持。scrim は背景メディアにテキストを重ねる `hero` / `page-hero` media variant のみに付与（gallery/cta 等は無意味なので付けない、WordPress block supports モデル）
- **新規公開ページ追加は `/create-page-content` スキル**
- **ホームページセクションの `pageId: null` は廃止済み** — ホームページは slug `"home"` の Page レコード
- **`/admin/pages/homepage/edit` は廃止済み** — `[slug]/edit` に統合
- **`DesignFields` は ToggleGroup + フラット fieldset で実装済み**
- **ページ編集の SEO はページレベルタブ「ページ設定」にある**
- **アニメーションファイルは kebab-case のみ**
- **Three.js / PixiJS は未使用** — 旧 `effects/` インフラは削除済み、再導入禁止
- **公開ヘッダーの NavigationMenu は `@radix-ui/react-navigation-menu` を直接使用** — admin の UI を import しない
- **FAQ 項目とカテゴリはソフトデリート** — `deletedAt: null` ガードが queries.ts 全クエリに必須
- **FAQ 項目の回答はプレーンテキスト単一列（`answer`）** — Lexical 3 カラム構成は廃止済み
- **FAQ bulk 操作は `updateMany` または interactive `$transaction`**
- **FAQ 管理 UI は master-detail 構造 + 分析可視化 + 横断レビュー** — カテゴリ一覧 (`/admin/faq`) → カテゴリ詳細 (`/admin/faq/[categoryId]`) の master-detail に加え、公開投票 `helpfulCount`/`notHelpfulCount` を質問テーブルの「役立ち度」カラム (`FaqHelpfulnessBadge`、評価率 + 👍/👎、不評優位は `text-destructive`) で可視化 + `helpful` ソート。コンテンツ健全性は `quickFilter`（recent/stale/low-rated、公開ステータスとは独立軸）で絞り込み。カテゴリ横断の「対応すべき項目」は `/admin/faq/review`（master-detail を壊さず、既存 `getFaqItems` の `categoryId` 省略 = cross-category 対応で実現）+ ランディングに健全性チップ（0 件は非表示）。しきい値 SSoT は `@/shared/domain/faq/constants`（→ `ssot-db-prisma.md`）。**死蔵データ可視化が設計意図**（Zendesk votes/Content Cues・Intercom reactions/Articles report と整合）
- **FAQ テーブル行クリックと checkbox/drag/ActionCell の click 衝突** — `stopRowClick`（`@/admin/components/table`）+ `PointerSensor` `distance: 8`
- **Admin 一覧にカラムソート追加は 5 ステップ** — parsers / domain query / page.tsx parse / Table Header / table 本体
- **`parseAsSortOrder` 共有 default は `"desc"`** — 手動 order 系カラムは parser map で override 必須
- **Nullable 列のソートは `{ sort, nulls: "last" }` + tie-breaker 必須**
- **公開ページ集計 counter API パターン** — POST `/api/[resource]/[id]/[counter]` route + UUID 検証 + atomic `updateMany`
- **公開ページ集計 counter API は意図的にキャッシュ invalidate しない**
- **`NOTIFICATION_TYPE` 追加は 3 箇所同時更新必須** — `NOTIFICATION_TYPE` const + `NOTIFICATION_TYPE_LABELS` + `NOTIFICATION_TYPE_BADGE_VARIANTS`
- **`AdminNotification.resourceId` は `@db.Uuid` — cuid リソース（Event / EventRegistration）を入れると `P2007`** — cuid リソースは `resourceId: undefined` にする
- **`Container variant="narrow"` とコンテンツ幅設定の併用禁止**
- **`Container variant="narrow"` + 2 カラムグリッドは幅が不足する** — `Container`（default: 1280px）を使用
- **公開ページの sticky サイドバーは `--header-height` を考慮** — `lg:top-[calc(var(--header-height)+2rem)]`
- **Design System `Heading` コンポーネントは `level` prop** — `as="h2"` ではなく `level={2}`
- **`scrollIntoView({ block: "start" })` は固定ヘッダーを考慮しない** — `getBoundingClientRect().top + scrollY - getHeaderHeight() - margin`
- **`bg-surface` カード内のインタラクティブ要素は `bg-background` で浮かせる** — コントラスト不足対策
- **Design System `Input`/`Textarea` の必須マークは `required` prop で自動表示**
- **公開フォームの conform action callback 内で `fields` / `form` の参照を再評価しない** — `react-hooks/immutability` ルールが hook 戻り値を同 hook callback 引数内で参照すると TDZ 扱いで検出する。成功後の状態リセットは `form.reset()` を `startTransition` 外で呼ぶか、`lastResult` の変化を `useEffect` で監視する
- **`Heading` のサイズオーバーライドは `!text-*`** — `!important` プレフィックス必要
- **JSON-LD は `json-ld.tsx` の共通コンポーネントを使う** — Unicode エスケープ済み

## ブログサイドバー

- **`sidebarWidgets` JSON は順序付き配列** — `[{ type: "search", enabled: true }, ...]`
- **`BlogLayout` は Container の中に配置**
- **サイドバー有効時に `Container variant="narrow"` 禁止** — default Container (1280px) を使用
- **`Page.showSidebar` page-level override は PR #230 で廃止済** — サイドバー表示はグローバル `Settings.sidebarWidgets` の enable 状態のみで判定（per-page override 復活禁止）
- **サイドバーデータ変更時は `SIDEBAR_DATA` キャッシュ無効化が必要**
- **Zod `z.union` の discriminated union narrowing は `switch` の `case` で効く**
- **Post リスト widget（recent/popular）は `SidebarPostList` 1 コンポーネントに統一**
- **サイドバーサムネ画像の `sizes` prop 戦略** — compact: `96px`、stacked: `(min-width: 1024px) 320px, 100vw`
- **recent/popular widget schema は discriminated union + `.default()` で拡張**
- **`Post.thumbnailUrl` は `String` 非 nullable（空文字列あり得る）** — フォールバック必須
- **公開ページのアクションボタンに `rounded-full` 禁止** — Editorial Magazine はシャープエッジが基本
- **リスト `.map` 内の個別 `<ScrollReveal delay={i*0.08}>` wrap は anti-pattern** — `ScrollRevealGroup` に集約
- **Structured list の canonical hairline pattern** — `divide-y divide-divider`（`divide-border` 復活禁止）。用途別の正解/禁止パターンは `tailwind-patterns/theme-tokens/semantic-tokens.md` §editorial hairline divider SSoT を参照。
- **news archive は `<ul>/<li>` ではなく `<div className="divide-y divide-divider">`** — event-list / space-grid / news-archive と同形

## 公開ページ実装 SSoT

### 料金表示 — コンポーネント種別で SSoT 分岐

- **Client Component**: `useFormatPrice`（`TaxSettingsProvider` / layout.tsx 経由）
- **Server Component**: `getPublicTaxSettings()` + `formatUnitPriceWithTax()` を直接呼ぶ（`'use cache'` で dedup）
- **silent bug**: Client 化のためだけに Hook を選ぶと SpaceCard 等の `"use client"` 不要なカードが Server 化できなくなる
- **両方禁止**: `toLocaleString()` 直接表示

### フィルタ・選択 UI — design-system/select.tsx が SSoT

- **canonical**: `_shared/components/design-system/select.tsx`（ネイティブ `<select>` + Editorial border-bottom primitive）
- **禁止**: 新規 Radix Select / 自作 Popover、`@/admin/components/ui/select.tsx` の公開ページからの cross-import
- **理由**: OS-native picker（モバイル UX 最適）+ a11y / キーボード操作自動 + JS ゼロ + WCAG 2.5.5 タッチターゲット 44px を同時満足
- **"All" sentinel**: `value=""` で onChange 時に null マッピング

### 公開フォーム autoComplete

- `family-name` / `given-name` / `email` / `organization` を適切に設定
- 未設定はブラウザ自動入力が機能しない

## 関連 Prisma / Decimal

- **Prisma `Decimal` と `createAppPrismaClient`** — アプリ標準の `prisma`（`src/shared/db/prisma.ts`）は `createAppPrismaClient` により対象モデルの金額等が **読み取り結果で `number`**。集計や拡張前クライアント経由では `Number()` が必要なことがある（→ `prisma-patterns.md`）
- **`prisma/seed.ts` と `logger`** — seed は `@/shared/db/prisma` を import しない（`server-only`）。Prisma は `createAppPrismaClient(new PrismaClient({ adapter }))`。共有ドメインコードが `@/shared/lib/errors/logger` を引くと seed が落ちる → `logger-core` を使う
- **Prisma JSON フィールド（`imageUrls`, `facilities`）は `unknown` で受け取る** — `Array.isArray()` + type guard filter でランタイムパース。`as string[]` 禁止
- **`Prisma.XxxGetPayload` は `$extends` 前の型を返す** — 拡張クライアントの戻り値型は `Awaited<ReturnType<typeof prisma.xxx.findMany<{ select: typeof xxxSelect }>>>[number]`

## button ネスト禁止 + Block Link / Card Overlay パターン

- **`<button>` 内にインタラクティブ要素（`<button>`, `<a>`, `<input>`）をネスト禁止** — HTML 仕様違反（hydration mismatch を誘発）。解決方針は **ARIA 第一ルール（"native HTML over ARIA"）** を最優先
- **(1) 第一推奨: Block Link / Card Overlay パターン** — コンテナ `<article className="relative group">` の中に 2 レイヤ: ① Primary target `<button type="button" className="absolute inset-0 z-10" aria-label="...">` でカード全体を覆う。② Action layer `<div className="absolute inset-0 z-20 pointer-events-none">` で secondary actions を配置し各 `<button>` のみ `pointer-events-auto` で受け取る。参照実装: `media/_components/MediaGrid.tsx`
- **(2) 第二推奨**: `<div role="button" tabIndex={0} aria-pressed={isSelected}>` + Enter = `onKeyDown` / Space = `onKeyUp` で activate（WAI-ARIA APG Button Pattern 公式）+ `onKeyDown` で Space `preventDefault()` 必須 + `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **(3) 単一選択リスト UI**: `<div role="radio" tabIndex={0} onKeyDown={...}>` + 内部 `<button>`（`space-selector.tsx` / `location-selector.tsx`）。複数選択は `role="checkbox"` + `aria-checked`
