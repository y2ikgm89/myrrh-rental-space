---
description: 実装パターン — skill 未対応の domain-specific パターン集
paths:
  - "src/shared/domain/**"
  - "src/app/(admin)/**/_shared/actions/**"
  - "src/app/(public)/**/_shared/actions/**"
  - "prisma/schema.prisma"
  - "prisma/seed.ts"
---

# 実装パターン

> skill 化済みのパターンは CLAUDE.md の skill ポインタ参照（`add-prisma-enum` / `add-settings-field` / `create-admin-page` / `create-page-content` / `create-server-action` / `lexical-node` / `lexical-plugin` / `lexical-toolbar` / `parallax-section` / `upgrade-deps` / `split-action-file` / `worktree-bootstrap`）。

## 新規モデル / Seed

- **新規 Prisma モデル追加は `schema + seed + admin-ui` の 3 点セット同時作成必須** — seed 漏れは EmptyState で実装検証不可。enum フィールドは**全値を seed に網羅**
- **Seed 関数は `upsert` で idempotent 化 + `seedAll` / `seedDemo` 両方に登録** — `deleteMany + create` は `--demo` で既存破壊（`seedEmailTemplates` 参照）
- **Terms / News / Post / Section / Space の seed は Lexical JSON 同時保存必須** — `contentHtml` 単独禁止。`buildParagraphEditorStateJson()` + `buildParagraphHtml()`（`@/shared/lib/lexical/description-defaults.ts`）
- **seed の `contentJson` は paragraph-only 近似である** — `buildParagraphEditorStateJson(stripTags(html))` パターンで生成するため、テンプレ HTML に h2/h3/list/etc が含まれていても **`contentJson` は段落のみのフラット構造**（HeadingNode が 0 個）になる。`contentJson` の AST 構造に依存する派生機能（TOC 生成・heading 抽出・search index・RSS 等）は seed データで silent に動作しなくなる。**公開ページの content 派生は `contentHtml` を canonical SSoT** とする業界標準（GitHub / Notion / WordPress / Stripe Docs / rehype-slug）パターンに従う（`@/shared/lib/html/extract-headings` の `extractHeadingsFromHtml` + `injectHeadingAnchors` が参照実装、SSR/Client 同一結果を純粋関数で保証）
- **既存モデルへの NOT NULL カラム追加時は `prisma.<model>.create` を全箇所 grep で列挙必須** — TS error が連鎖発生し 1 箇所修正 → validate → 次のエラーを N round 繰り返す silent waste。canonical: `grep -rn "prisma\.<model>\.create\|db\.<model>\.create" src/ prisma/` で先に全箇所列挙し同時 Edit。slug → 必須値マップは `resolve<Field>For<Slug>(slug)` のような SSoT helper に集約（migration の SQL UPDATE 表とコード側マップの drift 防止）。実例: 2026-05-05 Phase 1（Page.template 追加）で `commands.ts` × 3 + `system-pages-commands.ts` × 1 の 4 箇所を 4 round 連鎖発見

## 公開一覧ページの 10 点セット

`create-page-content` skill 補足:

1. `page.tsx` + `loading.tsx` + `error.tsx`
2. `generatePageMetadata(slug)` + `BreadcrumbJsonLd`
3. `getPageSectionsWithFallback(slug)`
4. trailing sections から同種 + `cta` 除外
5. `default-page-sections.ts` + `SYSTEM_PAGES`
6. seed Page レコード
7. sitemap.ts
8. NavigationItem seed
9. E2E fixtures urls
10. layout.tsx `alternates`（該当時）

## Bulk action plan の標準 file 構造

リソースごとに **5 files create**：

- `src/shared/domain/<resource>/bulk-commands.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/<resource>/bulk.ts`
- `_components/<Resource>BulkActions.tsx`
- `__tests__/unit/domain/<resource>/bulk-commands.test.ts`
- `__tests__/integration/actions/admin/<resource>-bulk.test.ts`

**1-2 files modify**: `<Resource>Table.tsx` 行 checkbox / `<Resource>TableHeader.tsx` all-select。Bundle ごとに 1 commit、3 並列 dispatch 可能。

## Bulk command 戻り値型

