---
paths:
  - "src/shared/lib/stripe*.ts"
  - "src/shared/lib/cloudflare.ts"
  - "src/shared/lib/r2/**"
  - "src/shared/lib/google-*/**"
  - "src/shared/lib/calendar*/**"
  - "src/shared/lib/instagram/**"
  - "src/shared/lib/email/**"
  - "src/shared/emails/**"
  - "src/shared/domain/payment/**"
  - "src/shared/domain/refund/**"
  - "src/shared/domain/calendar-sync/**"
  - "src/shared/domain/instagram/**"
  - "src/shared/domain/google-business-profile/**"
  - "src/app/api/webhooks/**"
  - "src/app/api/cron/**"
---

# 外部連携

API キーやトークンは `SettingsFeatures` 系の singleton テーブルに purpose 別の
派生鍵で暗号化して保存する（`.claude/rules/security-auth.md`）。
新しい連携を足すときは `SETTINGS_CRYPTO_PURPOSES` に一意な purpose を登録する。

## Stripe

- **webhook 検証は async 版のみ。** `constructEvent` /
  `generateTestHeaderString`（sync 版）は Bun の Web Crypto 環境で throw する。
  型封印は `src/shared/lib/stripe.ts` の `AsyncOnlyStripe`、直接呼び出しの
  機械ブロックは ESLint。
- SDK 呼び出しには request timeout を設定する
  （`__tests__/unit/architecture/stripe-request-timeout.test.ts`）。
- 非同期返金（`konbini` / `customer_balance`）は作成直後 `pending` を返す。
  `refund.updated` / `refund.failed` の webhook 購読が Stripe 側に必要。
  詳細は `.claude/rules/business-domain.md`。

## Google Calendar

- 双方向同期。inbound（Google → DB）の書き込みも space 単位の advisory lock を
  通す。sync token を失うと全件再同期になるので、失敗時の扱いに注意。
- webhook route はヘッダーを Zod schema で検証する。
- サービスアカウント JSON は共有の validation helper 経由で検証する
  （直接 `JSON.parse` しない）。
- iCal フィード配信は全廃済み。再導入しない。

## Cloudflare

- CDN の purge は `src/shared/lib/cache/site-wide.ts` 経由
  （`.claude/rules/caching.md`）。`invalidateSiteWideCache` を通さない
  `updateTag` は CDN を古いまま残す。
- Turnstile: 公開フォームの最後の guard。widget が render 済みなのに
  challenge が来ず空トークンで止まることがある（E2E の既知の罠）。
- R2: 公開メディアは CDN 配信 URL（`buildPublicUrl`）。**お問い合わせの添付は
  private バケットのみ**で、`buildPublicUrl` を呼ばない（専用ゲートあり）。

## メール（Resend + React Email）

- テンプレートは `src/shared/emails/<name>.tsx` と、プレビュー用の
  `<name>.fixture.ts` を対で置く。登録は `src/shared/emails/_registry/`。
- ローカルプレビュー: `bun run email:dev`（<http://localhost:3030>）。
- 予約確認メールに領収書 CTA を入れない、パスコードをテンプレートに載せない、
  といった個別の clean-break ゲートがある。テンプレートを触る前に
  `__tests__/unit/emails/` を見る。
- 送信の冪等性はメール種別ごとに担保する
  （`__tests__/unit/architecture/reservation-email-idempotency.test.ts`）。

## Instagram / Google Business Profile

OAuth トークンは DB に暗号化保存し、cron でリフレッシュする。
`googleapis` の型（`Schema$Location`）は `z.custom` helper 経由で受ける
（`.claude/rules/type-safety.md`）。

## cron / webhook route の作法

- 認証は共有 helper 経由（cron は OIDC、webhook は署名検証）。
- `{ success: boolean }` の legacy payload を返さない。
- Prisma を直接 import しない。`shared/domain` を経由する。
- route を足したら Cloud Scheduler 側と同期する（`.claude/rules/deploy-infra.md`）。
