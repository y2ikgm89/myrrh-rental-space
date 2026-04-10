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
- **proxy.ts の `/admin/login` ガードを削除しない** — Admin Gate が無効化されると管理画面ログインページが公開される。修正時は gate cookie / token の2条件を維持すること。セッション cookie の存在だけでは通過させない（CUSTOMER ロールのセッションでもログインフォームが露出するため）
- **`verifyAdminSession` は非管理者ロールを `/` にリダイレクト** — `/admin/login` ではなく `/` にリダイレクトする。`/admin/login` にリダイレクトすると Admin Gate で 404 になるか、gate cookie があれば無限リダイレクトループが発生する
- **`DASHBOARD_ROLES`（`@/shared/lib/admin-auth`）がダッシュボードアクセス可能なロールの Single Source of Truth** — `verifyAdminSession`・ログインページで共有。ロール追加時はこの定数のみ更新

## 料金フォーマット

- **`formatPrice` / `formatCurrency` は `@/shared/lib/pricing/format` が唯一の定義** — `utils.ts`・`price-format.ts` 等にローカル定義禁止。`formatPriceWithTax` / `formatUnitPriceWithTax` で税表示モード対応
- **確定済み金額（予約レコード）には `formatPrice` を使う** — 予約確定時の税率で計算済みのため `formatPriceWithTax` で再計算しない
- **公開ページの料金表示は `useFormatPrice` フック経由** — `TaxSettingsProvider`（layout.tsx）から税設定を取得。`toLocaleString()` での直接表示禁止

## Import Alias

- **内部モジュールの `import { X as Y }` 禁止** — 名前衝突は namespace import（`import * as settingsCommands from "..."`）で解決。`settingsCommands.updateTaxSettings()` のように呼び出す
- **許容される alias**: 第三者ライブラリの primitive リネームのみ（`Command as CommandPrimitive`、`Toaster as SonnerToaster`）
- **パススルーラッパー関数禁止** — 何も追加しない `async function X() { return XQuery(); }` は削除。直接 import して使う
- **barrel export の不要な型リネーム禁止** — `export type { FooInput as Foo }` は消費者がいない場合は削除。元の名前でそのまま export する
- **`utils.ts` は非推奨 re-export barrel** — FormData ヘルパーは `@/shared/lib/form-data`、`generateSlug` は `@/shared/lib/slug` が正本。`utils.ts` に新規 import・新関数追加禁止。`cn` は `@/shared/lib/cn`、日付フォーマットは `@/shared/lib/date-format`、`withRetry` は `@/shared/lib/action-helpers`

## shadcn/ui コンポーネント

- **`import * as React from "react"` 禁止** — shadcn/ui 再生成時に混入する。`import type { ComponentProps } from "react"` 等の個別 import に変換。`React.ComponentProps` → `ComponentProps`、`React.HTMLAttributes` → `HTMLAttributes`
- **`<SelectItem value="">` 禁止** — Radix UI Select は空文字列をプレースホルダー表示用に予約しており、`value=""` はランタイムエラー。nullable 選択にはセンチネル値パターンを使用: `const NONE_VALUE = "__none__"` → `<SelectItem value={NONE_VALUE}>なし</SelectItem>` → `onValueChange` で `value === NONE_VALUE ? null : value` にマップ

## Route Handler（PPR 環境）

- **Route Handler の catch ブロックに `unstable_rethrow(error)` 必須** — PPR (`cacheComponents: true`) 環境では Route Handler GET のプリレンダリング時に `request.headers` アクセスで bail out エラーがスローされる。catch で握り潰すと `logError` が ERROR 出力しビルドログにノイズ。`unstable_rethrow(error)` を catch 先頭に配置して Next.js 内部エラーを再スロー

- **`export const dynamic = 'force-dynamic'` は PPR 環境で使用不可** — `cacheComponents: true` と Route Segment Config は非互換（ビルドエラー）。公式: 「全ページがデフォルトで動的のため不要」

## Stripe 決済

- **Webhook の署名ヘッダー存在チェックを DB 読み取りの前に配置** — `stripe-signature` ヘッダーが無いリクエストを `getStripeSettings()` 等の DB アクセス・復号処理の前に 400 で弾く。偽造リクエストによる不要な DB 負荷を防止

- **Stripe `checkout.session.completed` で即座に fulfill しない** — `session.payment_status === "paid"` を必ずチェック。非同期決済（銀行振込等）は `"unpaid"` で来るため `async_payment_succeeded` を待つ。カード決済のみでも将来の決済手段追加に備える

- **Webhook べき等性ガード必須** — 処理前に現在の `paymentStatus` をチェックし、既に処理済み（PAID / REFUNDED）ならスキップ。Stripe は同じイベントを複数回配信する可能性がある

- **`payment_intent` フィールドは `string | PaymentIntent | null`** — `typeof session.payment_intent === "string"` で型安全に取得。`as` 禁止

## ドメイン・予約