- **Bulk status change command の戻り値型は `{ count, newStatus, affectedIds, rejectedIds }`** — Phase 1/2 の `{ count, isActive, affectedIds }` の superset。状態遷移マップ違反は early throw せず `rejectedIds` に積み bulk 自体は valid な ID のみ処理（非破壊）

## Bulk email SSoT

- **Bulk email 関数の SSoT 参照実装** — `sendEventCancelledToAllParticipants` (`@/shared/lib/email/event-emails.ts`) が canonical: `prisma.findMany` で対象取得 → `Promise.allSettled` 並列送信 → 失敗 per-item `logError`（category: `EXTERNAL_API`, severity: `MEDIUM`）→ bulk 自体は成功扱い。idempotency key は `<event-type>/<entity-id>(/<variation>)`

## Reader 関数 / Route Handler

- **Reader 関数を `"use server"` で export しない — Route Handler `route.ts` が公式推奨**（Next.js 16 backend-for-frontend ガイド）。canonical: `checkAdminAuth` (401) / `checkPermission` (403, `request.headers` を第 3 引数で渡す) + `NextResponse.json` + `AbortSignal.timeout` + zod `safeParse` + `jsonError` / `jsonValidationError`。参照実装: `src/app/(admin)/admin/api/{ogp,notifications/unread-count}/route.ts`

## UX スケール判断

- **UX スケール判断は seed 件数ではなく CMS 運用上限で** — Location / Category / Tag 等運用者が追加できるリソースは production 想定値（数十〜100）で設計。フィルタ UI 閾値目安: pill 2〜5 / scroll 6〜15 / dropdown 16+

## Per-slug cache invalidation

- **Per-slug cache invalidation 配線は domain command 戻り値拡張駆動** — `updateXCommand` / `createXCommand` の戻り型を `{ id }` → `{ id, slug }` 拡張し、Server Action `afterSuccess(data) => updateTag(getCacheTag.X.detail(data.slug))` で per-slug + ベースタグ両方を invalidate。`MutationResult<T>` 戻り型 + test mock fixture も同一 commit で同期 cascade 必須。slug 取得のための afterSuccess 内追加 query は禁止（execute 戻り値で完結）

## Reactive form sub-card

- **Reactive form sub-card（score card / live preview）は Form 内部 Tabs で `form.control` 共有** — page.tsx に Tabs を配置 + Form / SubCard を別子要素にすると `FormProvider` 必須で複雑化。Tabs を Form component 内部に配置すれば `form.control` を直接子に渡せて `FormProvider` 不要。`forceMount` + `data-[state=inactive]:hidden` で Radix Tabs の SC children preservation も維持

## Feature toggle 粒度

- **Feature toggle 粒度** — 単一 tenant は per-entity 単一層、multi-tenant template は `Settings.xxxEnabledGlobal` + `Entity.xxxEnabled` の 2 層（precedence: Global OFF → 常に非表示 / Global ON → per-entity 効く）。参照: `Settings.reviewsEnabledGlobal` ↔ `Space.reviewsEnabled`

## Lexical 新規ノード（バリアント選択 UI）

- **Lexical 新規ノードで作成時バリアント選択 UI が必要な場合** — dialog-upfront 3 コマンド体制（`OPEN_XXX_DIALOG_COMMAND` / `INSERT_XXX_COMMAND` / `UNGROUP|TRANSFORM_XXX_COMMAND`）。全 UI 経路（Insert / FT / ⋮⋮ / keyboard）は dispatch 前に `$getSelectionBlockNodes()` のキーをスナップショットして payload に積む（ダイアログフォーカスで editor 選択が失われるため必須）。hardcoded default 値の silent 挿入禁止。参照実装: `GroupPlugin`

## UI デザイン探索

- **UI デザイン探索は `src/app/(public)/<feature>-demo/` で複数バリアント比較** — `hero-demo/` / `spaces-design-demo/` が参照実装。上部 sticky nav で variant 切替 + `max-w-[420px]` wrapper で desktop でも mobile preview 可能。`shared.ts` に variant metadata（name / tagline / description / pros / cons）を SSoT 化

## 管理画面 table 行クリック

