# 管理者機能パリティ設計（予約・イベント参加登録・顧客管理）

## 背景

管理画面横断監査（顧客管理/予約/イベント参加登録の3ドメイン、4並列エージェント）により、
19件のギャップ候補を検出、実コード再検証を経て以下に整理した。

- **監査で誤検知だったもの**: 「返金ポリシー自動計算エンジンが存在しない」という指摘は誤り。
  `src/shared/domain/refund/policy.ts` の `calculateRefundRate`/`calculateRefundAmount` が既存実装で、
  `Settings.refundPolicy`（管理画面「返金ポリシー設定」）と連動しゲスト自身のキャンセル時に自動適用済み。
  実際の残課題は「管理者手動返金時にポリシー推奨額を画面表示しない」という小さなUXギャップのみ（Phase 3 に含める）。
- **意図的設計と判断し対象外としたもの**: 顧客への通知メール（BLACKLIST化等の管理者操作で本人に一切メールが飛ばない件）。
  BLACKLIST化は不正・迷惑行為対策のリスク管理機能であり、本人通知は回避行動（別メールでの再登録等）や
  問い合わせ対応工数の増加を招くため、通知しない設計を意図的なものとして現状維持する。本設計のスコープ外。

これらを除いた **18件の実装対象** を、依存関係に沿って4フェーズに分割する。

## ゴール

- 予約・顧客管理が既に持つ「作成後編集」「一括操作」「検索フィルタ」「詳細監査ログ」の管理者体験を、
  イベント参加登録ドメインにも同水準まで引き上げる。
- 監査ログの記録粒度（oldValue/newValue の有無）をドメイン間で統一する。
- 新規の永続化構造（新テーブル）を極力作らず、既存パターン（advisory lock、`executeAdminMutationResult`、
  nuqs parser、`FloatingBulkActionBar`、`flagReasons` リスクフラグ機構）を再利用する。

## 非ゴール

- 顧客への自動通知メール追加（上記の通り意図的に対象外）。
- 決済手段の追加（Stripe以外のオンライン決済導入等）。手動入金記録はオフライン入金の「事後記録」に限定する。
- 予約・イベント参加登録以外の新しい業務ドメインの追加。

## フェーズ構成と根拠

Phase 1（監査ログ基盤）→ Phase 2（イベント参加登録格上げ）→ Phase 3（予約運用強化）→ Phase 4（顧客管理強化）の順。
Phase 1 を最初に置くのは、Phase 2 で新設する `updateEventRegistrationCommand` 等の新規 mutation が
最初から統一済みの監査ログパターンに乗るようにするため（後からの手戻りを避ける）。Phase 2 を Phase 3/4 より
先に置くのは、監査で最重要（High impact）と判定された「イベント参加登録は作成後の編集が構造的に不可能」への
対応が最優先のため。

各フェーズは実装時に複数PRへ分割する（1 PR = 1 logical change、soft limit 300行/10ファイル、
CLAUDE.md 自動完遂ポリシー準拠）。PR分割案は各フェーズ末尾に記載。

---

## Phase 1: 監査ログ規約統一（基盤）

### アーキテクチャ

`src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts` の `executeAdminMutationResult`
（実行順序: checkAdminAuth → resolveResourceId → hasPermission → userHasResourceAccess → execute →
afterSuccess → logAction は不変契約、変更しない）に、任意の `auditDiff` パラメータを追加する:

```ts
executeAdminMutationResult({
  resource, action, resourceId,
  execute,
  afterSuccess,
  auditDiff?: (result) => { oldValue?: unknown; newValue?: unknown },
})
```

`auditDiff` が指定された場合、内部の `fireAndForget(logAction(user.id, action, resource, resourceId))`
（`_shared/lib/action-auth.ts:140-163`、oldValue/newValue非対応）を
`fireAndForget(createAuditLogRecord({ userId, action: actionToAuditAction(action), resource, resourceId, ...auditDiff(result) }))`
（`src/shared/domain/audit-log/commands.ts:132-226`、hash chain + P2034 retry込み）に切り替える。
`auditDiff` 未指定の既存呼び出し元は無変更で動作する非破壊的追加。

