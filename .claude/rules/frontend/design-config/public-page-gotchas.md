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
- **RHF `defaultValues` は Zod スキーマの全フィールドを宣言必須 (残存 RHF 利用箇所限定、Phase 1 Task 8 完了、別 phase で残存 RHF 完全削除予定)** — 省略すると `useWatch` の初期値が `undefined` になり条件分岐が壊れる。`z.literal(true)` フィールド（`agreeToTerms` 等）は `defaultValues` に含めない（型が `true` のため `false` を渡せない）。**新規 form は conform `useForm({ defaultValue })` 単数形を使用** — schema 全フィールド宣言は不要（FormData 経由で server 側が parseWithZod で defaults 適用）、`z.literal(true)` 等は HTML `<input type="checkbox" required>` + Zod `.refine(v => v === true)` で表現
- **`useFormAction.onSuccess` は `(data, form) => void` 契約 (残存 RHF 利用箇所限定、Phase 1 Task 8 完了、別 phase で残存 RHF 完全削除予定)** — hook 戻り値の `form` を action callback 内で closure 参照すると `react-hooks/immutability` 違反（公式: "Return values and arguments to Hooks are immutable"）。`onSuccess: (_data, form) => form.setValue(...)` で callback 引数から受け取る。参照実装: `GoogleMapsSection.tsx` / `TurnstileSection.tsx`。**新規 form は conform `useActionState` + `lastResult.initialValue === null` 判定 (`useEffect` 内 redirect / `useInputControl.change()` 経由 form 更新) が canonical**、本 gotcha は `useFormAction` 廃止と同時に解消
- **eslint-plugin-react-hooks 7.1.x 新ルール挙動** — `react-hooks/set-state-in-effect` はリテラル値（`true` / `false` / `[]`）の setState を検出しない（動的値のみ）。`@eslint-react/set-state-in-effect` は両方検出するためルール併記で disable が必要なケースあり。`react-hooks/immutability` は hook 戻り値を同 hook の callback 引数内で参照すると TDZ 扱いで検出。正当な修正は eslint-disable ではなく render 中 state sync / `useSyncExternalStore` / render 中 derive / callback 引数化

## 公開ページ レスポンシブ標準