- **管理画面 table 行クリック遷移は `ClickableTableRow`（`@/admin/components/table`）+ `stopRowClick` 経由必須** — `<tr>` への `position: relative` は CSS 仕様 undefined behavior、複数 `<td>` を単一 `<a>` で包むのが HTML 仕様禁止。第二推奨（`tabIndex={0}` + `onKeyDown(Enter)` + `aria-label`）を `ClickableTableRow` に集約済（→ `frontend/admin-ui/tables.md`）

## typedRoutes + router.push template literal

- **Next.js 16 typedRoutes + `router.push(template literal)` の library boundary cast** — `typedRoutes: true` 環境では `${string}` template literal を `Route<string>` 型に narrow できない（公式制約）。helper component（`ClickableTableRow` 等）で href を受ける場合、**公開 API は `string`、内部の `router.push` 呼び出しで `as Route<string>` cast を 1 箇所に閉じ込める**

## 「推奨で」「クリーン実装」変換セット

「推奨で」「クリーン実装」指示時の変換セット：

1. nuqs `parseAsString.withDefault` → `parseAsStringLiteral(values)` + `isValid*` 型ガード
2. 複合 `sort` → `sortBy` + `sortOrder` + `SortableColumnHeader`
3. 手動 debounce → `useDebouncedCallback`（`@/admin/hooks`）
4. Select `onValueChange` `as` → `isValid*` narrow
5. 同系統テーブルと Grep 比較

## Plan 型 contract 削減禁止

- **Plan 記載の型 contract（`select` clause / `interface` fields）は implementer 独自判断で削減しない** — JSON-LD / SEO / UI 価値に影響する重要 field（`businessHours` / `amenities` / `specialHolidays` 等の SEO data source）を plan の型から省くと後段 Task で出力欠落の cascade。implementer は型を最小化する場合 BLOCKED でも DEVIATION でもなく **controller への確認** で escalate

## handoff memory chore commit bundle

- **handoff memory の「次セッション判断ポイント」は controller 判断で plan 範囲外の追加 chore commit を bundle 化** — 前セッションが「軽量実装 → 次セッション判断」と残した課題は、新セッションで本体 Task 着手前に **Task X.5 として独立 chore commit** を bundle に挟むのが最速

## 50+ 行範囲削除

- **50+ 行・複数 describe block の範囲削除は Edit tool より Python regex.sub が信頼性高い** — Edit は old_string の正確マッチを要求。`python3 -c "import re; ...; pattern = re.compile(r'<start_marker>.*?<end_marker>', re.DOTALL); new_text, count = pattern.subn('', text); ..."` で範囲指定削除する方が安全 + 1 回で済む。判定基準: ① 削除範囲が 50 行超 ② 開始・終了の独自 marker あり ③ 単一 file 単一 block

## plan archive

- **完了済み plan / spec は `docs/superpowers/{plans,specs}/.archive/<year>/` 配下に保管** — 各 archive file 冒頭に `> **Snapshot: YYYY-MM-DD** — Implementation completed, archived as historical reference.` 追記。判定: ① plan 内 commit SHA が main で実在 ② plan の最終 task 完了済 ③ 実装が main に存在

## Section + Variant SC dispatcher パターン

既存 CC section に新 variant（catalog / archive 等）を追加する canonical 構造（Phase 4-A/B/C で 4 sections に統一適用）:

- **トップ**: SC dispatcher（async）。`mode: { kind: "simple" | "<variant>"; ... }` discriminated union prop で分岐
- **inner**: 既存 CC を `<type>-list-simple-view.tsx` 等に分離（`useGSAP` / `useFormatPrice` 等の hook を維持）
- **新 variant**: SC として SC dispatcher 内に inline 実装、または async 子 SC（`SpaceCard` 等）を含める
- **SectionRenderer**: 該当 case で `displayLayout === "<variant>"` 分岐し、必要な server fetch + `searchParams.parse` + `pageSlug` 処理を section dispatcher に渡す
- **page.tsx**: `<SectionRenderer key={section.id} section={section} searchParams={searchParams} pageSlug="<slug>" />` を統一

参照実装:

