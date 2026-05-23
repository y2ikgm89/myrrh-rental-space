---
description: 実装 Gotchas — 料金フォーマット / ドメインコマンド共通 / Customer-Inquiry 連動 / 予約状態遷移 / ソフトデリート / 日時 Timezone / Settings Multi-tenant
paths:
  - "src/shared/domain/**"
  - "src/app/(admin)/**/_shared/actions/**"
  - "src/app/(public)/**/_shared/actions/**"
  - "src/app/api/cron/**"
---

# 実装 Gotchas

> domain pattern 固有の落とし穴集。個別 rule のスコープに収まる項目は移管済み (cache invalidation → `server-actions/use-cache.md` / 公開 UI → `frontend/project-design-config.md` / 公開 sections → `frontend/sections.md` / API rate limit → `api-routes.md` / `exactOptionalPropertyTypes` → `react/gotchas.md`)。

## 料金フォーマット

- **`formatPrice` / `formatCurrency` は `@/shared/lib/pricing/format` が唯一の定義** — `utils.ts` / `price-format.ts` 等にローカル定義禁止。`formatPriceWithTax` / `formatUnitPriceWithTax` で税表示モード対応
- **確定済み金額（予約レコード）には `formatPrice` を使う** — 予約確定時の税率で計算済みのため `formatPriceWithTax` で再計算しない

## ドメインコマンド共通

- **`fireAndForget` は `@/shared/lib/async-utils`** — `@/shared/lib/errors/server` からは export されない。Server Actions の `afterSuccess` 内でメール送信・通知生成・カレンダー同期等の非クリティカル副作用に使用。第 2 引数は `{ operation, category }` で logError 用コンテキスト
- **公開フォーム成功時の管理通知必須** — 予約・お問い合わせ・レビュー・イベント申込の成功パスに `fireAndForget(createNotificationCommand({ type: NOTIFICATION_TYPE.*, ... }))` + `updateTag(CACHE_TAGS.NOTIFICATIONS)` が必要。顧客セルフキャンセル（マイページ）も含む
- **`executeAdminMutationResult` で `afterSuccess` にデータを渡すには `execute` 戻り値を使用** — `let data = null` を外部クロージャに定義して `execute` 内で代入するパターン禁止（脆弱）。`execute` の戻り値型を適切に定義し `afterSuccess: (data) => { ... }` で受け取る
- **Server Action の薄い wrapper にも認証チェック必須** — `searchCustomersAction` のように domain query を re-export するだけの Server Action でも `checkAdminAuth()` を呼ぶ。Server Action は endpoint として外部から呼び出せるため、layout の認証ガードに依存しない
- **マイページ Server Actions には `formSubmitRateLimiter` を使用** — `publicQueryRateLimiter` は認証不要の公開クエリ専用。マイページの mutation/query アクションは認証済みのため `formSubmitRateLimiter` を使う
- **Prisma update の `null` と `undefined` の違いに注意** — `null` は DB カラムを NULL に設定、`undefined` はフィールド更新をスキップ。`value || null` は `undefined || null = null` で意図しない NULL 上書きを引き起こす
- **JSON フィールドのインラインパース禁止** — `Array.isArray(x) ? x.filter(...) : []` のようなインラインフィルタは禁止。`parseStringArray(x)` / `parseBusinessHours(x)` / `parseBusinessAttributes(x)`（`json-validators.ts`）を使用。admin-queries と public-queries の両方で統一すること
- **メール一括送信は `Promise.allSettled` でパラレル化** — for-of + await 逐次送信は禁止。`Promise.allSettled` + 個別エラーログで並列化
- **Slug 重複時の採番は deterministic incremental（`-2` / `-3`）** — WordPress / Ghost / Notion 互換、URL 予測可能性が高い。参照実装: `@/shared/domain/events/commands.ts` の `ensureUniqueSlug`

## Customer / Inquiry / 予約フォーム

- **`resolveOrCreateCustomer` で既存顧客のデータを変更禁止** — 既存 Customer の名前・電話・companyName を上書きしない。ゲスト予約では customerId のみ返す。ログイン済み予約では `userId` のみ設定（Shopify 型保護パターン）
- **`ensureCustomerLinked` で別ユーザーにリンク済みの Customer を乗っ取らない** — `byEmail.userId` が既に別ユーザーに設定されている場合は新規 Customer を作成
- **予約の guest フィールドと Customer プロフィールは独立** — `guestLastName` / `guestFirstName` / `guestPhone` / `guestCompanyName` は予約時の入力スナップショット。`buildPayload` は `customer` テーブルの現在値を使用
- **Inquiry ↔ Customer 紐づけ: 3 段解決** — `createInquiryCommand` が `customerId`（明示） > メール一致 > null で解決
- **公開フォーム初期値は `InquiryDefaults` SSoT 経由で配線** — `/contact` 等のログイン顧客向け自動入力は `getInquiryDefaultsForCurrentCustomer()`（`@/shared/domain/inquiries/customer-defaults`、`server-only`、cache 済 `getCurrentCustomerUser()` + `getCustomerByUserId()` 派生）で `InquiryDefaults`（`@/shared/lib/inquiry/defaults`）を生成し、`SectionRenderer.inquiryDefaults` prop 経由で `ContactFormSection` → `PublicInquiryFormCard.defaults` に貫通。page.tsx 内で `getCustomerSession()` を直接呼んで姓名/メール/法人区分を組み立てる経路は禁止（cache 重複 + 派生型の dead code 化）。未ログイン時は `{}`、Customer 未紐づけ時は `{ email }` のみを返す契約
- **`customer-queries.ts` の select は admin 側と同期必須** — 一覧用（`LIST_SELECT`）と詳細用（`DETAIL_SELECT`）を分離
- **予約フォームはプロフィール未完了でも表示する** — 業界標準: インライン収集。`isCustomerProfileComplete()` はマイページ警告判定のみ
- **予約フォームの `?spaceId=` 事前選択** — `/reservation?spaceId={id}` リンク + `resolveAutoIds` が locationId 逆引き

