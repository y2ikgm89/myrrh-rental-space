---
description: Gotchas — 公開フォーム UI / 公開ページ レスポンシブ / Page-First Architecture / ブログサイドバー
paths:
  - src/app/(public*)/**
  - src/public/**
  - src/shared/components/**
---

# Gotchas — 公開ページ UI / レスポンシブ

## 公開フォーム UI 統一

- **フォームフィールド間隔は `space-y-6` または `Stack gap="lg"`（gap-6 = 24px）に統一** — `space-y-4` / `Stack gap="md"` は禁止。ContactForm・ProfileForm・認証フォーム全てで統一済み
- **サーバーエラー表示は `<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">` に統一** — 素の `<p className="text-sm text-destructive">` は a11y 不足（`role="alert"` 欠落）かつ視認性不足
- **管理画面ページタイトルは `text-2xl font-bold tracking-tight text-foreground` に統一** — ログインページのモバイル表示含む。`text-xl font-semibold` は禁止
- **OGP/SNS シェアプレビューは `max-w-lg` で制約** — `aspect-[1200/630]` が親幅に追従するため、制約なしだとプレビューが巨大になる。`max-w-lg`（512px）を外側ラッパーに適用。`PageSeoForm.tsx` で設定
- **公開 Badge と管理 Badge の variant 型は異なる** — 公開 `"default"|"success"|"warning"|"info"`、管理 shadcn/ui `"secondary"|"outline"|"destructive"` 等。共有 `enums/helpers.ts` の `*_BADGE_VARIANTS` は管理用。公開ページでは `Record<Enum, BadgeVariant>` をコンポーネント内に定義する
- **RHF `defaultValues` は Zod スキーマの全フィールドを宣言必須** — 省略すると `useWatch` の初期値が `undefined` になり条件分岐が壊れる。`z.literal(true)` フィールド（`agreeToTerms` 等）は `defaultValues` に含めない（型が `true` のため `false` を渡せない）
- **`useFormAction.onSuccess` は `(data, form) => void` 契約** — hook 戻り値の `form` を action callback 内で closure 参照すると `react-hooks/immutability` 違反（公式: "Return values and arguments to Hooks are immutable"）。`onSuccess: (_data, form) => form.setValue(...)` で callback 引数から受け取る。参照実装: `GoogleMapsSection.tsx` / `TurnstileSection.tsx`
- **eslint-plugin-react-hooks 7.1.x 新ルール挙動** — `react-hooks/set-state-in-effect` はリテラル値（`true` / `false` / `[]`）の setState を検出しない（動的値のみ）。`@eslint-react/set-state-in-effect` は両方検出するためルール併記で disable が必要なケースあり。`react-hooks/immutability` は hook 戻り値を同 hook の callback 引数内で参照すると TDZ 扱いで検出。正当な修正は eslint-disable ではなく render 中 state sync / `useSyncExternalStore` / render 中 derive / callback 引数化

## 公開ページ レスポンシブ標準

- **公開ページ見出しの `text-wrap` / `word-break` は `@layer base` が SSoT** — `public.css` の `@layer base` が `h1`–`h6` に `text-wrap: balance` + `word-break: auto-phrase`（日本語フレーズ折返し, Chrome 119+）を自動適用する。個別コンポーネントで `text-wrap-*` / `break-*` ユーティリティを重ねない。`whitespace-nowrap` が必要な特殊ケース（バッジ等）は例外
- **公開ページ見出しの font-weight / letter-spacing / line-height も `@theme --text-*--*` が SSoT** — `text-h1` 等の utility を使う箇所で `font-light` / `leading-*` / `tracking-*` を重ねない（→ `tailwind-patterns/theme-tokens.md` §Typography SSoT）。意図的 override は editorial-card featured variant のみ
- **公開カレンダーの曜日色は日=`text-destructive`、土=`text-info`** — 日本標準のカレンダー配色。日曜始まり。今日マーカーは `bg-accent text-accent-foreground rounded-full`。曜日ヘッダーは `bg-surface` + 枠線
- **日本語ラベルのタブ/ナビに `uppercase` 禁止** — `uppercase` は Latin 専用。日本語タブは Journal タブパターン（`text-sm tracking-[0.18em]`、uppercase なし）に合わせる。ヘッダーナビ（`text-[0.75rem] uppercase`）は英語ラベル向け
- **空状態の CTA は `Button variant="editorial" size="sm"` を使用** — テキストリンクは余白の中で埋もれる。メッセージテキストは `text-muted-foreground`（base サイズ）、ボタンは `space-y-4` で配置
- **カードグリッドは Container Queries を使う** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`。viewport breakpoints (`md:grid-cols-2`) ではなくコンテナ幅に応じて適応。公開: SpaceGrid / PostGrid / RelatedSpaces / TestimonialSection / SpaceShowcaseSection / SpaceListSection / PostListSection / CARD_GRID_COLS_MAP（`section-style-maps.ts`）で採用済み。管理画面 dashboard は `@container/main` named container を使用（`MainContent.tsx` が main に付与 → DashboardStatsSection が `@md/main:grid-cols-2 @3xl/main:grid-cols-4` で適応）。FeaturesSection は grid 列切替なし（`grid-cols-[6rem_1fr]` 固定）のため @container 不要
- **ページレベルのレイアウト切替は viewport breakpoints を維持** — 2カラム text+image（ConceptSection）、フォームグリッド（ContactFormSection）等のマクロレイアウトは `md:grid-cols-2` のまま。Container Queries はコンポーネント内部の適応に使う
- **Heading サイズは `text-h1`/`text-h2`/`text-h3`/`text-h4`/`text-hero` クラスを使う** — `@theme` で `--text-*--line-height/letter-spacing/font-weight` が自動適用される。`text-[length:var(--text-h1)]` + `font-bold` + `leading-[...]` の冗長パターンは廃止
- **Design System Primitives (Container, Stack, Heading, Badge, Prose, ImageFrame) は Server Component** — `"use client"` は不要。Tailwind クラスは CSS にコンパイルされるため JS バンドル不要。Button と Dialog のみ `"use client"` 維持
- **`grid-cols-2` には必ず `grid-cols-1 sm:grid-cols-2` を使う** — 375px未満でクラムドになる。名前フィールド（姓/名）、時間選択（開始/終了）等
- **ヘッダー（タイトル + Badge）は `flex-col sm:flex-row` でモバイル縦積み** — `flex justify-between` のみだとバッジが押しつぶされる
- **カード・セクションパディングは `p-4 sm:p-6`** — `p-6` 固定はモバイルで過剰。空状態は `p-6 md:p-12`
- **見出しマージンは `mb-4 md:mb-8`** — `mb-8` 固定はモバイルで過剰
- **アクションボタン群は `flex-col sm:flex-row gap-2 sm:gap-3`** — モバイルで横並びだとはみ出す
- **テキストリンクのタッチターゲットは `px-3 py-1.5` 以上** — 素の `<a>` テキストは44px未満。`rounded-md` + padding で確保
- **CSS media queries は modern syntax を使う** — `@media (width < 48rem)` を使用。`@media (max-width: 767px)` のハードコードは禁止
- **DB VARCHAR で管理する非 Prisma enum は `enums/helpers.ts` に `as const` 定数を定義** — `CANCELLED_BY.CUSTOMER` / `CANCELLED_BY.ADMIN` のパターン。文字列リテラル `"CUSTOMER"` の直接使用禁止
- **`inline-block` + `uppercase` + `tracking-[0.18em]` のテキスト折り返し** — `letter-spacing` が広い uppercase テキストは `inline-block` だとボタン枠内で折り返される。`inline-flex items-center justify-center whitespace-nowrap` を使用する
- **Badge base は `whitespace-nowrap` + `text-xs` 込み** — admin / public の両 Badge コンポーネントが `inline-flex items-center whitespace-nowrap ... text-xs` を base に持つ。日本語テキスト（「予約 32件」「定員 50名」等）が狭いセルで折り返されるのを Badge 側で一括防止する。呼び出し側で `className="text-xs"` / セルに `whitespace-nowrap` を重ねない（dead code）
- **ホームページセクション見出しは日英併記** — 英語 uppercase ラベル（`text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground`）+ 日本語見出し（`font-heading text-[clamp(1.5rem,2.5vw,2rem)] font-light`）。英語のみの見出しは禁止。HowItWorks / Spaces / Features / CTA で統一済み
- **`exactOptionalPropertyTypes` 下で Next.js `Link` に optional `onClick` を渡す場合は条件スプレッド** — `onClick={props.onClick}` は `(() => void) | undefined` が `MouseEventHandler` と非互換。`{...(props.onClick && { onClick: props.onClick })}` を使用

- **`<header>` に `role="banner"`、`<footer>` に `role="contentinfo"` を明示** — HTML5 暗黙 role は一部 AT で認識されない。公開ページ `site-header.tsx` / `site-footer.tsx` で設定済み
- **公開モバイルメニューは Radix Dialog (`@radix-ui/react-dialog`) 必須** — 手動オーバーレイ（`useState` + `fixed inset-0`）禁止。Radix が focus trap / Esc / body scroll lock / trigger フォーカス復帰を全て自動処理する。`site-header.tsx` が参照実装
- **Radix `Dialog.Title` に手動 `id` / `Dialog.Content` に手動 `aria-labelledby` 禁止** — Radix は context 経由で `titleId` を自動生成し `Dialog.Title` に `id={context.titleId}` を内部付与、`TitleWarning` は context の `titleId` を `getElementById` で lookup する。手動 `id={xxx}` を spread すると Radix 内部 ID を上書きして `DialogContent requires a DialogTitle` warning が発火する silent bug（Title は存在するのに Radix が見つけられない）。視覚的に隠すだけなら `className="sr-only"` で十分（`@radix-ui/react-visually-hidden` パッケージ追加不要）。`useId()` + `aria-labelledby` + `id` を a11y 強化のつもりで書くのはアンチパターン
- **Radix `NavigationMenu.Link` は `asChild` + `active` prop 必須** — Next.js 統合の[公式パターン](https://www.radix-ui.com/primitives/docs/components/navigation-menu#with-client-side-routing)。`usePathname()` で判定し `<NavigationMenu.Link asChild active={isActive}><NextLink aria-current={isActive ? "page" : undefined} /></NavigationMenu.Link>`。`active` prop が `data-active` 属性と aria-current semantics を提供する
- **`<details>` を `Dialog.Close asChild` でラップ禁止** — summary クリックで accordion 開閉と Dialog 閉じが競合しアコーディオンが開けなくなる。controlled Dialog（`open` state）+ leaf link で `onClick={closeMenu}` を個別付与するパターンを使う
- **Dialog / メニュー閉じコールバックは `onClick` を使う（`onNavigate` ではない）** — `onNavigate` は client-side SPA 遷移時のみ発火で外部 URL / modifier click では発火しない。Dialog 閉じには `onClick` が必須
- **`text-foreground` から `hover:text-foreground` は no-op バグ** — 遷移しない無効 hover。Editorial スタイル変換時に頻出。base が `text-muted-foreground` のときのみ `hover:text-foreground` が有効。base が `text-foreground` の場合は `hover:underline hover:underline-offset-4` を使う
- **公開ページ layout の Client Component で `useSession()` 禁止** — Better Auth クライアントが全公開ページバンドルに含まれる。認証状態は layout の Server Component で `getCurrentCustomerUser()` から解決し、discriminator（例: `"mypage" | "login" | null`）を prop で Client Component に渡す。`mobile-nav.tsx` / `site-header.tsx` 参照実装
- **PPR で `getCurrentCustomerUser()` を layout 本体 `await` 禁止** — uncached header/cookie 読み取りのため `"Route used uncached data outside of <Suspense>"` ビルドエラー。必ず `<Suspense>` 内の async SC wrapper から呼ぶ。request 単位で `cache()` メモ化されるため複数 Suspense 境界から独立に呼んでも DB アクセスは 1 回
- **`site-header.tsx` の brand Link / authLink には `whitespace-nowrap` 必須** — 外側 flex に `gap-*` を追加すると、`tracking-[0.08em]` の日本語ブランド名（例: 「株式会社サンプル」）や認証リンクラベルが折り返される。`justify-between` + `gap-*` で最小間隔を確保しつつ、テキスト子要素は個別に nowrap を付ける
- **公開ページのページ固有 `fixed bottom-*` UI は `bottom-16` で MobileNav の上に積む** — `(public)/layout.tsx` の `MobileNav` は `fixed bottom-0 z-50` で高さ 64px（outer wrapper の `pb-16 md:pb-0` が正本）。予約フローの `StickyBottomBar` 等、ページ固有の sticky bar を `bottom-0` に置くと MobileNav に完全に覆われて不可視になる silent bug（実例: 予約「次へ」ボタンがモバイルで押せない）。`bottom-16` + `z-40` 以下で積み重ね、`pb-[env(safe-area-inset-bottom)]` は MobileNav 側が担うので stacking 対象の sticky bar には不要。ページ内の `h-20` 等の spacer は `pb-16`（outer）+ sticky bar 高さ分の clearance として維持する
- **`PageLayout` `cta` prop（SiteCTA）の直前セクションは `pb-[var(--space-lg)]` 必須** — SiteCTA は `Section border="top"` で `border-t` を持つため、children 最後の `<section className="pt-...">` が pb なしだと border line が直前コンテンツに貼り付く視覚衝突。SiteCTA 自体は変更せず、最終 children section に `pb-[var(--space-lg)]`（`SectionWrapper` の `lg` 段と同スケール）を明示。中間セクションは次セクションの `pt-` で間隔が決まるため pb 不要 — **最終セクションのみ pb 必須**という原則。`/access/page.tsx` の chapters section が参照実装
- **Container 内 section divider は `<Container>` の中の `<div>` に border を付ける** — `<section>` レベルに `border-y` を付けると viewport 全幅になる。container-width で line を引きたい場合は `<section><Container><div className="border-b border-border pb-X">{children}</div></Container></section>` の入れ子で container 幅に line を収める。`/access/page.tsx` の AccessGlobalInfo wrapper が参照実装

## Page-First Architecture（公開ページ）

- **`SpaceCard` の `imageUrls` prop は optional** — 未指定または1枚のみの場合は `ImageFrame` で単一画像表示。2枚以上で `ImageCarousel`（ホバー左右ナビ + モバイルスワイプ + ドット）が有効化。消費者（`RelatedSpaces`, `SpaceShowcaseSection`, `SpaceGrid`）は全て対応済み
- **`ImageCarousel` は `next/image` 直接使用の許容例外** — per-image の `opacity` + `aria-hidden` 制御が必要で `ImageFrame` では対応不可。単一画像は `ImageFrame` を使用
- **`SectionWrapper` と `Section` Primitive を混同しない** — `SectionWrapper`（`sections/SectionWrapper.tsx`）は管理画面 SectionDesign JSON → CSS 変換（padding/background/maxWidth を DB から動的制御）。`Section` Primitive（`design-system/section.tsx`）は静的ページレイアウト用。SectionWrapper を Section に置き換えると管理画面のデザイン制御が効かなくなる
- **一覧ページの trailing sections から同種セクション除外必須** — `/spaces` に SpaceGrid がある場合 `space-list` を、`/events` に自作カレンダーがある場合 `event-calendar` を `trailingSections` フィルタで除外。除外しないとページ独自 UI とセクションシステムの同種コンテンツが重複描画される
- **ページ固有 CTA（SiteCTA）を持つページは `cta` セクションも除外** — `/faq`（SiteCTA でお問い合わせ誘導）、`/contact`（フォーム自体が CTA）では DB の `cta` セクションが重複。`trailingSections` フィルタに `s.type !== "cta"` を追加
- **レガシーセクション（`_components/*.tsx`）も Editorial Magazine 準拠必須** — SectionRenderer 経由で描画されるため見落としやすい。`rounded-lg`/`shadow`/`hover:text-accent`/`tracking-wide`/`font-medium` on serif が残りやすい。新規 Primitives 整備後も個別修正が必要
- **hero 直下の一覧セクションは上余白を縮小** — `py-[var(--space-lg)]` は PageHero 直後に過剰になりやすい。`pt-10 pb-[var(--space-lg)] md:pt-14` で上余白のみ抑える。適用済み: `/spaces`, `/posts`, `/news`, `/faq`。記事詳細・ホームページセクションは独立コンテンツのためフル余白維持
- **ホームヒーローは `Page.pageHero` のみ** — `homepage-hero` Section type / registry / 旧 `hero-section.tsx` は廃止。編集は `/admin/pages/home` のヒーロータブ、検証は `pageHeroSchema` / `parsePageHero` が正本
- **`public-queries.ts` の全関数に `'use cache'` + `safeFetch` + `toPlainObject` 必須** — `settings/public-queries.ts` で欠落していた前例あり。新規 public-queries 作成時は `'use cache'` + `cacheTag` + `cacheLife` を忘れずに
- **同種の公開 UI コンポーネント重複禁止** — 新規作成前に `_shared/components/ui/` を確認。`FilterBar`（nuqs + useTransition + Editorial スタイル）が唯一のカテゴリフィルタ
- **`_shared/components/` は kebab-case 必須、`_components/` レガシーセクションは PascalCase 維持** — `SectionWrapper.tsx`/`SectionLabel.tsx` はレガシー用の固有コンポーネントで PascalCase 維持。それ以外の `_shared/` 配下は全て kebab-case
- **`@layer compat` と旧カラートークンは削除済み** — `--color-primary` / `--color-brand-primary` 等の旧トークンは存在しない。全コンポーネントが `@theme` のセマンティックトークン（`accent`/`foreground`/`surface` 等）を直接使用
- **公開ページの `hover:text-accent` は原則禁止** — `hover:text-foreground` に統一（Editorial Magazine トーン）。accent はラベル・価格・CTA テキストの静的表示のみに使用
- **`tracking` は `tracking-[0.18em]` を標準値とする** — SectionLabel, ナビリンク, MagneticButton, ScrollIndicator 等で統一。`tracking-[0.2em]` / `tracking-[0.3em]` は旧値
- **Button primary の bronze shimmer アニメーション廃止** — `hover:bg-accent/90 hover:shadow-md` のシンプルな遷移に変更。`hover:animate-[bronze-shimmer]` / `hover:bg-[image:linear-gradient(...)]` は使用しない
- **ImageFrame の hover は `opacity-85`（`scale-105` 廃止）** — Editorial Magazine の控えめなインタラクション。全公開ページ画像で統一。`image-gallery.tsx` の Lightbox 用サムネイルも同様
- **SC children を CC 内でタブ切替する場合は CSS `hidden` を使用** — CC 内で SC を条件レンダリング（三項演算子）すると SC が再評価される。page.tsx から両ビューを props で渡し、`className={activeView !== "x" ? "hidden" : undefined}` で DOM を保持したまま表示切替。実装例: `events/_components/events-view-switcher.tsx`
- **公開詳細ページのレイアウトパターンは2種** — ①記事型（`/posts`, `/news`）: SWELL 風パンくず帯（`bg-surface shadow-inner` + `Breadcrumb size="sm"`）→ コンテンツカラム内に `Heading level={1}` + メタ情報 + 本文。②固定型（`/events/[slug]`, `/terms/[slug]`, `/spaces/[slug]`）: `PageHero variant="compact"` + `Section`。手動 `<section>` + `<>...</>` ラッパーは禁止
- **記事本文は `Prose` Primitive 必須** — raw `prose prose-lg max-w-none` 禁止。`<Prose variant="editorial">` を使用（editorial: drop-cap + リンク色 + blockquote スタイル）。Post/News/Terms の本文で統一
- **共有コンポーネントの descendant selector override 禁止** — `[&_a]:py-0 [&_svg]:h-3` 等で内部スタイルを外部から制御しない。コンポーネントに `size` / `variant` prop を追加して内部で制御する（`Breadcrumb size="sm"` が参照実装）
- **記事詳細ページのフッター（タグ+シェア）は `ArticleFooter`（`@/public/components/ui/article-footer`）に統合** — 個別 `<div className="mt-12 border-t border-border pt-6">` を 2 連続で書かない。Editorial Magazine 準拠（Kinfolk/Cereal/WordPress Twenty Twenty-Four）で `<footer>` 1 個に集約。タグは `border-y py-6` の上下線バンド、シェアは余白のみ分離（罫線なし）。タグなしの場合はシェアに `border-t pt-8` を適用。posts/news/preview で共通利用。タグリストは `ArticleTagList` の `<ul aria-label="タグ">` + `<li><span>`（WAI-ARIA list pattern、将来リンク化に開いた構造）
- **記事詳細ページのレイアウトは `ArticleLayout` + `ArticleHeader` に統一** — posts/news/preview すべて。`Container` + `BlogLayout` + `contentClassName` div の 4 階層ネスト禁止。`ArticleLayout` が `<article>` を semantic ルートとして内包し、`contentWidth` / `contentWidthCustom` で `resolveWidthStyles` 幅制御。preview は Server Component の page.tsx で `<ArticleLayout banner={<PreviewBanner />} showSidebar={false} showCta={false}>` を組み、Client Component を children に渡して header/body を描画（RSC split）。旧 `ArticleDetailHero` は廃止済 — 再導入禁止
- **`ArticleLayout` の `toc` / `mobileToc` prop が渡されると `BlogLayout` をバイパスして独自 2-col grid になる** — posts/news 記事詳細に目次サイドバーを出すための挙動（`lg:grid-cols-[1fr_280px]` + sticky aside）。`toc` 未指定時は従来どおり `BlogLayout` 経由（widget サイドバー）。TOC 表示条件は呼び出し側で h2 数 `>= TOC_MIN_H2`（=2）判定。`mobileToc` は `<article>` 冒頭に `<div className="lg:hidden">` ラップで挿入（sidebar は `<lg` で末尾スタックし無意味なため）
- **`BlogLayout` の `showSidebar={false}` は明示的 fast path** — 早期 return で `getSidebarSettings()` DB fetch をスキップ。sidebar 不要が確定するページ（preview 等）では必ず `false` を明示、省略（`null`）しない
- **`/posts` はブログ一覧、`/news` はお知らせ一覧** — 各詳細ページ（`/news/[slug]`、`/posts/[...segments]`）も個別に維持。`/journal` は廃止済み
- **`SearchBar` は `searchFilterParsers`（q + page）固定** — ページ固有のパーサー（`postsSearchParamsParsers` の `category` 等）とは別だが、nuqs の `useQueryStates` は設定キーのみ更新し他キーは保持するため共存可能。`SearchBar` を流用する場合にパーサー統一は不要
- **`PageContent` モデルは廃止済み** — 全ページが `Page` + `Section` で管理。`getPageContent()` / `simplePageContentSchema` / `defaultXxxContent` は全て削除済み。公開ページは `getPageSectionsWithFallback(slug)` + `SectionRenderer` を使用
- **セクションタイプは kebab-case 文字列** — DB の `Section.type` は `String @db.VarChar(64)`。`"hero-parallax"` 等。`SectionType` Prisma enum は廃止済み（`section.ts` の `as const` オブジェクトとして再定義）
- **新セクションタイプ追加は `definitions/` ディレクトリ作成のみ** — `schema.ts` + `metadata.ts` + `registry.ts` への import 追加。Prisma マイグレーション不要。`/create-section-type` スキルで自動生成可能
- **AutoSectionForm は field メタデータなしのフィールドをスキップ** — `extractFieldMeta()` が `undefined` を返すフィールド（`categoryId` 等の plain Zod）は管理画面フォームに表示されない
- **AutoSectionForm のフィールドに `defaultValue` + `setValue` パターン禁止** — Radix Switch/Select、native `<input type="color">` は `defaultValue` が静的で UI が追従しない。`useController` で RHF 制御に統一する。参照: `AutoBooleanField`、`AutoSelectField`、`AutoColorFieldControlled`
- **新規公開ページ追加は `/create-page-content` スキル** — `DEFAULT_PAGE_SECTIONS` にエントリ追加 + `page.tsx` 作成。`PageContent` は使わない
- **ホームページセクションの `pageId: null` は廃止済み** — 全セクション（ホームページ含む）が Page レコードの `pageId` に紐づく。`pageId: null` でホームページ判定するコードは禁止。ホームページは slug `"home"` の Page レコードで管理
- **`/admin/pages/homepage/edit` は廃止済み** — ホームページ編集は `/admin/pages/home/edit`（`[slug]/edit` に統合）。`HomepageSectionCommand` 系コマンドも廃止、page-scoped コマンドに統一
- **`DesignFields`（旧 `DesignPanel`）は ToggleGroup + フラット fieldset で実装済み** — `pages/[slug]/edit/_components/DesignFields.tsx`。Accordion 廃止、form タグなし。親 `SectionEditor` に埋め込まれる
- **ページ編集の SEO はページレベルタブ「ページ設定」にある** — `SectionMasterDetail.tsx` の `Tabs [セクション | ページ設定]`。旧 `SEO_SELECTION_ID` / サイドバー SEO リンクは削除済み。SEO 関連機能を追加する場合は「ページ設定」タブ内に配置する
- **アニメーションファイルは kebab-case のみ** — `scroll-reveal.tsx`, `split-text.tsx`, `magnetic-button.tsx`, `parallax-image.tsx`。旧 PascalCase re-export ラッパーは削除済み。レガシーセクションコンポーネント（`_components/*.tsx`）も kebab-case で直接 import
- **公開ページのマルチステップフォームでは視覚パターンを全ステップで統一** — `bg-surface` ラッパー・見出しスタイル・ナビゲーション配置をステップ間で揃える。フロー全体の一貫性を優先
- **Prisma `Decimal` と `createAppPrismaClient`** — アプリ標準の **`prisma`**（`src/shared/db/prisma.ts`）は **`createAppPrismaClient`** により対象モデルの金額等が **読み取り結果で `number`**。**集計**（`_sum` / `_avg`）や拡張前クライアント経由では `Number()` が必要なことがある。`as number` 禁止 → `prisma-patterns.md` の Decimal 節を参照
- **`prisma/seed.ts` と `logger`** — seed は **`@/shared/db/prisma` を import しない**（`server-only`）。 Prisma は `createAppPrismaClient(new PrismaClient({ adapter }))`。共有ドメインコードが `@/shared/lib/errors/logger` を引くと seed が落ちる → **`logger-core`** を使う（`error-handling.md` / `prisma-patterns.md`）
- **Prisma JSON フィールド（`imageUrls`, `facilities`）は `unknown` で受け取る** — `Array.isArray()` + type guard filter でランタイムパース。`as string[]` 禁止
- **`Prisma.XxxGetPayload` は `$extends` 前の型を返す** — `createAppPrismaClient` の Decimal→Number 変換が反映されない。拡張クライアントの戻り値型は `Awaited<ReturnType<typeof prisma.xxx.findMany<{ select: typeof xxxSelect }>>>[number]` パターンで取得する
- **`<button>` 内にインタラクティブ要素（`<button>`, `<a>`, `<input>`）をネスト禁止** — HTML 仕様違反（hydration mismatch を誘発）。解決方針は **ARIA 第一ルール（"native HTML over ARIA"）** を最優先。
  - **(1) 第一推奨: Block Link / Card Overlay パターン（native `<button>` + z-layer 分離）** — 業界標準（GitHub / YouTube / Shopify Admin / Adrian Roselli "Block Links" / Heydon Pickering _Inclusive Components_）。コンテナ `<article className="relative group">` の中に 2 レイヤ: **① Primary target** `<button type="button" className="absolute inset-0 z-10" aria-label="...">` でカード全体を覆う。**② Action layer** `<div className="absolute inset-0 z-20 pointer-events-none">` で secondary actions を配置し各 `<button>` のみ `pointer-events-auto` で受け取る。**効果**: native button なのでキーボード・focus・`disabled`・form submission の全契約が自動／`onClick` 伝播が物理的に起きないため `e.stopPropagation()` 不要／button ネスト自体が発生しない（primary と secondary は兄弟関係）。hover 表示は `group-hover` + `group-focus-within` でキーボード対応。参照実装: `media/_components/MediaGrid.tsx`
  - **(2) 第二推奨（native button が構造上使えない場合のみ）**: `<div role="button" tabIndex={0} aria-pressed={isSelected}>` + **Enter = `onKeyDown` / Space = `onKeyUp` で activate**（WAI-ARIA APG Button Pattern 公式、HTML `<button>` と同契約）+ `onKeyDown` で Space `preventDefault()` 必須（スクロール抑止）+ `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`。`onKeyDown` 単独で Enter/Space 両処理は pragmatic だが公式不準拠。**Radix `Toggle` は `<button>` を生成するためネスト問題を解決不能**。`role="button"` div は第一推奨（Card Overlay）が使えないニッチケース専用
  - **(3) 単一選択リスト UI**: カード全体が `<button role="radio">` で内部に詳細リンクが必要な場合は `<div role="radio" tabIndex={0} onKeyDown={...}>` + 内部 `<button>`（`space-selector.tsx` / `location-selector.tsx` が参照実装）。複数選択は `role="checkbox"` + `aria-checked`
- **Three.js / PixiJS は未使用** — 旧 `effects/` インフラ・`VisualEffectsProvider` は削除済み。`package.json` に `three` / R3F / `pixi.js` は含めない。再導入しない
- **公開ヘッダーの NavigationMenu は `@radix-ui/react-navigation-menu` を直接使用** — shadcn/ui の NavigationMenu は `@/admin/components/ui` にインストールされるが、公開ページは admin の UI を import しない。`import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"` で直接使用する
- **FAQ 項目とカテゴリはソフトデリート** — `deletedAt: null` ガードが queries.ts 全クエリに必須。親カテゴリの `category: { deletedAt: null }` も同時適用（親ソフトデリートガードパターン）。30 日以内は Recycle Bin から復元可能。`getDeletedFaqItems` / `getDeletedFaqCategories` は復元候補のみを返す
- **FAQ 項目の回答はプレーンテキスト単一列（`answer`）** — Lexical JSON / HTML キャッシュ / プレーン派生の 3 カラム構成は廃止済み。公開 `/faq` が固定デザイン（`whitespace-pre-wrap` 改行保持）で描画するためリッチフォーマットが不要。検索・一覧プレビュー・JSON-LD はすべて `answer` を直接使う。管理画面は `FaqItemDialog` の `<Textarea>` で編集（Lexical エディタは使わない）
- **FAQ bulk 操作は `updateMany` または interactive `$transaction`** — `bulkPublishFaqItems` / `bulkDeleteFaqItems` は単純な `updateMany`、`bulkMoveFaqItems` は order の逐次 increment が必要なため `prisma.$transaction(async (tx) => { ... })` で実装（→ `prisma-patterns.md` §トランザクション）
- **FAQ 管理 UI は master-detail 構造** — `/admin/faq` カテゴリ一覧（`FaqCategoryGrid` + DnD）→ `/admin/faq/[categoryId]` 詳細（`FaqCategoryItemsTable` + DnD + Dialog CRUD）+ `/admin/faq/trash` + `/admin/faq/seo`。質問 CRUD は `FaqItemDialog`、カテゴリ CRUD は `FaqCategoryDialog`（どちらも Radix controlled pattern + `useFormAction({ refresh: true, onSuccess: () => onOpenChange(false) })`）。プレビューサイドシートは廃止済（edit Dialog が直接開く）
- **FAQ テーブル行クリックと checkbox/drag/ActionCell の click 衝突** — `onClick={stopPropagation}` で行クリックを遮断、`PointerSensor` の `distance: 8` で drag 開始閾値を確保（`FaqCategoryItemsTable.tsx` 参照）
- **Admin 一覧にカラムソート追加は 5 ステップ** — ①`src/shared/lib/nuqs/parsers.ts` に `sortBy` + `parseAsSortOrder` を parser map に追加 ②domain query に `buildXxxOrderBy(sort)` helper + `sort?: XxxSort` 引数追加（`viewCount` 等は tie-breaker `{ updatedAt: "desc" }` 必須）③`loadXxxSearchParams` で parse、page.tsx で `{ sortBy, sortOrder }` を domain query に渡す ④inline または `*TableHeader.tsx`（Client Component）で `useQueryStates` + `startTransition` + `SortableColumnHeader`（`@/admin/components/table`）⑤table 本体に `currentSortBy` prop を追加。参照実装: `ReservationTableHeader.tsx`、`FaqCategoryItemsTable.tsx`（inline 版）
- **`parseAsSortOrder` 共有 default は `"desc"` — 手動 order 系カラムは parser map で override 必須** — `parseAsStringLiteral(sortOrders).withDefault("asc")` を個別指定しないと、`sortBy="order"` 初回ランディングでカテゴリ内の手動並び順が逆順表示される（URL params なし時）。`viewCount` / `createdAt` は desc 優先で問題なし。review 時は「初回ランディング（URL params なし）で table がどう見えるか」を必ず確認。参照実装: `adminFaqCategoryDetailSearchParamsParsers.sortOrder`
- **Nullable 列のソートは `{ sort, nulls: "last" }` + tie-breaker 必須** — `lastReservationAt` / `totalSpent` / `lastLoginAt` 等の nullable 列を `desc` ソートすると Postgres default では NULL が先頭に並ぶ。`orderBy: [{ [col]: { sort: sortOrder, nulls: "last" } }, { updatedAt: "desc" }]` の形で NULL を末尾に寄せ、同値行の順序を `updatedAt` で安定化。non-nullable 列（`createdAt` / `totalReservations` 等）は `{ [col]: sortOrder }` 単独で OK だが tie-breaker は常に推奨。参照実装: `buildCustomerOrderBy`（`src/shared/domain/customers/queries.ts`）
- **公開ページ集計 counter API パターン** — POST `/api/[resource]/[id]/[counter]` route + `z.string().uuid()` で id 検証 + `updateMany({ where: { id, isPublished: true, deletedAt: null }, data: { field: { increment: 1 } } })` + `unstable_rethrow(error)` + `ErrorSeverity.LOW`。client 側は `localStorage` dedup（TTL or 永続 flag）+ `fetch({ keepalive: true })` + silent fail（UX を阻害しない）。`proxy.ts` のレート制限（100/min/IP）でスパム防御。個人情報は記録しない（Zendesk / HubSpot KB 方式）。参照実装: `src/app/api/faq/[id]/view/route.ts`、`faq-view-tracker.tsx`、`faq-helpful-vote.tsx`
- **公開ページ集計 counter API は意図的にキャッシュ invalidate しない** — `viewCount` / `helpfulCount` / `notHelpfulCount` 等の increment は `updateTag(CACHE_TAGS.*)` を呼ばない。公開ページの表示カウントは管理者 CRUD で次回 invalidate されるまで stale になるが、これは設計判断（Zendesk / HubSpot KB 方式: ephemeral な集計値は strong consistency 不要、毎 increment でキャッシュを吹き飛ばすとパフォーマンス劣化）。次回セッションで「cache 更新漏れ」と誤認して修正しないこと
- **`NOTIFICATION_TYPE` 追加は 3 箇所同時更新必須** — `enums/helpers.ts` の ①`NOTIFICATION_TYPE` const ②`NOTIFICATION_TYPE_LABELS`（日本語ラベル）③`NOTIFICATION_TYPE_BADGE_VARIANTS`（`AdminBadgeVariant`）。いずれも `Record<NotificationType, ...>` のため欠落時は TypeScript エラー。DB は VARCHAR 管理のためマイグレーション不要
- **`AdminNotification.resourceId` は `@db.Uuid` — cuid リソース（Event / EventRegistration）を入れると `P2007`** — schema 設計上 UUID 制約のため、cuid id（`@db.VarChar(30)`）を渡すと `invalid input syntax for type uuid`。cuid リソースの通知は `resourceType` のみ記録し `resourceId: undefined` にする（or cuid リソースには通知を生成しない）。予約・問い合わせ・レビュー・顧客（全て `@db.Uuid`）は従来通り `resourceId` 設定可。seed `seedAdminNotifications` / 本番 `createNotificationCommand` 両方で同じ制約
- **公開ページ詳細で `Container variant="narrow"` とコンテンツ幅設定の併用禁止** — `max-w-3xl`(768px) がハードコードされ、管理画面の幅設定を上書きする。コンテンツ幅を設定値に従わせる場合は `Container`（default）+ `resolveWidthStyles` の `className`/`style` で制御する
- **`Container variant="narrow"` + 2カラムグリッドは幅が不足する** — `narrow`(768px) にサイドバー(320px)+gap(48px)を入れるとメイン領域が400pxしか残らない。2カラムレイアウトには `Container`（default: 1280px）を使用
- **公開ページの sticky サイドバーは `--header-height` を考慮** — `lg:top-8` ではヘッダーに隠れる。`lg:top-[calc(var(--header-height)+2rem)]` を使用（参照実装: `spaces/[slug]/page.tsx`, `contact/page.tsx`）
- **Design System `Heading` コンポーネントは `level` prop** — `as="h2"` ではなく `level={2}` を使用。`as` prop は存在しない
- **`scrollIntoView({ block: "start" })` は固定ヘッダーを考慮しない** — `getBoundingClientRect().top + window.scrollY - getHeaderHeight() - margin` で計算する。`--header-height` CSS 変数を `getComputedStyle` で取得。参照実装: `reservation/_components/reservation-form.tsx` の `scrollToElement`。フォーカス時の自動スクロールは `scrollIntoView({ block: "center" })` か CSS `scroll-margin-top: calc(var(--header-height) + 2rem)` で対応
- **`bg-surface` カード内のインタラクティブ要素は `bg-background` で浮かせる** — `bg-surface` の上に `border border-border` だけのボタンを置くとコントラスト不足。`bg-background shadow-sm` を加えて視覚的に分離する。hover は `hover:bg-accent/5` 等で変化をつける
- **Design System `Input`/`Textarea` の必須マークは `required` prop で自動表示** — `required` を渡すとラベル横に赤い `*` が表示される（`aria-hidden="true"`）。手動で `label="姓 *"` のように書かない。任意フィールドはラベルに「（任意）」を明記する（例: `label="電話番号（任意）"`）
- **`usePublicForm` の action callback 内で `form.setValue()` を呼ばない** — `form` は `usePublicForm()` の戻り値なので、自身の引数 callback 内で参照すると ESLint `react-hooks/immutability` エラー。Turnstile リセット等は `turnstileRef.current?.reset()` のみ行い、`onVerify` callback で新トークンが自動セットされるのに任せる
- **`Heading` のサイズオーバーライドは `!text-*`** — `Heading` は CSS 変数 `--text-h{level}` でサイズ指定するため、カスタムサイズには `!text-base` 等の `!important` プレフィックスが必要。`text-base` だけでは CSS 変数に負ける
- **JSON-LD は `json-ld.tsx` の共通コンポーネントを使う** — `JSON.stringify` だけでは `script` タグ終了によるインジェクション可能。`FAQPageJsonLd` 等は `<` `>` `&` を Unicode エスケープ済み。Client Component で共通コンポーネントが使えない場合は `.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")` を手動追加

## ブログサイドバー

- **`sidebarWidgets` JSON は順序付き配列** — `[{ type: "search", enabled: true }, ...]` 形式。旧 object 形式（`{ search: true, ... }`）は `parseSidebarWidgets()` がデフォルト配列にフォールバック
- **`BlogLayout` は Container の中に配置** — Container → BlogLayout → children の順。BlogLayout を Container の外に置くとサイドバーが全幅になる
- **サイドバー有効時に `Container variant="narrow"` 禁止** — 2カラム（メイン + 320px + gap-12）で幅不足。default Container (1280px) を使用
- **`Page.showSidebar` オーバーライド**: `null`=グローバル設定に従う、`true/false`=明示的。posts ページは Page レコードの `showSidebar` を参照、記事詳細はグローバルのみ
- **サイドバーデータ変更時は `SIDEBAR_DATA` キャッシュ無効化が必要** — Post/News の CRUD アクションの `afterSuccess` に `updateTag(CACHE_TAGS.SIDEBAR_DATA)` を追加済み。新しいコンテンツ系アクション追加時も忘れずに
- **Zod `z.union` の discriminated union narrowing は `switch` の `case` で効く** — `SidebarWidget = SimpleBuiltinWidget | RecentWidget | PopularWidget | CustomWidget` の `switch (widget.type) { case "popular": /* widget.layout / widget.showRanking に narrow アクセス */ }` で固有フィールドが型安全に読める。`as CustomWidget` 等の型アサーションは不要（プロジェクト禁止ルール）
- **Post リスト widget（recent/popular）は `SidebarPostList` 1 コンポーネントに統一** — `label` / `layout: "compact" | "stacked"` / `showRanking` prop で切替。Compact: 横並び（96×64 サムネ + CATEGORY · DATE + 2 行 clamp）、Stacked: 縦積み（aspect-[3/2] フル幅サムネ）。ランキングはサムネ左上に bronze 半透明オーバーレイ（NYT 方式）。旧 `SidebarRecentPosts` / `SidebarPopularPosts` は削除済み
- **サイドバーサムネ画像の `sizes` prop 戦略** — compact: `sizes="96px"`（固定 px）/ stacked: `sizes="(min-width: 1024px) 320px, 100vw"`（レスポンシブ）/ ランキング縮小版: `sizes="64px"`。next/image CDN 最適化のため小サイドバーサムネは固定 px を明示する（レスポンシブ値だと過剰サイズの optimized 画像が要求される）
- **recent/popular widget schema は discriminated union + `.default()` で拡張** — DB JSON カラムの既存 `{ type: "recent", enabled: true }` は safeParse 時に `layout: "compact"` / `showRanking: true` が補完されるため schema 拡張時も migration 不要（→ `zod-patterns/validation-schemas.md` §Discriminated union + `.default()`）
- **`Post.thumbnailUrl` は `String` 非 nullable（空文字列あり得る）** — サイドバー・カード・ギャラリー等の表示コンポーネントは `post.thumbnailUrl ? <Image .../> : <div className="aspect-[3/2] bg-surface" />` でフォールバック必須。`thumbnailUrl == null` はスキーマ上存在しないため `post.thumbnailUrl ?? fallback` パターンは機能しない

- **公開ページのアクションボタンに `rounded-full` 禁止** — Editorial Magazine はシャープエッジが基本。`Button` Primitive の primary/secondary/ghost/editorial は全てシャープ。`rounded-full` はバッジ・タグ・アイコンボタン（シェア・ギャラリーナビ）・スピナー・カルーセルドットのみ許容

- **リスト `.map` 内の個別 `<ScrollReveal delay={i*0.08}>` wrap は anti-pattern** — 縦並びで大きなカード（event-list 等）は 2 個目以降が viewport 外で `opacity:0` のまま待機、スクロールしないと見えない silent bug。`ScrollRevealGroup`（1 ScrollTrigger + stagger、`@/public/components/animations/scroll-reveal`）に集約。event-list-view / post-grid / space-grid / news-list / features-section / how-it-works-section / SpaceShowcaseSection で統一済み。詳細は `frontend/gsap/matchmedia.md` §パターン D
- **Structured list の canonical border/divider pattern** — `divide-y border-y border-border divide-border` をコンテナに適用（上下 + 各アイテム間の線）。per-item `cn("border-b", i === 0 && "border-t")` 分岐ロジックは廃止。features-section / event-list-view / news-list が参照実装
- **news archive は `<ul>/<li>` ではなく `<div className="divide-y border-y ...">`** — event-list と同形で統一。Editorial Magazine（Kinfolk / Cereal / The Gentlewoman）は news archive を `<ul>` でマークアップしない業界標準