- `SpaceListSection.tsx` (catalog variant — FilterBar + SpaceGrid + Pagination 内包)
- `PostListSection.tsx` (archive variant — BlogLayout + SearchBar + PostCategoryFilter + PostGrid + Pagination 内包)
- `NewsListSection.tsx` (archive variant — SearchBar + NewsList + Pagination 内包)
- `EventCalendarSection.tsx` (calendar-list-toggle variant — EventsViewSwitcher 内包)

## Gotchas

### ドメイン・料金・予約・ホームページ

### 料金フォーマット

- **`formatPrice` / `formatCurrency` は `@/shared/lib/pricing/format` が唯一の定義** — `utils.ts`・`price-format.ts` 等にローカル定義禁止。`formatPriceWithTax` / `formatUnitPriceWithTax` で税表示モード対応
- **確定済み金額（予約レコード）には `formatPrice` を使う** — 予約確定時の税率で計算済みのため `formatPriceWithTax` で再計算しない
- **公開ページの料金表示はコンポーネント種別で SSoT 分岐** — Client Component は `useFormatPrice`（`TaxSettingsProvider`/layout.tsx 経由）、Server Component は `getPublicTaxSettings()` + `formatUnitPriceWithTax()` を直接呼ぶ（`'use cache'` でリクエスト単位 dedup されるためグリッド N 枚描画でも DB 1 回）。Client 化したいだけのために Hook を選ぶと SpaceCard 等の `"use client"` 不要なカードが Server 化できなくなる silent bug を起こす。`toLocaleString()` 直接表示は両方禁止
- **公開ページのフィルタ・選択 UI は `_shared/components/design-system/select.tsx`（ネイティブ `<select>` + Editorial border-bottom primitive）が SSoT** — 新規 Radix Select / 自作 Popover 禁止。OS-native picker（モバイル UX 最適）+ a11y/キーボード操作自動 + JS ゼロ + WCAG 2.5.5 タッチターゲット 44px を同時満足。`@/admin/components/ui/select.tsx`（Radix Select）は Swiss Industrial Admin テーマ専用で公開ページからの cross-import 禁止（admin/public 分離）。"All" sentinel は `value=""` で onChange 時に null マッピング（Material Design 3 "All" chip pattern）

### ドメイン・予約