## 予約ステータス / state machine

- **予約ステータス遷移は `RESERVATION_STATUS_TRANSITIONS`（`helpers.ts`）で一元管理**
- **`RESERVATION_STATUS_LABELS` に `string` キーで直接アクセス禁止** — `isValidReservationStatus(status)` で narrowing
- **アクティブ判定は `ACTIVE_RESERVATION_STATUSES`（`enums/helpers.ts`）を使用**
- **カレンダー inbound 同期は `ACTIVE_RESERVATION_STATUSES` で判定** — ハードコード条件禁止
- **終端状態を持つ state machine は双方向遷移ではなく SUPER_ADMIN restore action 別経路で実装**
  - **禁止**: 逆方向遷移追加（`CANCELLED → CONFIRMED` 等）→ 重複予約・在庫衝突 silent bug
  - **canonical 4 ステップ**: ① AlertDialog 警告 ② `restoreXxxStatusCommand` 別 domain command（conflict 検出 + cancellation fields クリア + `icsSequence` increment） ③ Server Action `executeAdminMutationResult` + `if (user.role !== Role.SUPER_ADMIN) throw new DomainError("...", "FORBIDDEN")` ④ UI は SUPER_ADMIN のみ表示
  - **業界標準**: Stripe / Airbnb / Eventbrite
- **予約削除時のクーポン使用数デクリメント必須** — `deleteReservationCommand` は `$transaction` 内で reservation 削除 + `coupon.updateMany({ where: { id, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } })`

## ソフトデリート

- **ソフトデリート追加時は全クエリの `select` に `deletedAt: true` を追加**
- **ソフトデリートモデルの全 `findUnique` / `findFirst` / `findMany` / `update` に `where: { deletedAt: null }` 必須** — `restoreReservationCommand` のみ例外
- **リレーション経由クエリの親ソフトデリートガード必須** — 子モデルが `deletedAt` を持たなくても、親モデルが持つ場合は `where: { eventId, event: { deletedAt: null } }`
- **ドメインコマンドの mutation クエリも親ソフトデリートガード必須** — read 系だけでなく write 系の前提クエリも対象

## 日時 / Timezone

- **SC 内の `Date.getHours()` / `getDate()` 等はローカルタイム依存** — Cloud Run は UTC 環境。JST が必要な場合は `Intl.DateTimeFormat` + `timeZone: "Asia/Tokyo"`
- **Server Component で `Date.now()` 直接使用は `@eslint-react/purity` で error** — 純関数として domain helper（`isEventRegistrationPastDeadline()`）に抽出して呼び出す
- **Cron の「翌日」「当日」計算は JST 基準** — `new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0)` は UTC の翌日。`Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })` で "YYYY-MM-DD" 取得 → `new Date(\`${str}T00:00:00+09:00\`)`
- **Client Component の catch ブロックで `logError` は使えない（server-only）** — `getErrorMessage(error)` + `console.error`

## Settings / Multi-tenant

- **規約の予約時必須 / フッター表示は `Terms.requiredAtReservation` / `Terms.showInFooter` で管理** — Settings に規約フラグを追加しない
- **Settings フィールド追加 / 削除は 9 箇所同時更新** — schema.prisma + migration / `domain/settings/types.ts` / `integration-commands.ts` / `admin-queries.ts` (select + マッピング) / `actions/settings/schemas/<domain>.ts` / `form-schemas-*.ts` / `<Domain>Section.tsx` / 単体 test fixture / 統合 test fixture
- **Settings フィールド追加で公開ページ反映には `queries/display.ts` の `select` も必須** — admin form だけでは公開側で取得されない silent bug。実例: `headerLogoUrl` 欠落で公開ヘッダーロゴ非表示
- **`SettingsData.<field> ?? default` フォールバックは dead code** — `Settings` テーブルは全カラム NOT NULL + `SettingsData` も全フィールド non-optional。新規コードでは持ち込まない
- **Multi-tenant 機能追加時は per-entity vs Settings 責務分離を最優先** — 「拠点を増やしたとき値が変わるか」が Yes なら `Location`、No なら Settings。silent bug 防止
