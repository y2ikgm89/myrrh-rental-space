# SwitchBot webhook operations

SwitchBot sends `changeReport` events to the public Cloud Run service at:

```text
POST https://<public-domain>/api/webhooks/switchbot/<path-token>
```

The path token is stored encrypted in `settings_switchbot.switchbot_webhook_path_token`
(Prisma: `SettingsSwitchbot.switchbotWebhookPathToken`, single row with id `"singleton"`).
SwitchBot does **not** provide inbound webhook signature verification, so authorization
is path-token based (timing-safe compare) plus `deviceMac` tenant binding.

Implementation:

- Route: `src/app/api/webhooks/switchbot/[token]/route.ts`
- Domain: `src/shared/domain/smart-lock/webhook-commands.ts`
- Settings commands: `src/shared/domain/settings/api-key-commands.ts`
- Admin UI: Settings → SwitchBot → **Webhookを登録** / **登録状態を確認** / **URLトークンを更新**

## What the webhook handles

| Payload kind   | `context` signal                                          | Handler                                                                           |
| -------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Command result | `eventName` + `result` (`success` / `failed` / `timeout`) | `processSwitchBotChangeReport` — createKey / deleteKey outcomes (webhook-primary) |
| Lock state     | `lockState` string                                        | `processSwitchBotLockStateReport` — lockState / battery / lastStateAt のみ更新    |

ドア開閉状態 (`lastDoorState`) は webhook では更新されない。route の
`lockStateContextSchema` は `doorState` を持たず、ハンドラにも渡らない。更新経路は
管理画面のスマートロック端末一覧「状態を更新」(`refreshSmartLockDeviceState` →
`GET /devices/{id}/status`) だけで、LOCK_LITE は doorState 非対応なので常に null。

Unknown `deviceMac` values are logged and acknowledged with
`{ "received": true, "handled": false }`. ここで 404 を返さないのは token の有効性を
隠すためではない — path token の検証は body を読む前に終わっているので、この時点の
呼び出し元は既に有効な token を持っている。404 にすると「どの deviceMac が登録済みか」
を教えることになり、加えて SwitchBot 側の再送を誘発する。Invalid JSON returns 400;
wrong/missing token returns 404.

## Register webhook (admin flow)

Prerequisites:

1. SwitchBot integration enabled (`switchbotEnabled`) with valid Open Token + Secret Key saved.
2. Public site URL (`getAppUrl()`) matches the domain SwitchBot can reach (Cloudflare → Cloud Run).

Steps:

1. Open **管理画面 → 設定 → SwitchBot**.
2. Click **Webhookを登録** (`registerSwitchBotWebhookAction`).
3. Server flow:
   - `ensureSwitchBotWebhookPathToken()` — mint token if missing (24-byte base64url).
   - `setupWebhook(credentials, url)` — SwitchBot API `POST /webhook/setupWebhook` with `deviceList: "ALL"`.
4. 成功表示は**トーストではない** — SwitchBot カード内 Webhook ブロックのインライン
   バナーに「Webhookを登録しました」が出る（同画面の他操作は `toast.error` を使うので、
   トーストを探すと見落とす）。webhook URL は UI に返さない（redaction）。

If registration fails, fix credentials/connectivity and retry **Webhookを登録**.
Existing path token is reused until rotation.

## Rotate path token (`rotateSwitchBotWebhookPathToken`)

Use when the URL may be exposed (logs, support ticket, former operator) or during incident response.

Admin: **URLトークンを更新** (`rotateSwitchBotWebhookPathTokenAction`) after confirming the destructive dialog.

Domain sequence (`rotateSwitchBotWebhookPathToken`):

1. Require decrypted SwitchBot credentials (else validation error).
2. Best-effort `deleteWebhook` on SwitchBot for the **old** URL (failures are logged, not blocking).
3. Generate a **new** token (never reuse the old value).
4. Persist new token to DB first — **old path is immediately invalid**.
5. `setupWebhook` with the new URL. If step 5 fails, the old token is **not** restored; use **Webhookを登録** to retry.

Expect a short window where SwitchBot still posts to the old URL until setup completes.

## Failure recovery

### Passcodes stuck in `PENDING`

createKey/deleteKey are asynchronous. Command results arrive via webhook; Device List
poll is a secondary path.

