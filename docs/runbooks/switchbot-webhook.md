# SwitchBot webhook operations

SwitchBot sends `changeReport` events to the public Cloud Run service at:

```text
POST https://<public-domain>/api/webhooks/switchbot/<path-token>
```

The path token is stored encrypted as `settings_switchbot.switchbotWebhookPathToken`.
SwitchBot does **not** provide inbound webhook signature verification, so authorization
is path-token based (timing-safe compare) plus `deviceMac` tenant binding.

Implementation:

- Route: `src/app/api/webhooks/switchbot/[token]/route.ts`
- Domain: `src/shared/domain/smart-lock/webhook-commands.ts`
- Settings commands: `src/shared/domain/settings/api-key-commands.ts`
- Admin UI: Settings → SwitchBot → **Webhookを登録** / **URLトークンを更新**

## What the webhook handles

| Payload kind   | `context` signal                                          | Handler                                                                           |
| -------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Command result | `eventName` + `result` (`success` / `failed` / `timeout`) | `processSwitchBotChangeReport` — createKey / deleteKey outcomes (webhook-primary) |
| Lock state     | `lockState` string                                        | `processSwitchBotLockStateReport` — lock/door/battery updates                     |

Unknown `deviceMac` values are logged and acknowledged with `{ handled: false }`
(no 404 — avoids leaking token validity). Invalid JSON returns 400; wrong/missing
token returns 404.

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
4. Success toast: 「Webhookを登録しました」. The webhook URL is **not** returned in the UI (redaction).

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
3. Stale pending records may be cleared by cron (`expire-stale-pending`); webhook delay tolerance is ~30 minutes.
4. Re-register webhook if SwitchBot still points at an old URL after failed rotation.

### Webhook returns 404

- Path token mismatch (rotated URL not registered on SwitchBot side).
- SwitchBot integration disabled or token cleared.
- Wrong service (admin surface does not expose this route on public hostname).

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

`clearSwitchBotSettings` best-effort `deleteWebhook` before nulling credentials and
`switchbotWebhookPathToken`. If credentials were already lost, old webhook entries may
remain on SwitchBot until manually removed in the SwitchBot app.

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

| Item                      | Location                                                     |
| ------------------------- | ------------------------------------------------------------ |
| Path token crypto purpose | `SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken`         |
| Proxy rate limit          | `infraEndpointRateLimiter` in `src/shared/lib/rate-limit.ts` |
| Security accepted risk    | `.claude/rules/security-auth.md` (SwitchBot webhook section) |
