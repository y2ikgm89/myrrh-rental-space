---
paths:
  - src/**
  - prisma/**
---

# Gotchas

プロジェクト固有の落とし穴と対処法。

## Admin Gate

- **`admin-login-gate.ts` に `server-only` / `serverEnv` 依存禁止** — seed.ts・CLI スクリプト（`scripts/generate-login-url.ts`）から import するため。`process.env` を直接参照する
- **Admin Gate トークン生成の鶏と卵** — 管理画面APIでトークン生成するには既にログインが必要。初回は `bun prisma/seed.ts --admin`（自動URL出力）または `bun scripts/generate-login-url.ts` で生成
- **proxy.ts の `/admin/login` ガードを削除しない** — Admin Gate が無効化されると管理画面ログインページが公開される。修正時は gate cookie / session / token の3条件を維持すること

## 料金フォーマット

- **`formatPrice` / `formatCurrency` は `@/shared/lib/pricing/format` が唯一の定義** — `utils.ts`・`price-format.ts` 等にローカル定義禁止。`formatPriceWithTax` / `formatUnitPriceWithTax` で税表示モード対応
- **確定済み金額（予約レコード）には `formatPrice` を使う** — 予約確定時の税率で計算済みのため `formatPriceWithTax` で再計算しない
- **公開ページの料金表示は `useFormatPrice` フック経由** — `TaxSettingsProvider`（layout.tsx）から税設定を取得。`toLocaleString()` での直接表示禁止

## Import Alias

- **内部モジュールの `import { X as Y }` 禁止** — 名前衝突は namespace import（`import * as settingsCommands from "..."`）で解決。`settingsCommands.updateTaxSettings()` のように呼び出す
- **許容される alias**: 第三者ライブラリの primitive リネームのみ（`Command as CommandPrimitive`、`Toaster as SonnerToaster`）
- **パススルーラッパー関数禁止** — 何も追加しない `async function X() { return XQuery(); }` は削除。直接 import して使う
- **barrel export の不要な型リネーム禁止** — `export type { FooInput as Foo }` は消費者がいない場合は削除。元の名前でそのまま export する

## shadcn/ui コンポーネント

- **`import * as React from "react"` 禁止** — shadcn/ui 再生成時に混入する。`import type { ComponentProps } from "react"` 等の個別 import に変換。`React.ComponentProps` → `ComponentProps`、`React.HTMLAttributes` → `HTMLAttributes`

## Route Handler（PPR 環境）

- **Route Handler の catch ブロックに `unstable_rethrow(error)` 必須** — PPR (`cacheComponents: true`) 環境では Route Handler GET のプリレンダリング時に `request.headers` アクセスで bail out エラーがスローされる。catch で握り潰すと `logError` が ERROR 出力しビルドログにノイズ。`unstable_rethrow(error)` を catch 先頭に配置して Next.js 内部エラーを再スロー

- **`export const dynamic = 'force-dynamic'` は PPR 環境で使用不可** — `cacheComponents: true` と Route Segment Config は非互換（ビルドエラー）。公式: 「全ページがデフォルトで動的のため不要」

## Stripe 決済

- **Webhook の署名ヘッダー存在チェックを DB 読み取りの前に配置** — `stripe-signature` ヘッダーが無いリクエストを `getStripeSettings()` 等の DB アクセス・復号処理の前に 400 で弾く。偽造リクエストによる不要な DB 負荷を防止

- **Stripe `checkout.session.completed` で即座に fulfill しない** — `session.payment_status === "paid"` を必ずチェック。非同期決済（銀行振込等）は `"unpaid"` で来るため `async_payment_succeeded` を待つ。カード決済のみでも将来の決済手段追加に備える

- **Webhook べき等性ガード必須** — 処理前に現在の `paymentStatus` をチェックし、既に処理済み（PAID / REFUNDED）ならスキップ。Stripe は同じイベントを複数回配信する可能性がある

- **`payment_intent` フィールドは `string | PaymentIntent | null`** — `typeof session.payment_intent === "string"` で型安全に取得。`as` 禁止

## ドメイン・予約

- **予約アクションのキャッシュ無効化は3点セット必須** — `updateTag(CACHE_TAGS.RESERVATIONS)` + `updateTag(getCacheTag.reservations.detail(id))` + `updateTag(getCacheTag.reservations.calendar())`。ステータス変更・削除・顧客キャンセル/変更すべてに適用。顧客統計（`totalReservations` 等）が変わる操作は `updateTag(CACHE_TAGS.CUSTOMERS)` + `updateTag(getCacheTag.customers.detail(customerId))` も追加
- **顧客統計が変わる操作は `customers.detail(customerId)` も必須** — 予約作成・キャンセル・変更時に `updateTag(CACHE_TAGS.CUSTOMERS)` だけでなく `updateTag(getCacheTag.customers.detail(customerId))` も追加。マイページ・公開フォームの両方で必要（管理画面の顧客詳細キャッシュ用）
- **`CACHE_TAGS.SETTINGS` は廃止済み** — 粒度タグ（`LAYOUT_SETTINGS`, `BUSINESS_SETTINGS`, `SEO_SETTINGS`, `ORGANIZATION_SETTINGS`, `NOTIFICATION_SETTINGS`, `INTEGRATION_SETTINGS`, `COOKIE_CONSENT`, `ANALYTICS_CONFIG`, `ROBOTS_TXT`, `PERMALINK`, `SOCIAL_LINKS`, `SIDEBAR_SETTINGS`）を直接使用。設定コマンドの `afterSuccess` では影響するドメインのタグのみ無効化する
- **マイページ Server Actions には `formSubmitRateLimiter` を使用** — `publicQueryRateLimiter` は認証不要の公開クエリ専用。マイページの mutation/query アクションは認証済みのため `formSubmitRateLimiter` を使う

- **予約削除時のクーポン使用数デクリメント必須** — `deleteReservationCommand` は `$transaction` 内で reservation 削除 + `coupon.updateMany({ where: { id, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } })`。キャンセル（`cancelCustomerReservation`）と同じパターン

- **予約ステータス遷移は `RESERVATION_STATUS_TRANSITIONS`（`helpers.ts`）で一元管理** — UI Select / ドメイン commands 両方で参照。ローカルに遷移マップを定義しない

- **予約ステータスのアクティブ判定は `ACTIVE_RESERVATION_STATUSES`（`enums/helpers.ts`）を使用** — `new Set(["PENDING", "CONFIRMED"])` のローカル定義禁止

- **カレンダー inbound 同期は `ACTIVE_RESERVATION_STATUSES` で判定** — `reservation.status !== "CANCELLED"` のようなハードコード条件禁止。`ACTIVE_RESERVATION_STATUSES.includes(status)` を使い、終端ステータス（COMPLETED, NO_SHOW）への不正遷移を防ぐ

- **Inquiry ↔ Customer 紐づけ: 3段解決** — `createInquiryCommand` が `customerId`（明示） > メール一致 > null で解決。公開フォーム（`submitInquiry`）はログイン時に `getSession()` → `getCustomerByUserId()` で自動紐づけ

- **予約スペース選択: `<div role="radio">` + 内部 `<button>`** — カード全体をクリッカブルにしつつ内部に「詳細を見る」ボタンを配置。`<button>` 内 `<button>` のネスト禁止（HTML 仕様違反）。Booking.com 方式の Dialog でギャラリー・設備・料金表示

- **公開フォーム autoComplete 属性** — `family-name` / `given-name` / `email` / `organization` を適切に設定。未設定はブラウザ自動入力が機能しない

- **コミットメッセージ**: `<type>(<scope>): <subject>`

- **SC 内の `Date.getHours()` / `getDate()` 等はローカルタイム依存** — Cloud Run は UTC 環境。JST の日付・時刻文字列が必要な場合は `Intl.DateTimeFormat` + `timeZone: "Asia/Tokyo"` を使用。`toISOString()` は UTC のため `input[type="date"]` の初期値には不適切
- **Client Component の catch ブロックで `logError` は使えない（server-only）** — `getErrorMessage(error)` + `console.error` でログを残す。空 catch（エラー握り潰し）は禁止
- **ソフトデリート追加時は全クエリの `select` に `deletedAt: true` を追加** — 型定義に `deletedAt` を加えても、Prisma の `select` に含めないと型不一致エラー。list/detail/calendar/stats の全クエリを更新すること
- **ソフトデリートモデルの全 `findUnique`/`findFirst`/`findMany`/`update` に `where: { deletedAt: null }` 必須** — `restoreReservationCommand` のみ例外（削除済みを復元する関数）。`update` の `where` も対象（削除済み予約への返金操作等を防止）。新規クエリ追加時・レビュー時に必ず確認
- **JSON フィールドのインラインパース禁止** — `Array.isArray(x) ? x.filter(...) : []` のようなインラインフィルタは禁止。`parseStringArray(x)` / `parseBusinessHours(x)` / `parseBusinessAttributes(x)`（`json-validators.ts`）を使用。admin-queries と public-queries の両方で統一すること
- **`exactOptionalPropertyTypes` で pricing 関数の `null` と `undefined` を混同しない** — `calculateReservationPrice` の `spaceDiscount` は `SpaceDiscountSettings | null`。`undefined` を渡すと型エラー
- **`proxy.ts` のレート制限は Server Actions をカバーしない** — Server Actions はページURLへのPOST（`/contact` 等）で、proxy の `/api` 判定をバイパスする。公開フォーム送信には `checkActionRateLimit(formSubmitRateLimiter)` を Server Action 冒頭で呼ぶ。`getClientIpFromHeaders()` で `headers()` 経由のIP取得

## 公開フォーム UI 統一

- **フォームフィールド間隔は `space-y-6` または `Stack gap="lg"`（gap-6 = 24px）に統一** — `space-y-4` / `Stack gap="md"` は禁止。ContactForm・ProfileForm・認証フォーム全てで統一済み
- **サーバーエラー表示は `<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">` に統一** — 素の `<p className="text-sm text-destructive">` は a11y 不足（`role="alert"` 欠落）かつ視認性不足
- **管理画面ページタイトルは `text-2xl font-bold tracking-tight text-foreground` に統一** — ログインページのモバイル表示含む。`text-xl font-semibold` は禁止
- **公開 Badge と管理 Badge の variant 型は異なる** — 公開 `"default"|"success"|"warning"|"info"`、管理 shadcn/ui `"secondary"|"outline"|"destructive"` 等。共有 `enums/helpers.ts` の `*_BADGE_VARIANTS` は管理用。公開ページでは `Record<Enum, BadgeVariant>` をコンポーネント内に定義する

## 公開ページ レスポンシブ標準

- **`grid-cols-2` には必ず `grid-cols-1 sm:grid-cols-2` を使う** — 375px未満でクラムドになる。名前フィールド（姓/名）、時間選択（開始/終了）等
- **ヘッダー（タイトル + Badge）は `flex-col sm:flex-row` でモバイル縦積み** — `flex justify-between` のみだとバッジが押しつぶされる
- **カード・セクションパディングは `p-4 sm:p-6`** — `p-6` 固定はモバイルで過剰。空状態は `p-6 md:p-12`
- **見出しマージンは `mb-4 md:mb-8`** — `mb-8` 固定はモバイルで過剰
- **アクションボタン群は `flex-col sm:flex-row gap-2 sm:gap-3`** — モバイルで横並びだとはみ出す
- **テキストリンクのタッチターゲットは `px-3 py-1.5` 以上** — 素の `<a>` テキストは44px未満。`rounded-md` + padding で確保
- **DB VARCHAR で管理する非 Prisma enum は `enums/helpers.ts` に `as const` 定数を定義** — `CANCELLED_BY.CUSTOMER` / `CANCELLED_BY.ADMIN` のパターン。文字列リテラル `"CUSTOMER"` の直接使用禁止

## Page-First Architecture（公開ページ）

- **公開ページの `_shared/components/layouts/` は kebab-case** — `site-header.tsx`, `site-footer.tsx` 等。PascalCase のレガシーセクションコンポーネント（`_components/*.tsx`）は `[...segments]` カスタムページ用に維持
- **旧カラートークンは `@layer compat` でエイリアス** — `--color-primary` → `var(--color-accent)` 等。レガシーセクションコンポーネントが依存。新コードでは `accent`/`foreground`/`surface` 等の新トークンを直接使用すること
- **`@layer compat` の CSS 変数は Tailwind ユーティリティに反映されない** — `--color-info-foreground` 等を `@layer compat` のみに定義しても `text-info-foreground` クラスは正しい値を参照しない。Tailwind CSS 4 のユーティリティは `@theme` ブロック内の変数のみ参照する。新しいセマンティックカラーは必ず `@theme` に定義すること（`@layer compat` はレガシーエイリアス専用）
- **`PageContent` モデルは廃止済み** — 全ページが `Page` + `Section` で管理。`getPageContent()` / `simplePageContentSchema` / `defaultXxxContent` は全て削除済み。公開ページは `getPageSectionsWithFallback(slug)` + `SectionRenderer` を使用
- **セクションタイプは kebab-case 文字列** — DB の `Section.type` は `String @db.VarChar(64)`。`"hero-parallax"` 等。`SectionType` Prisma enum は廃止済み（`section.ts` の `as const` オブジェクトとして再定義）
- **新セクションタイプ追加は `definitions/` ディレクトリ作成のみ** — `schema.ts` + `metadata.ts` + `registry.ts` への import 追加。Prisma マイグレーション不要。`/create-section-type` スキルで自動生成可能
- **AutoSectionForm は field メタデータなしのフィールドをスキップ** — `extractFieldMeta()` が `undefined` を返すフィールド（`categoryId` 等の plain Zod）は管理画面フォームに表示されない
- **新規公開ページ追加は `/create-page-content` スキル** — `DEFAULT_PAGE_SECTIONS` にエントリ追加 + `page.tsx` 作成。`PageContent` は使わない
- **アニメーションファイルは kebab-case のみ** — `scroll-reveal.tsx`, `split-text.tsx`, `magnetic-button.tsx`, `parallax-image.tsx`。旧 PascalCase re-export ラッパーは削除済み。レガシーセクションコンポーネント（`_components/*.tsx`）も kebab-case で直接 import
- **公開ページのマルチステップフォームでは視覚パターンを全ステップで統一** — `bg-surface` ラッパー・見出しスタイル・ナビゲーション配置をステップ間で揃える。フロー全体の一貫性を優先
- **Prisma `Decimal` と `createAppPrismaClient`** — アプリ標準の **`prisma`**（`src/shared/db/prisma.ts`）は **`createAppPrismaClient`** により対象モデルの金額等が **読み取り結果で `number`**。**集計**（`_sum` / `_avg`）や拡張前クライアント経由では `Number()` が必要なことがある。`as number` 禁止 → `prisma-patterns.md` の Decimal 節を参照
- **`prisma/seed.ts` と `logger`** — seed は **`@/shared/db/prisma` を import しない**（`server-only`）。 Prisma は `createAppPrismaClient(new PrismaClient({ adapter }))`。共有ドメインコードが `@/shared/lib/errors/logger` を引くと seed が落ちる → **`logger-core`** を使う（`error-handling.md` / `prisma-patterns.md`）
- **Prisma JSON フィールド（`imageUrls`, `facilities`）は `unknown` で受け取る** — `Array.isArray()` + type guard filter でランタイムパース。`as string[]` 禁止
- **`Prisma.XxxGetPayload` は `$extends` 前の型を返す** — `createAppPrismaClient` の Decimal→Number 変換が反映されない。拡張クライアントの戻り値型は `Awaited<ReturnType<typeof prisma.xxx.findMany<{ select: typeof xxxSelect }>>>[number]` パターンで取得する
- **`<button>` 内にインタラクティブ要素（`<button>`, `<a>`, `<input>`）をネスト禁止** — HTML 仕様違反。カード全体が `<button role="radio">` で内部に詳細リンクが必要な場合は `<div role="radio" tabIndex={0} onKeyDown={...}>` + 内部 `<button>` に変更する
- **Three.js / PixiJS は未使用** — 旧 `effects/` インフラ・`VisualEffectsProvider` は削除済み。`package.json` に `three` / R3F / `pixi.js` は含めない。再導入しない
- **公開ヘッダーの NavigationMenu は `@radix-ui/react-navigation-menu` を直接使用** — shadcn/ui の NavigationMenu は `@/admin/components/ui` にインストールされるが、公開ページは admin の UI を import しない。`import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"` で直接使用する
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

## Multiple Root Layouts

- **root `app/loading.tsx` を削除する場合、各 route group 内に `loading.tsx` が必要** — root `loading.tsx` は `app/layout.tsx` がなくても Suspense boundary として機能している。削除すると `(dashboard)/layout.tsx` 等の動的レイアウトで「Uncached data was accessed outside of \<Suspense\>」ビルドエラー。対処: `(admin)/admin/loading.tsx`（admin 全体）と `(admin)/admin/(auth)/loading.tsx`（認証画面）を個別に追加
- **root `not-found.tsx` は CSS import + `next/font/google` が使える（`global-error.tsx` とは異なる）** — `not-found.tsx` は Server Component のため `public.css` をインポートして Tailwind クラスを使用可能。`global-error.tsx` は `"use client"` 必須のためインラインスタイル。両者を混同しない
- **ルーティング移行後の空ディレクトリ残骸に注意** — `[slug]` → `[...segments]` 等の移行で空ディレクトリが残る。`page.tsx` がなくても Next.js のルート解決に影響する可能性がある

## Prisma Migrate

- **`prisma migrate reset` は AI エージェント保護が発動** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<ユーザーの同意メッセージ>"` 環境変数が必要。ユーザーに確認し、明示的な同意を得てから実行する
- **DB ドリフト時**: `migrate reset --force`（同意環境変数付き） → seed 再実行が標準フロー
- **マイグレーションに余分な ALTER TABLE が混入** — Prisma の内部差分検出に起因。`@default(cuid())` 等の表現変更で全テーブルの `ALTER COLUMN DROP DEFAULT` が生成されることがある。機能的に問題なし

## デプロイ

- **`/api/health` で内部インフラ状態（DB 接続状態、バージョン等）を公開しない** — Cloud Run / LB のヘルスチェックには `status` + `timestamp` のみ返す。`database: "connected"/"disconnected"` のようなフィールドは攻撃者のインフラ偵察に利用される
- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）
- **Docker / 秘密未注入のビルドは `bun run build:skip-env`**（`SKIP_ENV_VALIDATION=true`）— `DATABASE_URL` / `BETTER_AUTH_SECRET` がビルド時に無い場合。本番相当は Secret Manager でビルド時に注入し **`bun run build`**（`@t3-oss/env-nextjs` 検証を通す）
- **staging 環境にも `CRON_SECRET` を設定必須** — `proxy.ts` の cron 認証は `CRON_SECRET` が未設定の場合スキップされる。本番は起動時チェックで保護されるが、staging（Internet 公開の Cloud Run インスタンス等）は明示設定が必要

## ビルド・検証

- **ローカル barrel の tree-shaking は信頼できない** — Next.js の `optimizePackageImports` は npm パッケージのみ対象。`index.ts` で re-export すると未使用コンポーネントもバンドルに含まれる可能性がある。バンドルサイズが問題になる場合は barrel 経由ではなく直接 import する（例: `section-parsers.ts` から直接 import して Zod をクライアントバンドルから除去）
- **`global-error.tsx` は Root Layout を完全に置換する** — `<html>` `<body>` を自身で定義するため、admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可。全スタイルをインラインで記述すること（Tailwind クラス禁止）
- **`global-error.tsx` に `@/shared/lib/logger` を import しない** — Client-only バンドルで server-only 依存が混入するリスク。`console.error` を直接使用する
- **layout.tsx 内の `<Suspense fallback={null}>` で children をラップしない** — `loading.tsx` の Suspense boundary を無効化する。children は layout が直接レンダリングし、ページ遷移の loading 表示は `loading.tsx` に委ねる
- **`bun run build` は `@t3-oss/env-nextjs` の検証を有効化**（`SKIP_ENV_VALIDATION` 未設定）— ローカルで env が不足する場合は `bun run build:skip-env`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行
- **`useState` の setter 命名は `set` + state 変数名の PascalCase 必須** — `const [text, setIconText]` は `@eslint-react/use-state` warning。`const [text, setText]` に統一する
- **レンダー中の `Object.assign` 禁止** — `@eslint-react/purity` 違反。`CSSProperties` 構築等で `Object.assign(target, source)` を使うとミュータブル操作とみなされる。`let styles = { ...base, ...conditional }` のスプレッドパターンを使用
- **レンダー中の `new Date()` は避ける** — `@eslint-react/purity`。シリアライズ済み日付（ISO 文字列）を `input[type="date"]` に載せる場合は `dateInputValueFromSerialized()`（`@/shared/lib/serialize`）で文字列のみ正規化する。当日の `min` など「マウント時点で固定したい値」は `useState(() => { ... new Date() ... })` の遅延初期化で一度だけ評価する
- **Turbopack チャンク重複は既知の制限** — Lexical core (275KB×3)、Prism.js (168KB×2) 等が admin 内の異なるルートグループ向けに独立チャンクとして生成される（合計 808KB 無駄）。Webpack の `splitChunks` / `cacheGroups` 相当機能が未成熟なため。`next build --webpack` でフォールバック可能だが、Turbopack の高速ビルドを失う。Next.js パッチ（PR #78194, #78199）で段階的改善中。各ページの First Load JS には影響しない（ディスク上の重複のみ）
- **Turbopack ビルドはルート別 JS サイズを表示しない** — `bun run build` 出力の「Total client JS」は全チャンク合計。1ルートの First Load JS は `.next/server/app/<route>.html` 内の `<script>` 参照チャンクを合計して計算する
- **Turbopack が `¥`（U+00A5）を JSX 属性内でエスケープシーケンスと誤認識** — `placeholder="¥1,000"` 等はビルドエラー（`Invalid unicode escape`）。モジュールレベル定数に `"\u00A51,000"` で定義し `placeholder={CONST}` で参照する
- **Turbopack HMR がコンポーネント変更を反映しない場合がある** — Playwright MCP で確認する際に古いレンダリングが残る。`?_t=N` パラメータ付きナビゲーションでも解消しない場合は dev サーバー再起動（`bun dev`）が必要
- **dnd-kit `CSS.Transform.toString()` はスケールを含む** — ドラッグ開始時に微妙なサイズ変化でレイアウトシフトが起きる。`translate3d(${x}px, ${y}px, 0)` のみ使用。また動的なマージン（`ml-8`）で幅が変わる場合は `paddingLeft` で代替する
- **`server-only` の間接依存チェーンに注意** — `safe-fetch.ts` 等の共有ユーティリティが `./logger`（`server-only`）を import すると、テストで `mock.module("server-only")` が効かない場合がある。`server-only` なしの `logger-core` を直接 import する。対象: `safe-fetch.ts`, `cron-auth.ts` 等のテスト対象モジュール
- **`bun run test` はディレクトリ別分離実行** — `bun test` 一括実行では `mock.module` のグローバル干渉で unit テストと integration テストが相互汚染する。`package.json` の `test` スクリプトは `bun test __tests__/unit/lib && bun test __tests__/unit/api && ... && bun test __tests__/integration` の形式。一括実行（`bun test`）は避ける
- **副作用なし純粋モジュールの `mock.module` 禁止** — `@/shared/lib/constants`（CACHE_TAGS/getCacheTag）と `@/shared/lib/route-responses` は DB 依存も `server-only` 依存もない純粋関数ファイル。`mock.module` すると不完全なモックがグローバル干渉して他テストを壊す。実モジュールをそのまま使用
- **新規テストディレクトリ追加時は `package.json` の `test` スクリプトにバッチ追加必須** — `bun test __tests__/unit/domain` のような親ディレクトリ指定は `mock.module` 干渉を起こす。`bun test __tests__/unit/domain/<subdomain>` のようにサブディレクトリ単位で分離実行する
- **テスト内で `mock.calls[0]?.[0] as Record<string, unknown>` パターン禁止** — `noUncheckedIndexedAccess` + `as` 禁止に違反。`expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({...}))` を使用

## ファイル操作・Git

- **`rm -rf` は deny ルール** — 追跡ファイルは `git rm -r <path>`、未追跡ファイルは `python3 -c "import shutil; shutil.rmtree('path')"` で削除（Windows は `py -3 -c "..."`）
- **PostToolUse フック後は再 Read が必要** — Edit/Write 後に Prettier/ESLint フックがファイルを変更する。続けて同ファイルを Edit する場合は事前に再 Read しないと "file modified since read" エラー
- **`git add` 後はコミット前に `git status` 再確認** — Prettier PostToolUse フックが `git add` で他のステージング済みファイルも変更することがある（` M` に変わる）
- **選択的コミット** — 多数のファイルがステージ済みの状態で特定ファイルのみコミットするには `git restore --staged . && git add <target-files>` で再ステージする

## Claude Code 設定

- **`revise-claude-md` はセッション終了直前に呼ぶ** — CLAUDE.md はプロジェクトレベルのプロンプトキャッシュ層。セッション中に変更するとそれ以降のターンのキャッシュがすべて破壊される
- **スキルは必ず Skill ツールで呼ぶ（Task ツール不可）** — `plugin:name` や `ns:name` 形式のスキルも同様。Task ツールの `subagent_type` に指定すると `Agent type not found` エラー。CLAUDE.md スキルテーブルで `（Task）` 注釈のないものは全て Skill ツール呼び出し
- **MCP ツールはセッション開始前に確定させる** — セッション途中で `.mcp.json` を変更したり MCP サーバーを追加・削除するとツール定義のプレフィックスが変わりキャッシュが破壊される
- **新規 hook スクリプトは `bash` 明示呼び出し** — MINGW64 で `chmod` が Bash deny されるため、`settings.json` の `command` は `bash "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh"` 形式で記述する
- **hook スクリプトの `grep` + `pipefail` 罠** — `set -euo pipefail` 下で `var=$(cmd | grep pattern | head -1)` は grep 不一致（exit 1）でスクリプトが無音終了・stderr なし。根本解決: `if ! cmd | grep -qE 'pattern'; then exit 0; fi`（`if` 条件式内は `set -e` 対象外が Bash 仕様）

## Worktree

- **worktree で Prisma 生成ファイルが欠落** — `generated/` は worktree に自動コピーされない。`bun run type-check` で "cannot find module" エラーが出る場合は `robocopy generated .worktrees/<branch>/generated /E /XF nul` で手動コピー（`/XF nul` で Windows `nul` デバイスファイルを除外）
- **スキーマ変更 worktree を main にマージ後は `bun run db:generate` 必須** — `prisma migrate dev` を worktree 内で実行しても main の `generated/` は更新されない。マージ後に main で `bun run db:generate` を実行しないと型エラーが発生する（例: `Module has no exported member 'XxxEnum'`）
- **worktree ブランチを main にローカルマージする際の注意（main に未コミット変更がある場合）**:
  1. `git stash -u` で untracked ファイルも含めてスタッシュ（`git stash` のみでは untracked が残りマージを阻む）
  2. `git stash pop` コンフリクト後 → 解決して `git add` → `git stash drop`（エントリは自動保持されたまま）
  3. worktree ディレクトリを削除済みでもブランチ参照が残る → `git worktree prune` → `git branch -d`
- **ESLint が `.worktrees/` 内ファイルを lint 対象にする** — `eslint.config.mjs` の `globalIgnores` に `.worktrees/**` 追加済み。worktree ディレクトリ名を変えた場合はパターン更新が必要
- **Windows で worktree 削除時の PermissionError** — bun/node プロセス起動中は native binary（`@tailwindcss/oxide-win32-x64-msvc.node` 等）がロックされる。`cmd /c rd /s /q ".worktrees/<name>"` で大部分は削除できるが binary は残る。git 参照だけなら `git worktree prune` + `git branch -d` で十分。完全削除は全プロセス終了後に `powershell.exe -Command "Remove-Item -Recurse -Force '...'"` で実施

## フレームワーク固有

- **`revalidateTag` は Next.js 16 で 2 引数必須** — `revalidateTag(tag: string, profile: string | CacheLifeConfig)`。第 2 引数 `profile` は省略不可（旧 Next.js 14/15 との破壊的変更）。`CACHE_LIFE.*` 定数を渡すのが正しい用法。監査・レビュー時に「余分な引数」と誤識別しないこと
- **`updateTag` は 1 引数** — `updateTag(tag: string)` は `revalidateTag` とは異なり第 2 引数なし。混同しない
- **`global-error.tsx` に `next/font/google` 使用不可** — admin.css/public.css をインポートしないため、変数モードのフォント CSS が preload されるが未使用警告になる。`<body style={{ fontFamily: '...' }}>` でシステムフォントを直接指定する
- **時刻依存の設定トグルに `CACHE_LIFE.STATIC_SETTINGS` 禁止** — メンテナンスモード等、即時反映が必要な設定は `cacheLife(CACHE_LIFE.DYNAMIC_DATA)` を使う（`STATIC_SETTINGS` は 'days' 単位のため切り替えが即時反映されない）
- **管理画面ページに `connection()` 禁止** — `connection()` は公開ページ（`src/app/(public)/`）専用の PPR 動的 opt-in。管理画面（`src/app/(admin)/`）では使用しない。`new Date()` が必要なコンポーネントは Client Component にする
- **`generateViewport` は `"use cache"` クエリと組み合わせる** — `viewport` の static export から `generateViewport()` async 関数に変更すると動的レンダリングを引き起こすが、内部クエリが `"use cache"` ならキャッシュから読み取る。layout.tsx が既に動的（`getHeaderSettings` 等）なら影響なし
- **`'use cache'` 関数に Zod スキーマ・関数・クラスインスタンスを引数で渡せない** — React シリアライゼーション制約。`Cannot access X on the server. You cannot dot into a temporary client reference` エラー。DB フェッチのみをキャッシュ関数に閉じ、バリデーション等は外で行う
- **`$generateHtmlFromNodes` は Route Handler で動作しない** — `@lexical/html` は `document.createElement` 等を要求。Route Handler (Node.js) には DOM がないため 500 エラー。プレビューはクライアント側 `renderEditorStateJsonToHtmlClient` で生成。Server Actions の `renderEditorStateToHtmlLazy` は動作する
- **`serverExternalPackages: ["better-auth"]` は Turbopack 開発サーバーで 500** — 公式は推奨するが Turbopack の resolveAlias と競合する。`transpilePackages: ["better-auth"]` + `turbopack.resolveAlias` で代替
- **アイコンライブラリは `@tabler/icons-react`** — lucide-react から完全移行済み。全アイコンは `Icon` プレフィックス + PascalCase（例: `IconPlus`, `IconBrandGoogle`）。型は `TablerIcon`（旧 `LucideIcon`）。ブランドアイコン（LINE, Google, Stripe 等）も Tabler に統合済み
- **RHF 7.72 で `Control<T>` が invariant** — 異なるフォーム型で共有するコンポーネントの公式パターンは存在しない。Pure Component（RHF 非依存の値+callback props）+ Connected ラッパー（`as Path<T>` で型ブリッジ）が最善。`as Control<any>` / `as never` 禁止。参照実装: `LayoutFields.tsx` + `LayoutFieldsConnected`
- **`exactOptionalPropertyTypes` で optional prop に `T | undefined` を渡せない** — `prop?: string` に `string | undefined` を渡すとエラー。コンポーネント props では `prop: string | undefined`（required + union）で宣言する。`prop?: string` は「省略可能だが渡すなら `string`」の意味
- **認証・プライベートページには `robots: { index: false, follow: false }` 必須** — `/login`, `/forgot-password`, `/reset-password`, `/mypage/*` 等。layout.tsx に設定すれば全サブページに継承。未設定だとクロールバジェット浪費＋低品質ページ評価リスク
