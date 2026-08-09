---
paths:
  - "src/shared/domain/**"
  - "src/app/(public)/reservation/**"
  - "src/app/(public)/events/**"
  - "src/app/(public)/mypage/**"
  - "src/app/(admin)/admin/(dashboard)/reservations/**"
  - "src/app/(admin)/admin/(dashboard)/events/**"
---

# 業務ドメイン

レンタルスペースの予約と、スペースで開催するイベントの申込。決済は Stripe。
ドメインロジックは `src/shared/domain/<領域>/` に置き、`queries` / `commands` /
`admin-*` / `public-*` / `customer-*` で読み書きと呼び出し元を分ける。

## 予約

`ReservationStatus`: `PENDING` / `CONFIRMED` / `COMPLETED` / `CANCELLED` /
`NO_SHOW`。

- **重複予約は 2 段で防ぐ。** space 単位の advisory lock
  (`lockSpaceForTransaction`) と、DB の EXCLUDE 制約
  `reservations_no_active_time_overlap_excl`（`deleted_at IS NULL` かつ
  `status IN (PENDING, CONFIRMED)` の範囲）。
  **可用性に影響する全書込経路が lock を通る**のが不変条件で、
  カレンダー同期からの inbound 書き込みも例外ではない。
- 楽観ロック（`Reservation.version`）を書くのは
  `customer-commands.ts` と `admin-commands.ts` の 2 ファイルだけ。
  form 由来の更新経路に限定する契約。
- 定期予約（`ReservationSeries`）のキャッシュ無効化で、`reservationId` の
  スロットに `seriesId` を渡さない。
- 重複判定の helper に `Only` サフィックスの派生を作らない（SSoT が割れる）。

## イベント

- 在庫（定員）と waitlist を持つ。申込は数量つきで、CHECK 制約で
  `quantity >= 1` / 金額と税率の範囲が固定されている。
- `meetingUrl`（オンライン開催の URL）は **CONFIRMED のときだけ**返す
  fail-closed。公開側の query / JSX に載せない（専用ゲートあり）。
- 監査ログの `resource` は `event-registration`（kebab-case）。

## 決済・返金

- Stripe の非同期返金（コンビニ / 銀行振込 = `konbini` /
  `customer_balance`）は作成直後 `pending` を返し、後日 `refund.updated`
  webhook で確定する。**status を見ずに完了扱いにしない。**
  `refunds` テーブルは追記専用で、可変列は `status` だけ。
- 同一予約の返金は `pg_advisory_xact_lock` で直列化する（over-refund 防止）。
- 領収書は予約 / イベント申込のどちらか片方にしか紐づかない
  （CHECK `receipts_target_exclusive_check`）。

## 証跡

監査ログ・利用規約同意・問い合わせステータス履歴・返金は DB trigger で
追記専用。UPDATE / DELETE の経路を足さない（`.claude/rules/db-domain.md`）。

## 機能モジュール

サイト単位の ON/OFF は `src/shared/lib/features/registry.ts` の
`FEATURE_MODULES_LIST` が SSoT（`spaces` / `reservation` / `events` / `posts` /
`news` / `faq` / `access` / `contact` / `reviews` / `payment` /
`data-retention`）。値は `SettingsFeatures.featureModules` の JSON 列に持ち、
キーが欠けていれば fail-closed（`false`）。

追加時に同時更新する 5 点はそのファイルの docstring に書いてある。
OFF の機能は公開ルートで `requireFeatureEnabled` により `notFound()` になり、
nav / sitemap / セクション追加ダイアログ / ページテンプレートからも外れる。

## 定期実行

`src/app/api/cron/*` に 23 本。認証は OIDC（`.claude/rules/security-auth.md`）。
route を足したら Cloud Scheduler 側と同期する
（`.claude/rules/deploy-infra.md`）。

## 日時

営業時間・締切・リマインダーはすべて JST 前提。`date-format.ts` を通す
（`.claude/rules/type-safety.md`）。祝日は `@holiday-jp/holiday_jp`。