- **`fireAndForget` は `@/shared/lib/async-utils`** — `@/shared/lib/errors/server` からは export されない。Server Actions の `afterSuccess` 内でメール送信・通知生成・カレンダー同期等の非クリティカル副作用に使用。第2引数は `{ operation, category }` で logError 用コンテキスト
- **公開フォーム成功時の管理通知必須** — 予約・お問い合わせ・レビュー・イベント申込の成功パスに `fireAndForget(createNotificationCommand({ type: NOTIFICATION_TYPE.*, ... }))` + `updateTag(CACHE_TAGS.NOTIFICATIONS)` が必要。顧客セルフキャンセル（マイページ）も含む
- **`exactOptionalPropertyTypes` で Prisma create の optional フィールドに `input.field` を直接渡せない** — `field?: string` に `string | undefined` は非互換。条件スプレッド `...(input.field !== undefined && { field: input.field })` を使用。`notifications/commands.ts` パターン参照
- **`resolveOrCreateCustomer` で既存顧客のデータを変更禁止** — 既存 Customer（リンク済み・未リンク問わず）の名前・電話・companyName を上書きしない。ゲスト予約では customerId のみ返す。ログイン済み予約では `userId` のみ設定（Shopify 型保護パターン）。名前変更はアカウント登録後のプロフィール編集 or 管理画面で行う
- **`ensureCustomerLinked` で別ユーザーにリンク済みの Customer を乗っ取らない** — `byEmail.userId` が既に別ユーザーに設定されている場合は新規 Customer を作成する。同一メールの Customer が2つ存在しうるが、管理画面でのマージで対応
- **予約の guest フィールドと Customer プロフィールは独立** — `guestLastName`/`guestFirstName`/`guestPhone`/`guestCompanyName` は予約時の入力スナップショット。`buildPayload`（メール・カレンダー同期）は `customer` テーブルの現在値を使用。CSV エクスポートには guest フィールドを含めること（「予約時氏名」「予約時電話」列）
- **Prisma update の `null` と `undefined` の違いに注意** — `null` は DB カラムを NULL に設定、`undefined` はフィールド更新をスキップ。`value || null` は `undefined || null = null` で意図しない NULL 上書きを引き起こす。既存値を保持したい場合はフィールドを data に含めない（[Prisma 公式](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/null-and-undefined)）
- **Server Action の薄い wrapper にも認証チェック必須** — `searchCustomersAction` のように domain query を re-export するだけの Server Action でも `checkAdminAuth()` を呼ぶ。Server Action は endpoint として外部から呼び出せるため、layout の認証ガードに依存しない
- **予約フォームはプロフィール未完了でも表示する** — ログイン済み顧客のプロフィールが未完了でもフォームをブロックしない（業界標準: インライン収集）。仮名（`CUSTOMER_PLACEHOLDER_NAME`）はプリフィルから除外し空文字にする。`isCustomerProfileComplete()` はマイページのダッシュボード表示にのみ使用
- **予約フォームの `?spaceId=` 事前選択** — スペース詳細の「予約する」ボタンは `/reservation?spaceId={id}` にリンク。`reservation/page.tsx` が locations 内の存在を検証し `initialSpaceId` として渡す。`resolveAutoIds` が locationId を逆引きし、既存の `skipStep1` でステップ2から開始。不正な spaceId は無視してフォールバック
- **`executeAdminMutationResult` で `afterSuccess` にデータを渡すには `execute` 戻り値を使用** — `let data = null` を外部クロージャに定義して `execute` 内で代入するパターン禁止（脆弱）。`execute` の戻り値型を適切に定義し `afterSuccess: (data) => { ... }` で受け取る
- **`invalidateEventCaches` に slug 引数を省略しない** — `publishEvent`/`cancelEvent` 等で slug を渡さないと `getCacheTag.events.slug(slug)` が無効化されず公開ページに古いデータが残る。`execute` 内で `getEventById` から slug を取得して渡す
- **予約アクションのキャッシュ無効化は3点セット必須** — `updateTag(CACHE_TAGS.RESERVATIONS)` + `updateTag(getCacheTag.reservations.detail(id))` + `updateTag(getCacheTag.reservations.calendar())`。ステータス変更・削除・顧客キャンセル/変更すべてに適用。顧客統計（`totalReservations` 等）が変わる操作は `updateTag(CACHE_TAGS.CUSTOMERS)` + `updateTag(getCacheTag.customers.detail(customerId))` も追加
- **顧客統計が変わる操作は `customers.detail(customerId)` も必須** — 予約作成・キャンセル・変更時に `updateTag(CACHE_TAGS.CUSTOMERS)` だけでなく `updateTag(getCacheTag.customers.detail(customerId))` も追加。マイページ・公開フォームの両方で必要（管理画面の顧客詳細キャッシュ用）
- **`CACHE_TAGS.SETTINGS` は廃止済み** — 粒度タグ（`LAYOUT_SETTINGS`, `BUSINESS_SETTINGS`, `SEO_SETTINGS`, `ORGANIZATION_SETTINGS`, `NOTIFICATION_SETTINGS`, `INTEGRATION_SETTINGS`, `COOKIE_CONSENT`, `ANALYTICS_CONFIG`, `ROBOTS_TXT`, `PERMALINK`, `SOCIAL_LINKS`, `SIDEBAR_SETTINGS`）を直接使用。設定コマンドの `afterSuccess` では影響するドメインのタグのみ無効化する
- **マイページ Server Actions には `formSubmitRateLimiter` を使用** — `publicQueryRateLimiter` は認証不要の公開クエリ専用。マイページの mutation/query アクションは認証済みのため `formSubmitRateLimiter` を使う

- **予約削除時のクーポン使用数デクリメント必須** — `deleteReservationCommand` は `$transaction` 内で reservation 削除 + `coupon.updateMany({ where: { id, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } })`。キャンセル（`cancelCustomerReservation`）と同じパターン

- **予約ステータス遷移は `RESERVATION_STATUS_TRANSITIONS`（`helpers.ts`）で一元管理** — UI Select / ドメイン commands 両方で参照。ローカルに遷移マップを定義しない

- **`RESERVATION_STATUS_LABELS` に `string` キーで直接アクセス禁止** — `Record<ReservationStatus, string>` のため TS7053。`isValidReservationStatus(status)` で narrowing してからアクセスするか、公開 Badge 用に `Record<string, BadgeVariant>` のローカルマッピングを定義

- **予約ステータスのアクティブ判定は `ACTIVE_RESERVATION_STATUSES`（`enums/helpers.ts`）を使用** — `new Set(["PENDING", "CONFIRMED"])` のローカル定義禁止

- **カレンダー inbound 同期は `ACTIVE_RESERVATION_STATUSES` で判定** — `reservation.status !== "CANCELLED"` のようなハードコード条件禁止。`ACTIVE_RESERVATION_STATUSES.includes(status)` を使い、終端ステータス（COMPLETED, NO_SHOW）への不正遷移を防ぐ

- **Inquiry ↔ Customer 紐づけ: 3段解決** — `createInquiryCommand` が `customerId`（明示） > メール一致 > null で解決。公開フォーム（`submitInquiry`）はログイン時に `getSession()` → `getCustomerByUserId()` で自動紐づけ

- **`customer-queries.ts` の select は admin 側と同期必須** — 管理者が返信（`replyMessage`/`repliedAt`）等の新機能を追加した場合、`admin-queries` だけでなく `customer-queries` の select も更新する。一覧用（`LIST_SELECT`）と詳細用（`DETAIL_SELECT`）を分離し、詳細に必要なフィールドを漏らさない。マイページ UI コンポーネントの props 型も同期すること

- **予約スペース選択: `<div role="radio">` + 内部 `<button>`** — カード全体をクリッカブルにしつつ内部に「詳細を見る」ボタンを配置。`<button>` 内 `<button>` のネスト禁止（HTML 仕様違反）。Booking.com 方式の Dialog でギャラリー・設備・料金表示

- **公開フォーム autoComplete 属性** — `family-name` / `given-name` / `email` / `organization` を適切に設定。未設定はブラウザ自動入力が機能しない

- **コミットメッセージ**: `<type>(<scope>): <subject>`

