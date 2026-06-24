# Stripe Webhook Deploy Smoke

## 概要

Bun runtime 上での Stripe webhook (`constructEventAsync`) が staging で正しく動くことを deploy 後に手動確認する手順。

Bun は Web Crypto (`SubtleCryptoProvider`) を選択するため sync 版の `constructEvent` は `Error: Stripe is unable to perform synchronous crypto operations in this environment.` を投げる。`src/app/api/webhooks/stripe/route.ts` は `constructEventAsync` を使い、`src/shared/lib/stripe.ts` の `AsyncOnlyStripe` 型封印と `eslint.config.mjs` の `no-restricted-syntax` で 2 段防御している。Deploy 後に実 SDK 経由で signature 検証が通り続けていることを確認するのが本ランブックの目的。

- `constructEventAsync` 公式例: https://github.com/stripe/stripe-node/blob/master/testProjects/cloudflare-pages/functions/index.js
- 型封印の根拠: `src/shared/lib/stripe.ts` の `AsyncOnlyStripe` コメント

## 前提

- Stripe CLI インストール済 (https://docs.stripe.com/stripe-cli)
- staging に deploy 完了 (Cloud Run / `next start` が正常起動していること)
- Stripe Dashboard の Webhooks 設定で staging URL (`https://<staging-host>/api/webhooks/stripe`) が有効になっていること
- 該当環境の `STRIPE_WEBHOOK_SECRET` が Secret Manager に同期されていること

## 手順

### 0. CLI 認証 + listen 起動 (任意)

```sh
stripe login
# Dashboard 設定済 endpoint へ直接 trigger する場合は listen 不要。
# 一時的にローカル forward したい場合のみ:
stripe listen --forward-to https://<staging-host>/api/webhooks/stripe
```

### 1. checkout.session.completed (即時決済)

```sh
stripe trigger checkout.session.completed
```

期待:

- Stripe Dashboard の Webhook log で 200 を返す
- アプリ側 `reservation.paymentStatus` が `PAID` に遷移する
- 確認メール (`sendReservationConfirmationEmail`) が送信される

### 2. charge.refunded (返金)

```sh
stripe trigger charge.refunded
```

期待:

- Webhook log 200
- `reservation.paymentStatus` が `REFUNDED` に遷移する
- 該当予約のキャッシュタグ (`RESERVATIONS` / detail / calendar) が invalidate される

### 3. payment_intent.payment_failed (失敗)

```sh
stripe trigger payment_intent.payment_failed
```

期待:

- Webhook log 200 (アプリは `unstable_rethrow` 経由で 200 を返し Stripe 再送を防ぐ)
- 関連予約があれば `paymentStatus = FAILED`、なければ log のみで副作用なし

### 4. checkout.session.async_payment_succeeded / failed (UK アカウント要)

```sh
# 銀行振込等の非同期決済成功
stripe trigger checkout.session.async_payment_succeeded

# 銀行振込等の非同期決済失敗
stripe trigger checkout.session.async_payment_failed
```

> 注: これらは Stripe CLI の trigger fixture 仕様で **UK Stripe account 必須**。
> 参考: https://github.com/stripe/stripe-cli/wiki/Trigger-command (List supported webhook events)

期待:

- 成功: `paymentStatus = PAID` + 確認メール送信
- 失敗: `paymentStatus = FAILED`

## 確認できなかったら

- Stripe Dashboard の Webhook log で **response body** を確認する。
  - `{"error":"Invalid signature"}` (400) → `STRIPE_WEBHOOK_SECRET` の不一致、または `constructEvent` 側 (sync) を誤って呼んでいる。`src/app/api/webhooks/stripe/route.ts` で `constructEventAsync` を呼んでいることを確認。
  - `{"error":"Stripe webhook not configured"}` (503) → `stripeEnabled = false` / secret 復号失敗 / クライアント不在。`getStripeSettings` の DB 値と env を確認。
  - `Stripe is unable to perform synchronous crypto operations` を runtime log で見たら **sync 版が呼ばれている**。`AsyncOnlyStripe` 型封印が剝がれていないか確認。

## 失敗時の rollback

- Cloud Run 旧 revision に traffic 100%:

  ```sh
  gcloud run services update-traffic <service> --to-revisions=<rev>=100
  ```

- 顧客への二重課金回避: Stripe Dashboard で対象 webhook endpoint を一時的に disable して再送を止める。

## 参考

- Stripe CLI triggers: https://docs.stripe.com/stripe-cli/triggers
- Trigger command wiki (supported events): https://github.com/stripe/stripe-cli/wiki/Trigger-command
- stripe-node Webhooks ソース: https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts
- Bun/WebCrypto runtime example (Cloudflare Pages): https://github.com/stripe/stripe-node/blob/master/testProjects/cloudflare-pages/functions/index.js
- アプリ側型封印: `src/shared/lib/stripe.ts` の `AsyncOnlyStripe`
- アプリ側 ESLint 2 段防御: `eslint.config.mjs` の `stripe-webhook-async-only` config block