- **Location 編集時のキャッシュ無効化** — `updateLocation` / `createLocation` の `afterSuccess` で `updateTag(CACHE_TAGS.LOCATIONS)` + `updateTag(getCacheTag.locations.detail(data.slug))` 必須。MEO フィールド更新時も同じタグで無効化（粒度を分けない）。LocalBusiness JSON-LD は `CACHE_TAGS.LOCATIONS` でタグ付けされているため、slug タグ + ベースタグの両方を無効化しないと `/access` 一覧ページのキャッシュが残る silent bug になる
- **`fireAndForget` は `@/shared/lib/async-utils`** — `@/shared/lib/errors/server` からは export されない。Server Actions の `afterSuccess` 内でメール送信・通知生成・カレンダー同期等の非クリティカル副作用に使用。第2引数は `{ operation, category }` で logError 用コンテキスト
- **公開フォーム成功時の管理通知必須** — 予約・お問い合わせ・レビュー・イベント申込の成功パスに `fireAndForget(createNotificationCommand({ type: NOTIFICATION_TYPE.*, ... }))` + `updateTag(CACHE_TAGS.NOTIFICATIONS)` が必要。顧客セルフキャンセル（マイページ）も含む
- **`exactOptionalPropertyTypes` で Prisma create の optional フィールドに `input.field` を直接渡せない** — `field?: string` に `string | undefined` は非互換。条件スプレッド `...(input.field !== undefined && { field: input.field })` を使用。`notifications/commands.ts` パターン参照
- **`resolveOrCreateCustomer` で既存顧客のデータを変更禁止** — 既存 Customer（リンク済み・未リンク問わず）の名前・電話・companyName を上書きしない。ゲスト予約では customerId のみ返す。ログイン済み予約では `userId` のみ設定（Shopify 型保護パターン）。名前変更はアカウント登録後のプロフィール編集 or 管理画面で行う
- **`ensureCustomerLinked` で別ユーザーにリンク済みの Customer を乗っ取らない** — `byEmail.userId` が既に別ユーザーに設定されている場合は新規 Customer を作成する。同一メールの Customer が2つ存在しうるが、管理画面でのマージで対応
- **予約の guest フィールドと Customer プロフィールは独立** — `guestLastName`/`guestFirstName`/`guestPhone`/`guestCompanyName` は予約時の入力スナップショット。`buildPayload`（メール・カレンダー同期）は `customer` テーブルの現在値を使用。CSV エクスポートには guest フィールドを含めること（「予約時氏名」「予約時電話」列）
- **Prisma update の `null` と `undefined` の違いに注意** — `null` は DB カラムを NULL に設定、`undefined` はフィールド更新をスキップ。`value || null` は `undefined || null = null` で意図しない NULL 上書きを引き起こす。既存値を保持したい場合はフィールドを data に含めない（[Prisma 公式](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/null-and-undefined)）
- **Server Action の薄い wrapper にも認証チェック必須** — `searchCustomersAction` のように domain query を re-export するだけの Server Action でも `checkAdminAuth()` を呼ぶ。Server Action は endpoint として外部から呼び出せるため、layout の認証ガードに依存しない
- **予約フォームはプロフィール未完了でも表示する** — ログイン済み顧客のプロフィールが未完了でもフォームをブロックしない（業界標準: インライン収集）。仮名（`CUSTOMER_PLACEHOLDER_NAME`）はプリフィルから除外し空文字にする。`isCustomerProfileComplete()` はマイページの一覧系ページ（`/mypage` / `/mypage/events` / `/mypage/inquiries`）で「お名前未登録です」警告の表示判定に使用（予約フォーム・イベント申込フォームのブロック判定には使わない）
- **予約フォームの `?spaceId=` 事前選択** — スペース詳細の「予約する」ボタンは `/reservation?spaceId={id}` にリンク。`reservation/page.tsx` が locations 内の存在を検証し `initialSpaceId` として渡す。`resolveAutoIds` が locationId を逆引きし、既存の `skipStep1` でステップ2から開始。不正な spaceId は無視してフォールバック
- **`executeAdminMutationResult` で `afterSuccess` にデータを渡すには `execute` 戻り値を使用** — `let data = null` を外部クロージャに定義して `execute` 内で代入するパターン禁止（脆弱）。`execute` の戻り値型を適切に定義し `afterSuccess: (data) => { ... }` で受け取る
- **`invalidateEventCaches` に slug 引数を省略しない** — `publishEvent`/`cancelEvent` 等で slug を渡さないと `getCacheTag.events.slug(slug)` が無効化されず公開ページに古いデータが残る。`execute` 内で `getEventById` から slug を取得して渡す
- **予約アクションのキャッシュ無効化は `invalidateReservationCaches(id, customerId, options?)` helper 経由 SSoT** — 3点セット（RESERVATIONS + detail(id) + calendar()）+ CUSTOMERS + customers.detail(customerId) + optional coupons/notifications を一括適用。ローカル `updateTag` 羅列禁止。**顧客統計連動の mutation command は customerId を戻り値に含める必須契約** — select に `customerId: true` を追加し `return { ..., customerId: reservation.customerId }` で返す（参照実装: `createCheckoutSessionCommand` / `refundReservationPaymentCommand`）。例外: notes 単独変更は顧客統計に影響しないため 3点セットのみ適用（helper 不使用で可、`updateReservationNotes` が実例）
- **顧客統計が変わる操作は `customers.detail(customerId)` も必須** — 予約作成・キャンセル・変更時に `updateTag(CACHE_TAGS.CUSTOMERS)` だけでなく `updateTag(getCacheTag.customers.detail(customerId))` も追加。マイページ・公開フォームの両方で必要（管理画面の顧客詳細キャッシュ用）
- **`CACHE_TAGS.SETTINGS` は廃止済み** — 粒度タグ（`LAYOUT_SETTINGS`, `BUSINESS_SETTINGS`, `SEO_SETTINGS`, `ORGANIZATION_SETTINGS`, `NOTIFICATION_SETTINGS`, `INTEGRATION_SETTINGS`, `COOKIE_CONSENT`, `ANALYTICS_CONFIG`, `ROBOTS_TXT`, `PERMALINK`, `SOCIAL_LINKS`, `SIDEBAR_SETTINGS`）を直接使用。設定コマンドの `afterSuccess` では影響するドメインのタグのみ無効化する
- **マイページ Server Actions には `formSubmitRateLimiter` を使用** — `publicQueryRateLimiter` は認証不要の公開クエリ専用。マイページの mutation/query アクションは認証済みのため `formSubmitRateLimiter` を使う