- **SC 内の `Date.getHours()` / `getDate()` 等はローカルタイム依存** — Cloud Run は UTC 環境。JST の日付・時刻文字列が必要な場合は `Intl.DateTimeFormat` + `timeZone: "Asia/Tokyo"` を使用。`toISOString()` は UTC のため `input[type="date"]` の初期値には不適切
- **Cron の「翌日」「当日」計算は JST 基準** — `new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0)` は UTC の翌日。JST の翌日を求めるには `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })` で "YYYY-MM-DD" を取得し `new Date(\`${str}T00:00:00+09:00\`)`で UTC 変換。実装例:`src/app/api/cron/reservation-reminder/route.ts`
- **Client Component の catch ブロックで `logError` は使えない（server-only）** — `getErrorMessage(error)` + `console.error` でログを残す。空 catch（エラー握り潰し）は禁止
- **ソフトデリート追加時は全クエリの `select` に `deletedAt: true` を追加** — 型定義に `deletedAt` を加えても、Prisma の `select` に含めないと型不一致エラー。list/detail/calendar/stats の全クエリを更新すること
- **ソフトデリートモデルの全 `findUnique`/`findFirst`/`findMany`/`update` に `where: { deletedAt: null }` 必須** — `restoreReservationCommand` のみ例外（削除済みを復元する関数）。`update` の `where` も対象（削除済み予約への返金操作等を防止）。新規クエリ追加時・レビュー時に必ず確認
- **リレーション経由クエリの親ソフトデリートガード必須** — 子モデル（EventRegistration 等）が `deletedAt` を持たなくても、親モデル（Event）が持つ場合は `where: { eventId, event: { deletedAt: null } }` で親のソフトデリートをフィルタ。CSV エクスポート・集計クエリで特に漏れやすい
- **JSON フィールドのインラインパース禁止** — `Array.isArray(x) ? x.filter(...) : []` のようなインラインフィルタは禁止。`parseStringArray(x)` / `parseBusinessHours(x)` / `parseBusinessAttributes(x)`（`json-validators.ts`）を使用。admin-queries と public-queries の両方で統一すること
- **`exactOptionalPropertyTypes` で pricing 関数の `null` と `undefined` を混同しない** — `calculateReservationPrice` の `spaceDiscount` は `SpaceDiscountSettings | null`。`undefined` を渡すと型エラー
- **`proxy.ts` のレート制限は Server Actions をカバーしない** — Server Actions はページURLへのPOST（`/contact` 等）で、proxy の `/api` 判定をバイパスする。公開フォーム送信には `checkActionRateLimit(formSubmitRateLimiter)` を Server Action 冒頭で呼ぶ。`getClientIpFromHeaders()` で `headers()` 経由のIP取得
- **規約の予約時必須/フッター表示は `Terms.requiredAtReservation` / `Terms.showInFooter` で管理** — Settings テーブルに規約関連フラグ（`termsAgreementEnabled` 等）を追加しない。Terms モデルが規約設定の Single Source of Truth
- **Settings フィールド削除は7箇所同時更新** — ① `schema.prisma` ② `domain/settings/types.ts` ③ `domain/settings/commands.ts` ④ `domain/settings/admin-queries.ts`（select 句） ⑤ `actions/settings/schemas/*.ts`（Zod + フォーム用） ⑥ `actions/settings/other.ts` or `index.ts` ⑦ `settings/_components/sections/*.tsx`（UI）。テスト・seed も確認

## 公開フォーム UI 統一

- **フォームフィールド間隔は `space-y-6` または `Stack gap="lg"`（gap-6 = 24px）に統一** — `space-y-4` / `Stack gap="md"` は禁止。ContactForm・ProfileForm・認証フォーム全てで統一済み
- **サーバーエラー表示は `<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">` に統一** — 素の `<p className="text-sm text-destructive">` は a11y 不足（`role="alert"` 欠落）かつ視認性不足
- **管理画面ページタイトルは `text-2xl font-bold tracking-tight text-foreground` に統一** — ログインページのモバイル表示含む。`text-xl font-semibold` は禁止
- **OGP/SNS シェアプレビューは `max-w-lg` で制約** — `aspect-[1200/630]` が親幅に追従するため、制約なしだとプレビューが巨大になる。`max-w-lg`（512px）を外側ラッパーに適用。`PageSeoForm.tsx` で設定
- **公開 Badge と管理 Badge の variant 型は異なる** — 公開 `"default"|"success"|"warning"|"info"`、管理 shadcn/ui `"secondary"|"outline"|"destructive"` 等。共有 `enums/helpers.ts` の `*_BADGE_VARIANTS` は管理用。公開ページでは `Record<Enum, BadgeVariant>` をコンポーネント内に定義する
- **RHF `defaultValues` は Zod スキーマの全フィールドを宣言必須** — 省略すると `useWatch` の初期値が `undefined` になり条件分岐が壊れる。`z.literal(true)` フィールド（`agreeToTerms` 等）は `defaultValues` に含めない（型が `true` のため `false` を渡せない）

## 公開ページ レスポンシブ標準