1. Confirm webhook is registered (admin SwitchBot section).
2. Check application logs for `operation: "switchbotWebhook"` / passcode confirmation timeouts.
3. Stale pending records are cleared by the `smart-lock-cleanup` cron
   (`GET /api/cron/smart-lock-cleanup`, 15 分ごと — `terraform/cloud_scheduler.tf`)。
   PENDING は 30 分 (`STALE_PENDING_THRESHOLD_MINUTES`) 経過で FAILED、
   REVOKE_PENDING は 30 分経過で CONFIRMED へ戻る。cron 間隔が 15 分なので確定は
   最大 45 分後。
4. SwitchBot 側の登録状態は管理画面の **登録状態を確認**
   （`checkSwitchBotWebhookRegistrationAction` → `queryWebhookUrls`）で確認する。
   結果は「登録済み / 未登録 / トークン未発行」のみ表示し、webhook URL と path token
   は出さない。未登録なら **Webhookを登録** を実行する。SwitchBot アプリや
   `POST https://api.switch-bot.com/v1.1/webhook/queryWebhook` の手動実行は、
   アプリ側の確認が失敗したときの補助手段。

### Webhook returns 404

- Path token mismatch (rotated URL not registered on SwitchBot side).
- SwitchBot integration disabled or token cleared.
- SwitchBot に登録した URL が公開ホスト以外を指している。ただしその場合は 404 ではなく
  IAP のリダイレクト / 403 になる（`/api/webhooks/*` に surface 分離のゲートは無い）。
  404 が出ている時点で原因は上の 2 つに絞られる。

Fix: save credentials → **Webhookを登録** (or rotate if token compromise suspected).

### Webhook returns 429

Coarse IP/path rate limit in `src/proxy.ts` (`infraEndpointRateLimiter`, 300/min/IP).
Legitimate SwitchBot bursts should stay under this; sustained 429 suggests abuse or
misconfigured retry storm. Check `X-RateLimit-*` headers and Cloud Logging.

### SwitchBot API errors during register/rotate

- Verify Open Token / Secret Key in admin settings.
- Confirm outbound HTTPS to `api.switch-bot.com` from Cloud Run.
- Retry **Webhookを登録** after fixing credentials.

### Clearing SwitchBot integration

`clearSwitchBotSettings` は**破壊的操作**で、「webhook を解除して credentials を消す」
だけではない。資格情報が復号できる場合:

1. CONFIRMED のパスコードを SwitchBot `deleteKey` で**全件物理失効**させる
   — 利用中の顧客が解錠できなくなる。
2. PENDING / REVOKE_PENDING が未解決のまま残っていると
   「未解決のパスコードが残っているため連携をクリアできません」等で**中断**する。
   数分待って再実行するか、`smart-lock-cleanup` の stale 処理（30 分）を待つ。
3. 全パスコードが解消されてから best-effort `deleteWebhook` → credentials と
   `switchbotWebhookPathToken` の null 化に進む。

資格情報が既に失われている場合は失効処理を丸ごとスキップして即クリアするため、
SwitchBot 側の webhook 登録と物理パスコードが残置される（SwitchBot アプリで手動削除）。

## WAF / IP allowlist note

SwitchBot does **not** publish stable egress IP ranges for webhook delivery. Do **not**
rely on GCP Cloud Armor or Cloudflare IP allowlists alone to protect
`/api/webhooks/switchbot/*`.

Recommended edge posture:

- Path token (app layer, fail-closed 404).
- Cloudflare WAF rate limiting on `/api/webhooks/switchbot/*` if needed.
- Optional custom rule to challenge obvious scanner traffic — not SwitchBot IP pinning.

If SwitchBot publishes official IP ranges in the future, document them here before
enabling allowlist rules.

## Related env / infra

| Item                      | Location                                                                |
| ------------------------- | ----------------------------------------------------------------------- |
| Path token crypto purpose | `SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken`                    |
| Proxy rate limit          | `infraEndpointRateLimiter` in `src/shared/lib/rate-limit.ts`            |
| Webhook URL のホスト      | `NEXT_PUBLIC_APP_URL`（未設定時 `NEXT_PUBLIC_BASE_URL`）→ `getAppUrl()` |

`NEXT_PUBLIC_*` は build 時に焼き込まれる。公開ドメインを変更したら、再ビルド・
再デプロイした**あとで** **Webhookを登録** をやり直すこと。やり直さないと SwitchBot 側に
到達不能な旧 URL が残る。しかも `deleteWebhook` に渡す URL は常に**現在の**
`getAppUrl()` から組み立てられるので、旧ドメインの登録はアプリからは二度と解除できない
（SwitchBot アプリで手動削除する）。