- **予約削除時のクーポン使用数デクリメント必須** — `deleteReservationCommand` は `$transaction` 内で reservation 削除 + `coupon.updateMany({ where: { id, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } })`。キャンセル（`cancelCustomerReservation`）と同じパターン

- **Slug 重複時の採番は deterministic incremental（`-2`, `-3`）が業界標準** — `${slug}-${crypto.randomUUID().slice(0,8)}` の random suffix より、WordPress / Ghost / Notion 互換の `${slug}-2`, `-3` 採番が URL 予測可能性が高い。実装パターン: `findFirst` で衝突確認 → 衝突時 `findMany({ slug: { startsWith: ${slug}- } })` で兄弟取得 → 正規表現で `-N` 抽出 → 最小未使用番号を採用。参照実装: `@/shared/domain/events/commands.ts` の `ensureUniqueSlug`

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

- **Server Component で `Date.now()` 直接使用は `@eslint-react/purity` / `react-hooks/purity` で error** — `await connection()` で動的スコープが確立済みでも lint は SC を区別しない。`eslint-disable-next-line` は複数行式に効かないことがある。**根本解決**: 純関数として domain helper（例: `isEventRegistrationPastDeadline()`）に抽出して呼び出す。lint ルールは Component context 内呼び出しのみ判定するため、別ファイルの helper 関数は対象外（参照実装: `@/shared/domain/events/public-queries.ts`）
- **Cron の「翌日」「当日」計算は JST 基準** — `new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0)` は UTC の翌日。JST の翌日を求めるには `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })` で "YYYY-MM-DD" を取得し `new Date(\`${str}T00:00:00+09:00\`)`で UTC 変換。実装例:`src/app/api/cron/reservation-reminder/route.ts`
- **Client Component の catch ブロックで `logError` は使えない（server-only）** — `getErrorMessage(error)` + `console.error` でログを残す。空 catch（エラー握り潰し）は禁止
- **ソフトデリート追加時は全クエリの `select` に `deletedAt: true` を追加** — 型定義に `deletedAt` を加えても、Prisma の `select` に含めないと型不一致エラー。list/detail/calendar/stats の全クエリを更新すること
- **ソフトデリートモデルの全 `findUnique`/`findFirst`/`findMany`/`update` に `where: { deletedAt: null }` 必須** — `restoreReservationCommand` のみ例外（削除済みを復元する関数）。`update` の `where` も対象（削除済み予約への返金操作等を防止）。新規クエリ追加時・レビュー時に必ず確認
- **終端状態を持つ state machine は双方向遷移ではなく SUPER_ADMIN restore action 別経路で実装** — `RESERVATION_STATUS_TRANSITIONS` に `CANCELLED → CONFIRMED` 等の逆方向を追加禁止（誤操作で重複予約・在庫衝突を誘発する silent bug）。canonical: ① 終端遷移時に AlertDialog で `「通常の管理者では戻せません」` 警告 ② `restoreXxxStatusCommand` を別 domain command で実装（conflict 検出 + cancellation fields クリア + `icsSequence` increment）③ Server Action は `executeAdminMutationResult` + `if (user.role !== Role.SUPER_ADMIN) throw new DomainError("...", "FORBIDDEN")` で role gate ④ UI は SUPER_ADMIN のみ表示。Stripe / Airbnb / Eventbrite 全社が同パターン。参照実装: `restoreReservationStatusCommand` (`@/shared/domain/reservations/lifecycle-commands`) + `RestoreReservationStatusButton` (`reservations/[id]/_components/`)
- **リレーション経由クエリの親ソフトデリートガード必須** — 子モデル（EventRegistration 等）が `deletedAt` を持たなくても、親モデル（Event）が持つ場合は `where: { eventId, event: { deletedAt: null } }` で親のソフトデリートをフィルタ。CSV エクスポート・集計クエリで特に漏れやすい
- **ドメインコマンドの mutation クエリも親ソフトデリートガード必須** — `cancelEventRegistrationCommand` 等の update 前 findFirst にも `event: { deletedAt: null }` が必要。read 系だけでなく write 系の前提クエリも対象
- **メール一括送信は `Promise.allSettled` でパラレル化** — `sendEventCancelledToAllParticipants` / `sendEventUpdatedToAllParticipants` 等の for-of + await 逐次送信は禁止。`Promise.allSettled` + 個別エラーログで並列化する
- **JSON フィールドのインラインパース禁止** — `Array.isArray(x) ? x.filter(...) : []` のようなインラインフィルタは禁止。`parseStringArray(x)` / `parseBusinessHours(x)` / `parseBusinessAttributes(x)`（`json-validators.ts`）を使用。admin-queries と public-queries の両方で統一すること
- **`exactOptionalPropertyTypes` で pricing 関数の `null` と `undefined` を混同しない** — `calculateReservationPrice` の `spaceDiscount` は `SpaceDiscountSettings | null`。`undefined` を渡すと型エラー
- **`proxy.ts` のレート制限は Server Actions をカバーしない** — Server Actions はページURLへのPOST（`/contact` 等）で、proxy の `/api` 判定をバイパスする。公開フォーム送信には `checkActionRateLimit(formSubmitRateLimiter)` を Server Action 冒頭で呼ぶ。`getClientIpFromHeaders()` で `headers()` 経由のIP取得
- **規約の予約時必須/フッター表示は `Terms.requiredAtReservation` / `Terms.showInFooter` で管理** — Settings テーブルに規約関連フラグ（`termsAgreementEnabled` 等）を追加しない。Terms モデルが規約設定の Single Source of Truth
- **Settings フィールド追加/削除は9箇所同時更新** — ① `schema.prisma` + migration ② `domain/settings/types.ts`（`SettingsData` + ドメイン固有型 `GoogleCalendarSettingsData` 等） ③ `domain/settings/integration-commands.ts`（Input 型 + `updateData`） ④ `domain/settings/admin-queries.ts`（全 `select` 句 + 戻り値マッピング） ⑤ `actions/settings/schemas/<domain>.ts`（Server Action Zod） ⑥ `actions/settings/schemas/form-schemas-*.ts`（Form Zod） ⑦ `settings/_components/sections/<Domain>Section.tsx`（defaultValues + submit payload + UI field） ⑧ `__tests__/unit/domain/settings/integration-commands.test.ts`（fixture に新フィールドを追加） ⑨ `__tests__/integration/actions/admin/settings-<domain>.test.ts`（fixture）。seed + 公開 `queries/display.ts` 等の細分化クエリも確認
- **Settings フィールド追加で公開ページ反映には `queries/display.ts`（ほか `queries/*.ts` 細分化クエリ）の `select` も必須** — DB 列追加 + admin form + `updateBasicInfo` だけでは公開側で取得されない silent bug を起こす（例: `headerLogoUrl` / `useHeaderLogo` が DB・管理フォームに存在したが `getHeaderSettings` / `getFooterSettings` の `select` に欠落し、公開ヘッダー/フッターでロゴ表示が効いていなかった）。`use cache` 公開クエリは各々独立した `select` を持つため、追加列は全該当クエリの `select` + 戻り値マッピング + 戻り値型（`HeaderSettings` / `FooterSettings` 等）に反映し、`layout.tsx` 側で `businessInfo.name.split(" ")[0]?.toUpperCase() ?? "MYRRH"` のような fallback hack が残っていないかも確認する
- **`SettingsData.<field> ?? default` フォールバックは dead code** — `Settings` テーブルは全カラム `NOT NULL`（migration で `DEFAULT` 必須）かつ `SettingsData` 型も全フィールド non-optional。既存の `settings.sidebarEnabled ?? true` / `settings.sidebarRecentCount ?? 5` 等は defensive programming の名残で TypeScript 的には到達不能（left side が `boolean` / `number` で nullish にならない）。新規 Settings field 追加時は **`settings.xxxField` を直接使う**（`?? default` を追加しない）。既存の dead code は tech debt として残存するが、新規コードで伝播させない
- **Multi-tenant 機能追加時は per-entity vs Settings 責務分離を最優先で判断** — 物理拠点ごとに変わる属性（駐車場・営業時間・設備・写真・per-store 連絡先等）は `Location` モデルへ。全社共通の代表情報（代表電話・代表メール・組織名・ブランド情報）のみ Settings。誤って Settings に置くと multi-location サイトで「全店舗が同じ駐車場/設備」のような integrity bug を生む。判定基準: 「拠点を増やしたとき、この値は拠点ごとに違いうるか？」が Yes なら Location 側に置く。`Location.parkingInfo` / `Location.amenities` が参照実装（migration `20260420132517_add_location_parking_and_amenities`）。単一拠点モード（0 Locations）では Settings をフォールバックとして合成 Location を構築する pattern も維持（`buildFallbackLocation()` in `/access/page.tsx`）

