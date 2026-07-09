---
paths:
  [
    "src/shared/lib/email/**",
    "src/shared/emails/**",
    "src/shared/lib/stripe.ts",
    "src/shared/lib/r2/**",
    "src/shared/lib/google-api/**",
    "src/shared/lib/calendar-sync/**",
    "src/shared/lib/instagram/**",
    "src/shared/lib/google-business-profile/**",
    "src/shared/lib/analytics/**",
    "src/shared/lib/ical/**",
    "src/app/api/webhooks/**",
    "src/app/api/cron/**",
  ]
---

# 外部連携

## メール（Resend）

- 送信の SSoT は `sendEmail()`（`src/shared/lib/email/send.ts`）。from は自動注入
  （env `EMAIL_FROM` 優先 → DB 設定。`EMAIL_FROM` は秘密キーではないため下記
  「API キーの優先順（DB優先）」の対象外で、この env 優先が正）、replyTo は
  payload 明示 → DB 設定（env 層なし）。リトライは rate_limit / server error 系のみ最大 3 回
- `idempotencyKey` は `<event-type>/<entity-id>` 形式でほぼ全送信に指定する
- API キー未設定・suppression 該当時は例外でなく `{ok: false, reason: "disabled"}` の
  silent no-op。呼び出し側は "disabled" と "error" を区別する
- suppression は Customer レコードのみ追跡（スタッフ/システム宛先は素通り）
- テンプレート追加は component + fixture + `_registry`（satisfies で網羅強制）の
  3 点セット（手順は `add-email-template` skill）

## Stripe

- **Bun では sync `constructEvent` が throw する** → `constructEventAsync` のみ
  （AsyncOnlyStripe 型封印 + ESLint の 2 段防御）
- webhook の状態遷移は `claimReservationAs*` の「updateMany WHERE 排他 claim」で
  副作用を gate する。findUnique → update の 2 ステップに書き換えない
  （並行配信でメール二重送信 race が再発）

## API キーの優先順（DB優先で統一、Settings is canonical）

Resend / Stripe / Turnstile secret / Google Maps / CustomApiKeys は全て **DB優先** →
env はフォールバック（PR #878 で確定した「Settings is canonical」に統一、2026-07-06）。
env 側は `cloudbuild.yaml` に配線されておらず本番では常に undefined
（ローカル開発の利便性のためのフォールバックとしてのみ機能する）。
新しい統合キーを追加する際もこのパターンに従うこと（`turnstile.ts` の
`getTurnstileSecretKey()` をお手本にする）。

## R2（Cloudflare、S3 互換）

- アップロードは magic-byte 検出 MIME で Content-Type / 拡張子を確定する fail-closed 設計
  （クライアント申告の file.type を信用しない）。per-type サイズ上限あり
- `isR2Configured()` は 5 env 全部の AND。client は遅延初期化
  （import 安全・credentials 欠損は呼び出し時 throw）

## Google 系

- Calendar / Business Profile / GA Data API の呼び出しは `withGoogleApiRetry` で包む
  （429/500/503 と特定 403 reason・一時ネットワークエラーのみリトライ）
- GCal 同期のループ防止は「予約ID:」「イベントID:」の**文字列一致**に依存。
  この書式の変更は outbound/inbound/sync/テストの同時更新必須
- calendar-sync の session-level lock は max instance=1 前提。
  外部 API 呼び出しを `$transaction` で包んで xact lock 化するのは禁止 anti-pattern
- Instagram / Google Business Profile は OAuth token lifecycle
  （refresh cron / location-sync）を持つ。public surface では OAuth callback は 404

## cron（src/app/api/cron/\*）

Cloud Scheduler の OIDC Bearer token 検証（fail-closed。詳細は security-auth ルール）が必須。
feature module OFF のジョブは早期 return。新規追加は `add-cron-job` skill 参照。

## その他

- ical-generator は server-only（client からは `@/shared/lib/ical/urls` サブパスのみ）
- GA4/GTM/Clarity は cookie 同意 "accepted" 時のみ、CSP nonce 付きで出力
- 新しい外部通信先は proxy.ts の CSP と frame-sources.ts の両方を更新（詳細は security-auth ルール）