- **公開ページ見出しの `text-wrap` / `word-break` は `@layer base` が SSoT** — `public.css` の `@layer base` が `h1`–`h6` に `text-wrap: balance` + `word-break: auto-phrase`（日本語フレーズ折返し, Chrome 119+）を自動適用する。個別コンポーネントで `text-wrap-*` / `break-*` ユーティリティを重ねない。`whitespace-nowrap` が必要な特殊ケース（バッジ等）は例外
- **`SectionWrapper` の `LAYOUT_CONTAINER_WIDTH_CLASSES` は名前と幅が逆転** — `sm: --prose-narrow` / `md: --prose-medium` / `lg: --container-max` (1280px / **wider**) / `xl: --container-editorial` (50rem=800px / **narrower**) / `full: max-w-none`。`xl` は editorial 幅で `lg` より狭い反直感マッピング。フルワイド（viewport 全幅）が必要なら `containerWidth: "full"`、標準ページ幅は `lg`、editorial 記事測度は `xl`
- **公開ページ見出しの font-weight / letter-spacing / line-height も `@theme --text-*--*` が SSoT** — `text-h1` 等の utility を使う箇所で `font-light` / `leading-*` / `tracking-*` を重ねない（→ `tailwind-patterns/theme-tokens.md` §Typography SSoT）。意図的 override は editorial-card featured variant のみ
- **公開カレンダーの曜日色は日 = `text-destructive`、土 = `text-info`** — 日本標準のカレンダー配色。日曜始まり。今日マーカーは `bg-accent text-accent-foreground rounded-full`。曜日ヘッダーは `bg-surface` + 枠線
- **日本語ラベルのタブ/ナビに `uppercase` 禁止** — `uppercase` は Latin 専用。日本語タブは Journal タブパターン（`text-sm tracking-[0.18em]`、uppercase なし）に合わせる。ヘッダーナビ（`text-[0.75rem] uppercase`）は英語ラベル向け
- **空状態の CTA は `Button variant="editorial" size="sm"` を使用** — テキストリンクは余白の中で埋もれる。メッセージテキストは `text-muted-foreground`（base サイズ）、ボタンは `space-y-4` で配置
- **カードグリッドは Container Queries を使う** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`。viewport breakpoints (`md:grid-cols-2`) ではなくコンテナ幅に応じて適応。管理画面 dashboard は `@container/main` named container を使用
- **ページレベルのレイアウト切替は viewport breakpoints を維持** — 2 カラム text+image（ConceptSection）、フォームグリッド（ContactFormSection）等のマクロレイアウトは `md:grid-cols-2` のまま
- **Heading サイズは `text-h1`/`text-h2`/`text-h3`/`text-h4`/`text-hero` クラスを使う** — `@theme` で `--text-*--line-height/letter-spacing/font-weight` が自動適用される
- **Design System Primitives (Container, Stack, Heading, Badge, Prose, ImageFrame) は Server Component** — `"use client"` は不要
- **`grid-cols-2` には必ず `grid-cols-1 sm:grid-cols-2` を使う** — 375px 未満でクラムドになる
- **ヘッダー（タイトル + Badge）は `flex-col sm:flex-row` でモバイル縦積み** — `flex justify-between` のみだとバッジが押しつぶされる
- **カード・セクションパディングは `p-4 sm:p-6`** — `p-6` 固定はモバイルで過剰。空状態は `p-6 md:p-12`
- **見出しマージンは `mb-4 md:mb-8`** — `mb-8` 固定はモバイルで過剰
- **アクションボタン群は `flex-col sm:flex-row gap-2 sm:gap-3`** — モバイルで横並びだとはみ出す
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

## Page-First Architecture（公開ページ）

- **`SpaceCard` の `imageUrls` prop は optional** — 1 枚以下は `ImageFrame`、2 枚以上で `ImageCarousel`
- **`ImageCarousel` は `next/image` 直接使用の許容例外**
- **`SectionWrapper` と `Section` Primitive を混同しない** — SectionWrapper（DB 駆動）vs Section Primitive（静的レイアウト用）
- **一覧ページの trailing sections から同種セクション除外必須** — `/spaces` から `space-list`、`/events` から `event-calendar` を `trailingSections` フィルタで除外
- **ページ固有 CTA を持つページは `cta` セクションも除外** — `/faq` / `/contact` で重複防止
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
- **公開詳細ページのレイアウトパターンは 2 種** — ①記事型（posts/news）SWELL 風パンくず帯 + Heading level={1} + メタ情報。②固定型（events/terms/spaces）`PageHero variant="compact"` + Section
- **記事本文は `Prose` Primitive 必須** — `<Prose variant="editorial">`（drop-cap + リンク色 + blockquote スタイル）
- **共有コンポーネントの descendant selector override 禁止** — `[&_a]:py-0` 等を外部から制御しない、`size` / `variant` prop を追加
- **記事詳細ページのフッターは `ArticleFooter`（`@/public/components/ui/article-footer`）に統合**
- **記事詳細ページのレイアウトは `ArticleLayout` + `ArticleHeader` に統一** — `Container` + `BlogLayout` + `contentClassName` div の 4 階層ネスト禁止
- **`ArticleLayout` の `toc` / `mobileToc` prop が渡されると `BlogLayout` をバイパスして独自 2-col grid になる** — `lg:grid-cols-[1fr_280px]` + sticky aside
- **`BlogLayout` の `showSidebar={false}` は明示的 fast path** — DB fetch をスキップ
- **`/posts` はブログ一覧、`/news` はお知らせ一覧** — `/journal` は廃止済み
- **`SearchBar` は `searchFilterParsers`（q + page）固定**
- **`PageContent` モデルは廃止済み** — 全ページが `Page` + `Section` で管理
- **セクションタイプは kebab-case 文字列** — DB の `Section.type` は `String @db.VarChar(64)`
- **新セクションタイプ追加は `definitions/` ディレクトリ作成のみ** — Prisma マイグレーション不要
- **AutoSectionForm は field メタデータなしのフィールドをスキップ**
- **AutoSectionForm のフィールドに `defaultValue` + `setValue` パターン禁止** — `useController` で RHF 制御
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
- **FAQ 管理 UI は master-detail 構造**
- **FAQ テーブル行クリックと checkbox/drag/ActionCell の click 衝突** — `onClick={stopPropagation}` + `PointerSensor` `distance: 8`
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
- **`usePublicForm` の action callback 内で `form.setValue()` を呼ばない** — `react-hooks/immutability`
- **`Heading` のサイズオーバーライドは `!text-*`** — `!important` プレフィックス必要
- **JSON-LD は `json-ld.tsx` の共通コンポーネントを使う** — Unicode エスケープ済み

## ブログサイドバー

- **`sidebarWidgets` JSON は順序付き配列** — `[{ type: "search", enabled: true }, ...]`
- **`BlogLayout` は Container の中に配置**
- **サイドバー有効時に `Container variant="narrow"` 禁止** — default Container (1280px) を使用
- **`Page.showSidebar` オーバーライド**: `null`=グローバル設定、`true/false`=明示的
- **サイドバーデータ変更時は `SIDEBAR_DATA` キャッシュ無効化が必要**
- **Zod `z.union` の discriminated union narrowing は `switch` の `case` で効く**
- **Post リスト widget（recent/popular）は `SidebarPostList` 1 コンポーネントに統一**
- **サイドバーサムネ画像の `sizes` prop 戦略** — compact: `96px`、stacked: `(min-width: 1024px) 320px, 100vw`
- **recent/popular widget schema は discriminated union + `.default()` で拡張**
- **`Post.thumbnailUrl` は `String` 非 nullable（空文字列あり得る）** — フォールバック必須
- **公開ページのアクションボタンに `rounded-full` 禁止** — Editorial Magazine はシャープエッジが基本
- **リスト `.map` 内の個別 `<ScrollReveal delay={i*0.08}>` wrap は anti-pattern** — `ScrollRevealGroup` に集約
- **Structured list の canonical hairline pattern** — `divide-y divide-divider`（editorial 専用 token、外枠 `border-y border-border` は使わない）。`divide-border` 復活禁止 — `--color-border` は visible card / form / input 境界専用で、構造化リストには **常に `divide-divider`**（`--color-divider: oklch(0.92 0.005 60)` — NYTimes / Medium / Kinfolk Journal 標準値準拠の warm hairline）。外枠 `border-y` は editorial flow を分断するため不採用、リスト全体は親 `SectionWrapper` の padding で囲む（→ `tailwind-patterns/theme-tokens/semantic-tokens.md` §editorial hairline divider）
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