### コンポーネント / データフロー

1. **resource文字列統一**: `AuditLog.resource` には2つの独立した使われ方が混在している。
   (a) `executeAdminMutationResult` に渡す `Resource` 型の権限チェック値（既存のイベント参加登録関連
   5action は全て `resource: "event"` で権限チェックしており、これは正しく統一済み）。
   (b) ペイメント側の副作用コマンドが `executeAdminMutationResult` を経由せず **直接**
   `createAuditLogRecord` を呼ぶ、より詳細な監査ログ用の自由文字列（`"eventRegistration"` /
   `"event-registration"` の表記ゆれが実在）。今回統一するのは (b) のみで、
   `"event-registration"`（kebab-case）を共有定数として導入し、camelCase で孤立している2箇所
   （`src/app/(public)/claim/event-registration/_actions/claim.ts:90`、
   `src/shared/domain/events/payment-commands.ts:870`）を修正する。(a) の `resource: "event"` は
   変更しない。AuditLog.resource は enum ではなく String 列のため、DB migration は不要
   （既存行の過去データはそのまま、将来行から統一）。
2. **PII検索の監査ログ新設**: `searchCustomersAction`（`_shared/actions/customer.ts:510-518`）に
   `createAuditLogRecord({ action: AuditAction.READ, resource: "customer", metadata: { query, resultCount } })`
   を追加。現状ゼロだった証跡を新設する。
3. **既存5関数への `auditDiff` 適用**: `createCustomer` / `updateCustomer` / `updateCustomerNotes` /
   `toggleCustomerActive` / `clearCustomerRiskFlag`（すべて `_shared/actions/customer.ts`）に
   `auditDiff` を追加し、基本ログのみから oldValue/newValue 付き詳細ログに切り替える。

### エラー処理

`createAuditLogRecord` 側の hash chain retry（P2034 serialization conflict、最大3回、既存実装）を
そのまま利用。`auditDiff` コールバック自体は同期・例外を投げない前提（`fireAndForget` でラップ済みのため
失敗しても mutation 本体はロールバックしない設計を維持）。

### テスト

- `admin-action.ts` 単体テスト: `auditDiff` 有無それぞれの分岐で `logAction` / `createAuditLogRecord` の
  呼び分けを検証。
- 5関数それぞれで oldValue/newValue が正しい前後値を含むことを検証。
- `searchCustomersAction` の READ 監査ログ記録テスト。
- resource文字列統一後、既存の "eventRegistration" 表記への依存がないことを grep gate または
  architecture-boundaries テストで固定（再発防止）。

### PR分割案

1. `executeAdminMutationResult` への `auditDiff` 追加 + 単体テスト（基盤、他フェーズの前提）
2. resource文字列統一 + searchCustomersAction 監査ログ追加
3. 既存5関数への `auditDiff` 適用

---

## Phase 2: イベント参加登録の管理機能格上げ（最重要）

### アーキテクチャ

`src/shared/domain/events/registration-commands.ts` に `updateEventRegistrationCommand` を新設する。
name/email/phone/quantity/note をまとめて編集可能にする（`updateAdminReservationCommand` が予約の
主要項目を1コマンドで編集する設計を踏襲）。

quantity 変更は定員再判定が必要なため、`createWalkInRegistrationCommand`（L412-528）と同じ
advisory lock（`728350::int4, hashtext(eventId)`）を取得したトランザクション内で、既存の残枠計算ロジック
（slot単位 L465-473 / ticket単位 L475-499 相当）を「自分の現quantityを除いた残枠 + 新quantity ≤ 定員」の
形で再利用する。同時実行対策は version 列を新規追加せず、`updateMany` + `status: {not: CANCELLED}` の
TOCTOU防止パターン（`setEventRegistrationCheckInCommand` L379-385 と同型）を踏襲する。