- **公開カレンダーの曜日色は日=`text-destructive`、土=`text-info`** — 日本標準のカレンダー配色。日曜始まり。今日マーカーは `bg-accent text-accent-foreground rounded-full`。曜日ヘッダーは `bg-surface` + 枠線
- **日本語ラベルのタブ/ナビに `uppercase` 禁止** — `uppercase` は Latin 専用。日本語タブは Journal タブパターン（`text-sm tracking-[0.18em]`、uppercase なし）に合わせる。ヘッダーナビ（`text-[0.75rem] uppercase`）は英語ラベル向け
- **空状態の CTA は `Button variant="editorial" size="sm"` を使用** — テキストリンクは余白の中で埋もれる。メッセージテキストは `text-muted-foreground`（base サイズ）、ボタンは `space-y-4` で配置
- **カードグリッドは Container Queries を使う** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`。viewport breakpoints (`md:grid-cols-2`) ではなくコンテナ幅に応じて適応。SpaceGrid, PostGrid, RelatedSpaces, TestimonialSection, FeaturesSection で採用済み
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
- **ホームページセクション見出しは日英併記** — 英語 uppercase ラベル（`text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground`）+ 日本語見出し（`font-heading text-[clamp(1.5rem,2.5vw,2rem)] font-light`）。英語のみの見出しは禁止。HowItWorks / Spaces / Features / CTA で統一済み
- **`exactOptionalPropertyTypes` 下で Next.js `Link` に optional `onClick` を渡す場合は条件スプレッド** — `onClick={props.onClick}` は `(() => void) | undefined` が `MouseEventHandler` と非互換。`{...(props.onClick && { onClick: props.onClick })}` を使用

- **`<header>` に `role="banner"`、`<footer>` に `role="contentinfo"` を明示** — HTML5 暗黙 role は一部 AT で認識されない。公開ページ `site-header.tsx` / `site-footer.tsx` で設定済み
- **モバイルメニュー閉じ後はトリガー要素にフォーカス復帰** — `closeMenu` の `onComplete` コールバックで `hamburgerRef.current?.focus()` を呼ぶ。WCAG 2.1 AA §2.4.3（フォーカス順序）準拠

## GSAP アニメーション

- **`gsap.from(el, { opacity: 0 })` 禁止 — `gsap.fromTo` を使用** — `gsap.from` は要素に `opacity: 0` をインラインセットするため、GSAP が発火しない場合（SSR、reduced-motion、ScrollTrigger 未到達）にコンテンツが不可視のまま。`gsap.fromTo(el, { opacity: 0 }, { opacity: 1 })` なら CSS デフォルト `opacity: 1` が保持され、GSAP がクライアントで上書きする
- **`ScrollReveal` ラッパー内のカードに `border-b last:border-b-0` 禁止** — `ScrollReveal` の `<div>` が `:last-child` を壊し、全カードで最後の線が消える。親要素に `divide-y divide-border` を使用して区切り線を管理する。実装例: `events/_components/event-list-view.tsx`
- **テキストの DOM 分割（SplitText 風）は禁止** — テキストを `<span class="inline-block">` に分割すると日本語テキストが縦折れし、SSR↔Client の hydration mismatch が発生する。SplitText はコンテナ全体の fade-up のみ行い、個別文字/単語の DOM 分割はしない
- **Cormorant Garamond の letter-spacing は負値または 0 にする** — 正の letter-spacing（0.06em 等）は Latin テキスト向けだが、CSS は日本語フォールバック（Noto Sans JP）にも同じ値を適用するため、日本語見出しが横に広がり折れる。`-0.01em` 以下を使用
- **`font-heading` (Cormorant Garamond) で数字+漢字の混合テキスト禁止** — 年月表示（`2026年4月`）等で数字と漢字のベースラインがずれる。sans (`font-sans` / デフォルト) を使用し、`tracking-wide` で可読性を確保。`font-heading` は英語見出し・日付の数字単体（EventCard の日番号等）に限定
- **`useGSAP` 外の GSAP アニメーションには `useEffect` cleanup 必須** — イベントハンドラで `gsap.fromTo`/`gsap.to` を直接呼ぶ場合、`useEffect` の cleanup で `gsap.killTweensOf(element)` を呼ぶ。ref をクリーンアップ関数内で使う場合はローカル変数にキャプチャする（`exhaustive-deps` 警告回避）

## Lexical WYSIWYG

- **admin.css の `--font-serif` は Lexical WYSIWYG 用** — エディタ内の h1/h2 を公開ページと同じ Cormorant Garamond で表示するため。admin layout.tsx で Cormorant Garamond をロード、`theme.ts` の h1/h2 に `font-heading` 適用。管理 UI（サイドバー、フォーム等）は `--font-sans` のまま
- **Lexical エディタのコンテンツ領域は `bg-card`（白）** — `bg-background`（`oklch(0.98 ...)` 微グレー）ではなく `bg-card`（`oklch(1 0 0)` 白）を使用。文書編集エリアは紙のメタファーで白背景が適切。`LexicalEditor.tsx` の外枠 div で設定
- **Lexical ツールバーはエディタ+インスペクターの全幅に配置（Gutenberg パターン）** — ツールバーを `section` の外に出し、外枠 `div.flex-col` の直下に配置。コンテンツ+インスペクターは `div.flex.flex-1` で横並び。ツールバーがインスペクター開閉時にかぶらない。`LexicalEditor.tsx` で実装
- **`tryConvertHtmlStringToLexicalJsonString` は SSR で使用不可** — `DOMParser` が Node.js に存在しない。Server Component / Server Action から呼ぶと `Attempted to call client function from the server` エラー。`useState` 遅延初期化で呼ぶ場合も `typeof window === "undefined"` ガードが必須（SSR でも実行されるため）

## Page-First Architecture（公開ページ）

- **`SpaceCard` の `imageUrls` prop は optional** — 未指定または1枚のみの場合は `ImageFrame` で単一画像表示。2枚以上で `ImageCarousel`（ホバー左右ナビ + モバイルスワイプ + ドット）が有効化。消費者（`RelatedSpaces`, `SpaceShowcaseSection`, `SpaceGrid`）は全て対応済み
- **`ImageCarousel` は `next/image` 直接使用の許容例外** — per-image の `opacity` + `aria-hidden` 制御が必要で `ImageFrame` では対応不可。単一画像は `ImageFrame` を使用
- **`SectionWrapper` と `Section` Primitive を混同しない** — `SectionWrapper`（`sections/SectionWrapper.tsx`）は管理画面 SectionDesign JSON → CSS 変換（padding/background/maxWidth を DB から動的制御）。`Section` Primitive（`design-system/section.tsx`）は静的ページレイアウト用。SectionWrapper を Section に置き換えると管理画面のデザイン制御が効かなくなる
- **一覧ページの trailing sections から同種セクション除外必須** — `/spaces` に SpaceGrid がある場合 `space-list` を、`/events` に自作カレンダーがある場合 `event-calendar` を `trailingSections` フィルタで除外。除外しないとページ独自 UI とセクションシステムの同種コンテンツが重複描画される
- **ページ固有 CTA（SiteCTA）を持つページは `cta` セクションも除外** — `/faq`（SiteCTA でお問い合わせ誘導）、`/contact`（フォーム自体が CTA）では DB の `cta` セクションが重複。`trailingSections` フィルタに `s.type !== "cta"` を追加
- **レガシーセクション（`_components/*.tsx`）も Editorial Magazine 準拠必須** — SectionRenderer 経由で描画されるため見落としやすい。`rounded-lg`/`shadow`/`hover:text-accent`/`tracking-wide`/`font-medium` on serif が残りやすい。新規 Primitives 整備後も個別修正が必要
- **hero 直下の一覧セクションは上余白を縮小** — `py-[var(--spacing-section)]`（112-176px）は hero 後に過剰。`pt-10 pb-[var(--spacing-section)] md:pt-14` で上余白のみ 40-56px に抑える。適用済み: `/spaces`, `/journal`, `/faq`。記事詳細・ホームページセクションは独立コンテンツのためフル余白維持
- **`public-queries.ts` の全関数に `'use cache'` + `safeFetch` + `toPlainObject` 必須** — `settings/public-queries.ts` で欠落していた前例あり。新規 public-queries 作成時は `'use cache'` + `cacheTag` + `cacheLife` を忘れずに
- **同種の公開 UI コンポーネント重複禁止** — 新規作成前に `_shared/components/ui/` を確認。`FilterBar`（nuqs + useTransition + Editorial スタイル）が唯一のカテゴリフィルタ
- **`_shared/components/` は kebab-case 必須、`_components/` レガシーセクションは PascalCase 維持** — `SectionWrapper.tsx`/`SectionLabel.tsx` はレガシー用の固有コンポーネントで PascalCase 維持。それ以外の `_shared/` 配下は全て kebab-case
- **`@layer compat` と旧カラートークンは削除済み** — `--color-primary` / `--color-brand-primary` 等の旧トークンは存在しない。全コンポーネントが `@theme` のセマンティックトークン（`accent`/`foreground`/`surface` 等）を直接使用
- **公開ページの `hover:text-accent` は原則禁止** — `hover:text-foreground` に統一（Editorial Magazine トーン）。accent はラベル・価格・CTA テキストの静的表示のみに使用
- **`tracking` は `tracking-[0.18em]` を標準値とする** — SectionLabel, ナビリンク, MagneticButton, ScrollIndicator 等で統一。`tracking-[0.2em]` / `tracking-[0.3em]` は旧値
- **Button primary の bronze shimmer アニメーション廃止** — `hover:bg-accent/90 hover:shadow-md` のシンプルな遷移に変更。`hover:animate-[bronze-shimmer]` / `hover:bg-[image:linear-gradient(...)]` は使用しない
- **ImageFrame の hover は `opacity-85`（`scale-105` 廃止）** — Editorial Magazine の控えめなインタラクション。全公開ページ画像で統一。`image-gallery.tsx` の Lightbox 用サムネイルも同様
- **SC children を CC 内でタブ切替する場合は CSS `hidden` を使用** — CC 内で SC を条件レンダリング（三項演算子）すると SC が再評価される。page.tsx から両ビューを props で渡し、`className={activeView !== "x" ? "hidden" : undefined}` で DOM を保持したまま表示切替。実装例: `events/_components/events-view-switcher.tsx`
- **公開詳細ページは `PageLayout variant="content"` + `PageHero variant="compact"` + `Section` を使用** — `events/[slug]`, `terms/[slug]`, `spaces/[slug]` で統一。手動 `<section>` + `<>...</>` ラッパーは禁止。hero/cta は `PageLayout` の props に渡す
- **`/news` `/posts` 一覧ページは `/journal` に統合済み** — 詳細ページ（`/news/[slug]`、`/posts/[...segments]`）は維持。パンくずリンクは `/journal?tab=news` / `/journal?tab=posts`
- **`PageContent` モデルは廃止済み** — 全ページが `Page` + `Section` で管理。`getPageContent()` / `simplePageContentSchema` / `defaultXxxContent` は全て削除済み。公開ページは `getPageSectionsWithFallback(slug)` + `SectionRenderer` を使用
- **セクションタイプは kebab-case 文字列** — DB の `Section.type` は `String @db.VarChar(64)`。`"hero-parallax"` 等。`SectionType` Prisma enum は廃止済み（`section.ts` の `as const` オブジェクトとして再定義）
- **新セクションタイプ追加は `definitions/` ディレクトリ作成のみ** — `schema.ts` + `metadata.ts` + `registry.ts` への import 追加。Prisma マイグレーション不要。`/create-section-type` スキルで自動生成可能
- **AutoSectionForm は field メタデータなしのフィールドをスキップ** — `extractFieldMeta()` が `undefined` を返すフィールド（`categoryId` 等の plain Zod）は管理画面フォームに表示されない
- **AutoSectionForm のフィールドに `defaultValue` + `setValue` パターン禁止** — Radix Switch/Select、native `<input type="color">` は `defaultValue` が静的で UI が追従しない。`useController` で RHF 制御に統一する。参照: `AutoBooleanField`、`AutoSelectField`、`AutoColorFieldControlled`
- **新規公開ページ追加は `/create-page-content` スキル** — `DEFAULT_PAGE_SECTIONS` にエントリ追加 + `page.tsx` 作成。`PageContent` は使わない
- **ホームページセクションの `pageId: null` は廃止済み** — 全セクション（ホームページ含む）が Page レコードの `pageId` に紐づく。`pageId: null` でホームページ判定するコードは禁止。ホームページは slug `"home"` の Page レコードで管理
- **`/admin/pages/homepage/edit` は廃止済み** — ホームページ編集は `/admin/pages/home/edit`（`[slug]/edit` に統合）。`HomepageSectionCommand` 系コマンドも廃止、page-scoped コマンドに統一
- **`DesignPanel` は ToggleGroup + Accordion で全面書き換え済み** — `pages/[slug]/edit/_components/DesignPanel.tsx`。生 radio ボタンは全廃。4カテゴリ（余白/背景/テキスト/レイアウト）を Accordion で整理
- **ページ編集の SEO はページレベルタブ「ページ設定」にある** — `SectionMasterDetail.tsx` の `Tabs [セクション | ページ設定]`。旧 `SEO_SELECTION_ID` / サイドバー SEO リンクは削除済み。SEO 関連機能を追加する場合は「ページ設定」タブ内に配置する
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
- **動的 layout を持つサブルートに `loading.tsx` 必須** — `mypage/layout.tsx`（認証チェーン）や `(dashboard)/layout.tsx` 配下のサブルートには個別の `loading.tsx` を追加。親の `loading.tsx` だけではページ固有のデータ取得待ちと認証待ちが同じスケルトンに合流する
- **マイページ開発確認は dev login ボタンを使用** — `/login` ページに `NODE_ENV !== "production"` でのみ表示される「テスト顧客でログイン」ボタンあり（`dev-login-action.ts`）。Better Auth の `signUpEmail`/`signInEmail` で `dev-customer@example.com` セッションを作成し、`ensureCustomerLinked` が Customer を自動生成

## Prisma Migrate

- **`prisma migrate reset` は AI エージェント保護が発動** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<ユーザーの同意メッセージ>"` 環境変数が必要。ユーザーに確認し、明示的な同意を得てから実行する
- **DB ドリフト時**: `migrate reset --force`（同意環境変数付き） → seed 再実行が標準フロー
- **マイグレーションに余分な ALTER TABLE が混入** — Prisma の内部差分検出に起因。`@default(cuid())` 等の表現変更で全テーブルの `ALTER COLUMN DROP DEFAULT` が生成されることがある。機能的に問題なし
- **`cuid()` の VarChar 長は 30 以上** — `@default(cuid())` は 24-30 文字を生成。`@db.VarChar(21)` では切り詰めエラー。新規モデルは `@db.VarChar(30)` を使用。既存モデル（Reservation 等）は `@db.Uuid` のため影響なし
- **`prisma migrate diff` の `--from-schema-datasource` は Prisma 7 で削除済み** — `--from-config-datasource` を使用。非対話環境でのマイグレーション手順: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > migration.sql` → `prisma db execute --file migration.sql` → `prisma migrate resolve --applied <name>`

## Cron / Webhook

- **Cron の排他実行には `pg_try_advisory_lock` を使用** — Cloud Run 複数インスタンスで同時実行されるとトランザクション競合が発生する。`pg_try_advisory_lock(固定ID)` で非ブロッキングロック取得 → 失敗時は `{ skipped: true }` で即時リターン。`finally` で `pg_advisory_unlock` 必須。実装例: `src/app/api/cron/calendar-sync/route.ts`
- **`deleteAccountAction` は削除前に customerId 取得 + 全関連タグ無効化必須** — `auth.api.deleteUser()` は Cascade で Customer/Reservation/Review を削除するため、削除後は customerId を取得不可。削除前に `getCustomerByUserId` で取得し、削除後に `CUSTOMERS`/`RESERVATIONS`/`REVIEWS`/`INQUIRIES`/`EVENTS` + `customers.detail(id)` を全て無効化

## デプロイ

- **`/api/health` で内部インフラ状態（DB 接続状態、バージョン等）を公開しない** — Cloud Run / LB のヘルスチェックには `status` + `timestamp` のみ返す。`database: "connected"/"disconnected"` のようなフィールドは攻撃者のインフラ偵察に利用される
- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）
- **Docker / 秘密未注入のビルドは `bun run build:skip-env`**（`SKIP_ENV_VALIDATION=true`）— `DATABASE_URL` / `BETTER_AUTH_SECRET` がビルド時に無い場合。本番相当は Secret Manager でビルド時に注入し **`bun run build`**（`@t3-oss/env-nextjs` 検証を通す）
- **staging 環境にも `CRON_SECRET` を設定必須** — `proxy.ts` の cron 認証は `CRON_SECRET` が未設定の場合スキップされる。本番は起動時チェックで保護されるが、staging（Internet 公開の Cloud Run インスタンス等）は明示設定が必要

## ビルド・検証

- **`useRef` 変数名は `Ref` サフィックス必須** — `@eslint-react/naming-convention-ref-name` が `useRef` の戻り値に `ref` または `*Ref` 命名を要求。`touchStartX` → `touchStartXRef`
- **Radix `TabsContent` は `Tabs` コンテキスト外で使用不可** — コンポーネントを create/edit モードで共有する場合、`TabsContent` ラップは呼び出し側で行い、中身のフィールドコンポーネントは `Tabs` に依存しない設計にする。`TermsSettingsFields` が実装例
- **ローカル barrel の tree-shaking は信頼できない** — Next.js の `optimizePackageImports` は npm パッケージのみ対象。`index.ts` で re-export すると未使用コンポーネントもバンドルに含まれる可能性がある。バンドルサイズが問題になる場合は barrel 経由ではなく直接 import する（例: `section-parsers.ts` から直接 import して Zod をクライアントバンドルから除去）
- **Turbopack `"use server"` barrel re-export はクライアントから解決できない** — `"use server"` ファイルの関数を `index.ts`（barrel）経由で re-export し、`"use client"` コンポーネントから import すると `Export doesn't exist in target module` ビルドエラー。クライアントコンポーネントからは `@/admin/actions/post/mutations` のようにサブモジュールを直接 import する。Server Component / Server Action 間の barrel re-export は問題ない
- **`global-error.tsx` は Root Layout を完全に置換する** — `<html>` `<body>` を自身で定義するため、admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可。全スタイルをインラインで記述すること（Tailwind クラス禁止）
- **`global-error.tsx` に `@/shared/lib/logger` を import しない** — Client-only バンドルで server-only 依存が混入するリスク。`console.error` を直接使用する
- **layout.tsx 内の `<Suspense fallback={null}>` で children をラップしない** — `loading.tsx` の Suspense boundary を無効化する。children は layout が直接レンダリングし、ページ遷移の loading 表示は `loading.tsx` に委ねる
- **`bun run build` は `@t3-oss/env-nextjs` の検証を有効化**（`SKIP_ENV_VALIDATION` 未設定）— ローカルで env が不足する場合は `bun run build:skip-env`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行
- **`useState` の setter 命名は `set` + state 変数名の PascalCase 必須** — `const [text, setIconText]` は `@eslint-react/use-state` warning。`const [text, setText]` に統一する
- **レンダー中の `Object.assign` 禁止** — `@eslint-react/purity` 違反。`CSSProperties` 構築等で `Object.assign(target, source)` を使うとミュータブル操作とみなされる。`let styles = { ...base, ...conditional }` のスプレッドパターンを使用
- **レンダー中の `new Date()` は避ける** — `@eslint-react/purity`。シリアライズ済み日付（ISO 文字列）を `input[type="date"]` に載せる場合は `dateInputValueFromSerialized()`（`@/shared/lib/serialize`）で文字列のみ正規化する。当日の `min` など「マウント時点で固定したい値」は `useState(() => { ... new Date() ... })` の遅延初期化で一度だけ評価する
- **`useEffect` 内の同期 `setState` は `set-state-in-effect` 警告** — 親 prop の変更を `useEffect(() => { setX(prop) }, [prop])` で同期するパターンは ESLint 警告。代替: ①開くタイミング（イベントハンドラ）で prop を直接セット ② `key` prop でコンポーネントをリマウント ③ `useState` の初期値に prop を渡す（変更追従不要の場合）
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
- **`Edit` ツールの `replace_all` は部分一致に注意** — `isJumping` → `isJumpingRef` の rename で `replace_all` を使うと、既存の `isJumpingRef` が `isJumpingRefRef` に二重変換される。rename 対象が別の識別子の部分文字列になる場合は `replace_all` を避け、個別の `old_string` で置換する
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
- **管理画面 Suspense 内 async SC には `connection()` 必須** — PPR では Suspense 境界ごとに動的判定される。layout の `headers()` は子の Suspense 境界に伝播しない。`new Date()` や uncached データを使う async Server Component には `await connection()` を先頭に配置（[公式推奨](https://nextjs.org/docs/app/api-reference/functions/connection)）。page.tsx 本体には不要
- **`generateViewport` は `"use cache"` クエリと組み合わせる** — `viewport` の static export から `generateViewport()` async 関数に変更すると動的レンダリングを引き起こすが、内部クエリが `"use cache"` ならキャッシュから読み取る。layout.tsx が既に動的（`getHeaderSettings` 等）なら影響なし
- **`'use cache'` 関数に Zod スキーマ・関数・クラスインスタンスを引数で渡せない** — React シリアライゼーション制約。`Cannot access X on the server. You cannot dot into a temporary client reference` エラー。DB フェッチのみをキャッシュ関数に閉じ、バリデーション等は外で行う
- **`$generateHtmlFromNodes` は Route Handler で動作しない** — `@lexical/html` は `document.createElement` 等を要求。Route Handler (Node.js) には DOM がないため 500 エラー。プレビューはクライアント側 `renderEditorStateJsonToHtmlClient` で生成。Server Actions の `renderEditorStateToHtmlLazy` は動作する
- **`serverExternalPackages: ["better-auth"]` は Turbopack 開発サーバーで 500** — 公式は推奨するが Turbopack の resolveAlias と競合する。`transpilePackages: ["better-auth"]` + `turbopack.resolveAlias` で代替
- **アイコンライブラリは `@tabler/icons-react`** — lucide-react から完全移行済み。全アイコンは `Icon` プレフィックス + PascalCase（例: `IconPlus`, `IconBrandGoogle`）。型は `TablerIcon`（旧 `LucideIcon`）。ブランドアイコン（LINE, Google, Stripe 等）も Tabler に統合済み
- **RHF 7.72 で `Control<T>` が invariant** — 異なるフォーム型で共有するコンポーネントの公式パターンは存在しない。Pure Component（RHF 非依存の値+callback props）+ Connected ラッパー（`as Path<T>` で型ブリッジ）が最善。`as Control<any>` / `as never` 禁止。参照実装: `LayoutFields.tsx` + `LayoutFieldsConnected`
- **`exactOptionalPropertyTypes` で optional prop に `T | undefined` を渡せない** — `prop?: string` に `string | undefined` を渡すとエラー。コンポーネント props では `prop: string | undefined`（required + union）で宣言する。`prop?: string` は「省略可能だが渡すなら `string`」の意味
- **認証・プライベートページには `robots: { index: false, follow: false }` 必須** — `/login`, `/forgot-password`, `/reset-password`, `/mypage/*` 等。layout.tsx に設定すれば全サブページに継承。未設定だとクロールバジェット浪費＋低品質ページ評価リスク

## CSV Export（API Route）

- **空結果で 404/エラーを返さない** — `generateCsv` はヘッダーのみの空 CSV を正常に返す。0件は正常状態
- **ステータスラベルは `enums/helpers.ts` の `*_STATUS_LABELS` を使用** — Route にローカル定義禁止。`status-badges.tsx` の Badge ラベルも `helpers.ts` を正本とする
- **ファイル名は `resource-yyyyMMdd.csv`** — イベントタイトル等のユーザー入力値をファイル名に含めない（エンコーディング問題回避）
- **新しい Prisma enum のステータスラベルは `enums/helpers.ts` に `*_STATUS_LABELS` を追加必須** — Badge config と CSV Export Route の両方から参照される Single Source of Truth。追加済み: `RESERVATION_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, `EVENT_STATUS_LABELS`

## セキュリティ

- **API Route の処理順序: 認証 → バリデーション → ビジネスロジック** — バリデーションを認証前に実行すると未認証者にパラメータ名・型情報が漏洩する。`checkPermission` を最初に呼ぶ
- **`proxy.ts` のヘッダー名は `x-pathname`** — `x-next-pathname` ではない。`headers().get()` で参照する側が不一致だと常に `""` が返りリダイレクトロジックが壊れる
- **`next.config.ts` に seed/開発専用ドメインを残さない** — `placehold.co` 等の開発用 `remotePatterns` / CSP `img-src` は本番で不要。`dangerouslyAllowSVG` も seed 画像のためだけに有効化しない
- **監査ログの provider 判定は全 OAuth プロバイダーを列挙** — `ctx.path.includes("social")` だけでは LINE が "google" として記録される。`/line` → `"line"`、`/google` → `"google"` と個別判定する
- **新しい iframe 埋め込みサービス追加時は `proxy.ts` の `frame-src` 更新必須** — Google Maps（`https://www.google.com`）、YouTube、Stripe 等。未登録だと `Refused to frame` エラーでサイレントにブロックされる
- **Google Maps Embed API は `https://www.google.com/maps/embed/v1/` を使用** — 非公式パラメータ（`pb=`, `output=embed`）禁止。API key は `getDecryptedGoogleMapsApiKey()` で復号。Maps Embed API は無料（使用量無制限）
- **Instagram 画像は `*.cdninstagram.com` と `*.fbcdn.net` の両方が必要** — Meta は CDN ドメインを使い分ける。`proxy.ts` の `img-src` と `next.config.ts` の `remotePatterns` の両方に追加すること
- **`revalidateTag` 先のキャッシュが存在するか確認必須** — cron で `revalidateTag(CACHE_TAGS.X, ...)` を呼んでも、対応するクエリに `'use cache'` + `cacheTag(CACHE_TAGS.X)` がなければ無効化対象が存在しない。新規 cron 追加時は公開クエリ側のキャッシュ設定を必ず確認

## Editorial デザイン

- **editorial ボタンは全箇所 `Button variant="editorial"` で統一** — raw `<Link>` + インラインスタイルで editorial ボタンを実装しない。`button.tsx` の editorial variant（シャープエッジ + bronze hover）が Single Source of Truth。site-header / cta-section / site-cta すべてで Button コンポーネントを使用
- **公開ページで `bg-foreground`（ダーク反転セクション）禁止** — Editorial Magazine（Kinfolk/Cereal）は全コンテンツセクション白背景が基本。ダーク全幅セクションは Accent 10% 制約を超え、トーンが崩れる。SiteCTA は `bg-background` + `border-t border-border`（余白で分離）
- **`editorial-border-accent` CSS クラスは Divider 専用** — `width: 4rem` を持つ短い装飾線。`Section border="accent"` 等の全幅要素に使うとレイアウトが 4rem 幅に潰れる。Section の accent border は `border-t-2 border-accent`（Tailwind ユーティリティ）を使用
- **Button editorial に色反転 override を書かない** — ダーク背景用の `className="border-background text-background hover:bg-background hover:text-accent"` は Button の variant 設計を迂回するハック。背景を `bg-background`（白）にし、editorial variant をそのまま使う

- **`section-design.ts` の値配列変更時は DesignPanel + 型ガードも同期必須** — `DesignPanel.tsx` の `backgroundOptions`/`paddingOptions`/`maxWidthOptions` + Set-based 型ガード（`isBgValue` 等）が `sectionBgValues`/`sectionSpacingValues`/`sectionMaxWidthValues` と 1:1 対応

## ナビゲーション

- **ヘッダーナビは DB（`NavigationItem` テーブル）が正、`FALLBACK_NAV` はフォールバック** — ナビ変更は seed.ts + DB 両方を更新。コードだけ変えても DB にレコードがあればそちらが使われる
- **CTA ボタンと同じ URL をナビリンクに含めない** — `site-header.tsx` が `/reservation` をフィルタ除外済み。新しい CTA 導線を追加する場合も同パターンで重複を防ぐ
- **seed の `navigationItem` は "create if not exists"** — 既存レコードの削除・更新はしない。ナビ項目を削除するには DB 直接操作または管理画面が必要

## ホームページ Section 管理

- **seed 再実行時のホームページセクション重複** — seed は既存セクションを削除せず追加する。旧型（`hero-parallax`, `concept` 等）と新型（`homepage-*`）が重複し、管理画面に二重表示される。seed 後に旧型を手動削除するか、seed スクリプトに既存セクション削除ロジックを追加すること
- **`homepage-*` セクション型はホームページ専用** — 他ページの `hero`/`cta`/`features` 等は標準セクション型（SectionRenderer 描画）。`homepage-*` に置き換えない
- **ホームページは DB 未登録でも表示される** — `page.tsx` が `homepage-*` セクションをフィルタし、0件なら editorial コンポーネントの defaultProps で直接レンダリング
- **公開ページのセクション高さは `svh` 単位を使用** — `vh` は iOS Safari のアドレスバー問題がある。`min-h-[*svh]` を使用し、`h-[*vh]` は禁止。`height` ではなく `min-height` でコンテンツ溢れを防ぐ（WCAG 1.4.4 準拠）。例外: error/loading/not-found の中央寄せ用 `min-h-[60vh]`、ダイアログの `max-h-[85vh]`、`min-h-screen`（ページ全体）
- **ヒーロー高さはセマンティックプリセット + カスタム** — `sm/md/lg/full/custom` の5段階。custom 時は `heightCustom` (svh 数値) をインラインスタイルで適用。ユーザーに px/vh を直接入力させない（Squarespace/Payload CMS 方式）
- **ホームページ Spaces セクションは SC + CC 分離** — `spaces-section.tsx`（Server Component: ヘッダー+CTA）が `spaces-carousel.tsx`（Client Component: Center Stage Carousel）を呼び出す。中央カード z-30/scale 1、隣 z-20/scale 0.9 の重なりカードスタック。51回繰り返しで無限スクロール。detail パネル（カテゴリ→名前→料金→広さ/定員→説明→View Details）+ ドットインジケーター。モバイルはタッチスワイプ、デスクトップは矢印ナビ + ホバーオーバーレイ

## ブログサ���ドバー

- **`sidebarWidgets` JSON は順序付き配列** — `[{ type: "search", enabled: true }, ...]` 形式。旧 object 形式（`{ search: true, ... }`）は `parseSidebarWidgets()` がデフォルト配列にフォールバック
- **`BlogLayout` は Container の中に配置** — Container → BlogLayout → children の順。BlogLayout を Container の外に置くとサイドバーが全幅になる
- **サイドバー有効時に `Container variant="narrow"` 禁止** — 2カラム（メイン + 320px + gap-12）で幅不足。default Container (1280px) を使用
- **`Page.showSidebar` オーバーライド**: `null`=グローバル設定に従う、`true/false`=明示的。journal ページは Page レコードの `showSidebar` を参照、記事詳細はグローバルのみ
- **サイドバーデータ変更時は `SIDEBAR_DATA` キャッシュ無効化が必要** — Post/News の CRUD アクションの `afterSuccess` に `updateTag(CACHE_TAGS.SIDEBAR_DATA)` を追加済み。新しいコンテンツ系アクション追加時も忘れずに
- **Zod `z.union` の discriminated union narrowing は `switch` の `case` で効く** — `SidebarWidget = BuiltinWidget | CustomWidget` で `switch (widget.type) { case "custom": ... }` 内では `widget` が `CustomWidget` に narrowing される。`as CustomWidget` は不要（プロジェクト禁止ルール）

- **公開ページのアクションボタンに `rounded-full` 禁止** — Editorial Magazine はシャープエッジが基本。`Button` Primitive の primary/secondary/ghost/editorial は全てシャープ。`rounded-full` はバッジ・タグ・アイコンボタン（シェア・ギャラリーナビ）・スピナー・カルーセルドットのみ許容

## レートリミッター

- **`/api/auth/get-session` は `apiRateLimiter`（100/分）で制限** — `authMutationRateLimiter`（20/15分）に含めると、ページ遷移のたびにカウントが消費され sign-in が 429 で拒否される。`checkRateLimit()` で `get-session` を分岐済み
- **`authMutationRateLimiter` は sign-in/sign-up/sign-out 等の mutation 専用** — 旧 `authRateLimiter`（read/write 一括 10/15分）は廃止済み

## Better Auth クライアント

- **Better Auth `$Infer` は module augmentation で上書きできない** — `better-auth.d.ts` で `interface User { role: Role }` を宣言しても、`AuthInstance["$Infer"]["Session"]["user"]["role"]` は `additionalFields` の `type: "string"` から推論された `string` のまま。`Omit<Session["user"], "role"> & { role: Role }` パターン（`admin-auth.ts` / `customer-auth.ts`）が必須。`getAdminSessionUser()` / `getCustomerSessionUser()` のランタイム `isValidRole()` 検証も維持する
- **`signIn.social()` のエラーハンドリングは `fetchOptions.onError` が公式推奨** — `result.error` だけでは 429 等の HTTP エラー時に Promise がサイレントに処理され UI にフィードバックが出ない。`fetchOptions: { onError(ctx) { ctx.response.status } }` で HTTP ステータスを検査する
- **Google/LINE ソーシャルログインボタンはブランド SVG ロゴ必須** — テキストのみのボタンは UX 品質不足。Google は公式4色「G」ロゴ + 白背景、LINE は `#06C755` 背景 + 白アイコン
- **ソーシャルプロバイダーロゴは `@/public/components/ui/social-provider-logos.tsx` の共有コンポーネントを使用** — `GoogleLogo`/`LineLogo`/`PROVIDER_LOGOS` をエクスポート。ログインページ・アカウント連携の両方で使用。ローカル定義禁止