### ホームページ Section 管理

- **seed 再実行時のホームページセクション重複** — seed は既存セクションを削除せず追加する。旧型（`hero-parallax`, `concept` 等）と新型（`homepage-*`）が重複し、管理画面に二重表示される。seed 後に旧型を手動削除するか、seed スクリプトに既存セクション削除ロジックを追加すること
- **seed は既存セクションの config を更新しない** — `DEFAULT_PAGE_SECTIONS` のフォーマットが変更されても（例: `imageUrl`→`images` 配列）、既存 DB レコードは旧フォーマットのまま。`mapHeroConfig` 等のマッパーが `arr(config, "images")` で取得できずデフォルト1枚にフォールバックする。手動で DB 更新するか seed reset が必要
- **`homepage-*` セクション型はホームページ専用** — 他ページの `hero`/`cta`/`features` 等は標準セクション型（SectionRenderer 描画）。`homepage-*` に置き換えない
- **ホームページは DB 未登録でも表示される** — `page.tsx` が `homepage-*` セクションをフィルタし、0件なら editorial コンポーネントの defaultProps で直接レンダリング
- **公開ページのセクション高さは `svh` 単位を使用** — `vh` は iOS Safari のアドレスバー問題がある。`min-h-[*svh]` を使用し、`h-[*vh]` は禁止。`height` ではなく `min-height` でコンテンツ溢れを防ぐ（WCAG 1.4.4 準拠）。例外: error/loading/not-found の中央寄せ用 `min-h-[60vh]`、ダイアログの `max-h-[85vh]`、`min-h-screen`（ページ全体）
- **ヒーロー高さはセマンティックプリセット + カスタム** — `sm/md/lg/full/custom` の5段階。custom 時は `heightCustom` (svh 数値) をインラインスタイルで適用。ユーザーに px/vh を直接入力させない（Squarespace/Payload CMS 方式）
- **ホームページ Spaces セクションは SC + CC 分離** — `spaces-section.tsx`（Server Component: ヘッダー+CTA）が `spaces-carousel.tsx`（Client Component: Center Stage Carousel + 自動回転）を呼び出す。中央カード z-30/scale 1、隣 z-20/scale 0.9 の重なりカードスタック。51回繰り返しで無限スクロール。detail パネル + ドットインジケーター。手動操作（矢印・スワイプ・キーボード・ドット）+ 自動回転（`autoPlayInterval` 秒、hover/focus/reduced-motion/tab非表示で停止、ユーザー操作後8秒一時停止）
- **ホームページセクション固有の UI 設定は section config に追加** — カルーセル速度・表示件数等のセクション固有設定は `definitions/homepage-*/schema.ts` に `field.*` ヘルパーで追加する。Settings シングルトンではなくセクション単位で管理画面から制御可能（AutoSectionForm が自動フォーム生成）
- **セクション定義の enum は `as const` 配列 + `field.select` + Set 型ガード** — `HERO_TRANSITIONS` のように schema ファイルに `as const` 配列を定義し、`field.select` の `options` に渡す。消費側（`page.tsx`）では `new Set<string>(VALUES)` + `is*` 型ガードでパース。`enums/helpers.ts` と同構造だがセクション定義はスキーマファイルに閉じる