### コンポーネント

- `EventRegistrationTable.tsx`: 編集ボタン追加（ダイアログ形式、`updateEventRegistration` action 呼出）。
  props で取得済みだが未描画だった `note` 列の表示を追加。
- 検索・フィルタ: `nuqs/parsers.ts` の `adminEventRegistrationsSearchParamsCache`（現状 page/perPage のみ、
  L83-94）に search（name/email）・status・paymentStatus の parser を追加し、
  予約用 `adminReservationSearchParamsParsers`（L518-535）と同型にする。テーブル上部に検索input・
  ステータスselectを追加。
- `WaitlistQueueTable.tsx`: キャンセルボタン追加。既存の `adminCancelRegistration` action
  （`CANCELLABLE_REGISTRATION_STATUSES` は WAITLISTED 系を含み受理可能と既存実装で確認済み）を
  そのまま呼び出す。バックエンド変更不要。
- 一括操作: `bulkCancelEventRegistrations` / `bulkCheckInEventRegistrations` を
  `_shared/actions/reservation/bulk.ts` と同型（per-id command呼出 + `emitBulkAuditRecords`）で新設。
  `EventRegistrationTable.tsx` にチェックボックス列 + `FloatingBulkActionBar` を追加
  （`events/_components/EventBulkActions.tsx` は Event 本体の一括操作用の別コンポーネントであり、
  今回は `events/[id]/_components/` 配下に EventRegistration 専用の新規バーを追加する）。
- 横断CSVエクスポート: `/api/admin/export/event-registrations/route.ts` の `eventId` を省略可能にし、
  省略時は全イベント横断（日付範囲・ステータス絞り込み対応）で出力する。`/admin/events` 一覧ページに
  エクスポートボタンを追加。
- 代理登録の入口可視化: `events/[id]/page.tsx`（イベント詳細）に、既存の `ProxyRegistrationDialog` /
  `WalkInDialog`（現状 check-in ページ配下にのみ導線）を開くボタンを追加。ダイアログ自体は再利用、
  新規UIコンポーネントは不要。
- 手動入金記録: `recordManualEventPaymentCommand` を新設。`paymentStatus: UNPAID → PAID` の遷移、
  金額・方法（`CASH` / `BANK_TRANSFER` / `OTHER` の固定選択、集計・分析のため自由記述にはしない）・
  任意メモを必須入力とする。対象は
  `stripeCheckoutSessionId: null` の登録のみ（walk-in/proxy作成時は null 固定のため対象は自然に限定される。
  Stripe checkout 進行中の登録には使えないようガードする）。Phase 1 の `auditDiff` 機構で
  oldValue（UNPAID）/newValue（PAID + 記録内容）を監査ログに残す。

### データフロー

編集・一括操作・手動入金いずれも `executeAdminMutationResult` 経由で `resource: "event"` を使用し
（既存の5兄弟action = adminCancelRegistration/refundEventRegistrationPayment/
toggleEventRegistrationCheckIn/createWalkInRegistration/createAdminProxyRegistration と同じ
Resource型に揃える）、Phase 1 で追加した `auditDiff` を渡して oldValue/newValue を記録する。
これは `executeAdminMutationResult` の権限チェック用 `resource` をそのまま `createAuditLogRecord` に
転送する設計であり、Phase 1 で統一した `"event-registration"` 文字列（ペイメント側副作用コマンドが
直接 `createAuditLogRecord` を呼ぶ別経路専用）とは別レイヤーのため混同しない。

### エラー処理

定員超過は既存パターンと同様 `DomainError("CONFLICT")`。手動入金記録は
「`stripeCheckoutSessionId` が非null（Stripe決済進行中/完了）の登録」に対しては
`DomainError("VALIDATION")` で拒否する。

### テスト

- `updateEventRegistrationCommand` の定員再判定を境界値（ちょうど残枠、残枠+1等）含め integration テスト。
- bulk操作の per-id 副作用テスト（一部失敗時の挙動含む）。
- 手動入金記録の状態遷移テスト（UNPAID→PAID、Stripe進行中からの拒否）。
- 検索・フィルタ parser の integration テスト（予約側の既存テストパターンを踏襲）。

### PR分割案

1. `updateEventRegistrationCommand` + 編集UI + note列表示
2. 検索・フィルタ（nuqs parser追加 + UI）
3. waitlistキャンセルボタン + bulk操作（bulkCancel/bulkCheckIn + UI）
4. 横断CSVエクスポート + 代理登録入口の可視化
5. 手動入金記録

---

## Phase 3: 予約(Reservation)運用強化

### アーキテクチャ

`ReservationEditForm.tsx` に guest 連絡先フィールド（guestLastName/FirstName/Email/Phone/CompanyName/
CustomerType）を追加する。編集は Reservation 行の guest* 列のみを更新し、Customer 行には伝播させない
（既存の「顧客情報を更新」ボタン——Reservation→Customer への一方向コピー——とは独立した別経路として扱う。
どちらが正か曖昧にしないため、guest* 編集は「この予約のスナップショットの訂正」、既存ボタンは
「顧客マスタへの反映」と役割を明確に分離する）。

キャンセル理由入力は、ステータス変更ドロップダウンで CANCELLED を選ぶ操作、および一括キャンセル実行の
両方に、`RefundDialog` と同型（プリセット+自由入力+文字数制限）の理由入力ダイアログを挟み、
`_shared/actions/reservation/mutations.ts:161-178` の `cancellationReason: null` ハードコードと、
`bulk.ts:271-277` の同様のハードコードを置き換える。

### データフロー

予約CSVエクスポート（`getReservationsForExport`、現状引数なしで常に全件出力)に、一覧画面の
フィルタ条件（日付範囲・ステータス・スペース）をクエリパラメータとして渡せるようにし、
AuditLog の metadata に出力対象の予約IDリストまたはフィルタ条件のスナップショットを記録する
（現状は `exportedCount` のみ）。

RefundDialog は2点修正する:

1. **バグ修正**: `ReservationDetail.tsx:575-580` で `cumulativeRefunded` が渡されておらず「残額」表示が
   常に税込合計になっている問題を、Refund合計額を取得して渡すよう修正。
2. **UX追加**: `getRefundPolicySettings()`（`shared/domain/settings/admin-queries.ts:437-445`）+
   `calculateRefundAmount`（既存の自動計算エンジン）でポリシー推奨額を算出し、`RefundDialog` に
   `suggestedAmount` として渡してヒント表示・プレースホルダーに反映する（追加のoptional propのみ、
   既存の手動入力フローは変更しない）。

### エラー処理

guest連絡先編集は他フィールドと同じ `updateReservationFormSchema` のバリデーション経路に乗せる
（email形式・電話番号形式は既存の customer フォームスキーマと同じ制約を流用）。

### テスト

- guest連絡先編集のバリデーション・保存テスト（Customer行に波及しないことの確認含む）。
- キャンセル理由入力の必須/任意仕様に応じたフォームテスト（単発・一括それぞれ）。
- RefundDialog の `cumulativeRefunded` 表示修正テスト、ポリシー推奨額表示テスト。
- CSVエクスポートのフィルタ連動テスト、監査ログmetadata記録テスト。

### PR分割案

1. guest連絡先編集フィールド追加
2. キャンセル理由入力（単発+一括）
3. RefundDialog 2点修正（バグ修正+推奨額表示）
4. 予約CSVエクスポートのフィルタ連動+監査ログ強化

---

## Phase 4: 顧客管理強化

### アーキテクチャ

重複顧客自動検出は新テーブルを作らず、既存の `flagReasons` / `flaggedForReviewAt`
リスクフラグ機構（`risk-detection.test.ts` 等で既存運用済み）を再利用する。新規 cron route
（`add-cron-job` skill の手順に従う）を日次で追加し、`emailCanonical` 一致または `phoneNumber` 完全一致
（ユーザー決定: 電話番号一致を追加、ファジーマッチは対象外）の顧客ペアを検出して
`"DUPLICATE_CANDIDATE"` フラグ理由を立てる。顧客一覧の既存 `flaggedOnly` フィルタで可視化し、
クリックで `MergeCustomerDialog` を候補プリフィルで開く。

### コンポーネント / データフロー

- `CustomerDetail.tsx` に「統計を再計算」ボタンを追加し、`recomputeCustomerReservationStats`
  （`shared/domain/reservations/payloads.ts:264-295`）を単発の customerId に対して起動する薄い
  admin action を新設する。
- `updateAdminReservationCommand`（`admin-commands.ts:519-525`）の既存の再計算トリガー条件
  （現状 customerId 変更時のみ）を、同一顧客の `totalPrice`/`totalPriceWithTax` 変更時にも発火するよう
  条件を拡張する（自認済みの既知の穴の修正）。
- `getCustomerById`（`shared/domain/customers/queries.ts:173-201`）の `include` に
  `eventRegistrations: { include: { event: { select: { id, title } } }, orderBy: { createdAt: "desc" }, take: 20 }`
  を追加し、`CustomerWithReservationsAndAccount` 型（`types.ts:66-80`）に
  `eventRegistrations: CustomerEventRegistrationRecord[]` を追加（既存フィールドの型は変更しない
  加算のみのため非破壊）。`CustomerDetail.tsx` に既存の予約履歴カードと同型の
  「イベント参加履歴」カードを追加。
- `CustomerBulkActions.tsx` に一括メール送信を追加。テンプレート選択（`EMAIL_TEMPLATE_REGISTRY` から）
  または自由文（ユーザー決定）を選べるダイアログとし、`marketingOptIn: true` の選択顧客のみを送信対象と
  する（同意ゲート）。自由文はプレーンテキストとしてエスケープ描画し、既存のブランド付きメールレイアウト内に
  埋め込む（raw HTML 注入は許可しない、XSS/なりすまし対策）。

### エラー処理

重複検出cronは fail-open（検出処理自体が失敗しても既存の顧客一覧・フラグ機構の他の動作に影響しない設計、
`Settings` JSON parse の fail-open 方針と同じ思想）。一括メールは、選択顧客の中に
`marketingOptIn: false` が含まれる場合、送信対象から除外した件数を実行前に画面表示する。

### テスト

- 重複検出cronのマッチングロジックテスト（email一致/電話番号一致それぞれ、false positive を作らないこと）。
- 統計再計算ボタンの権限テスト（対象customerIdのみに影響し他顧客に波及しないこと）。
- `getCustomerById` 型拡張が既存呼び出し元を壊さないことの type-check 確認。
- 一括メールの同意フィルタテスト（除外件数の正しさ含む）。

### PR分割案

1. 重複顧客自動検出cron + 顧客一覧での可視化
2. 統計手動再計算ボタン + totalPrice単独変更時のrecompute条件拡張
3. 顧客詳細へのイベント参加履歴統合
4. 顧客一括メール送信

---

## リスク・オープンな論点

- Phase 2 の手動入金記録は「Stripeを経由しない支払い実績を人手で記録する」新しい信頼境界を持ち込むため、
  Phase 1 の詳細監査ログ（誰が・いつ・いくら記録したか）を必須の前提とする。
- Phase 4 の重複検出は誤検出（同一世帯の別人が同じ電話番号を共有するケース等）を完全には排除できない。
  自動マージは行わず、あくまで「候補提示 + 手動マージ確認」に留める設計とすることでリスクを抑える。
- 各フェーズは実装フェーズ（writing-plans）でさらに前述のPR単位に分割し、CLAUDE.md の
  20ファイル超/1000行超の停止例外に抵触する場合は都度ユーザーに確認する。
