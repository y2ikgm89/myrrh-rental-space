---
paths:
  - src/shared/lib/email/**
  - src/shared/lib/google-calendar/**
  - src/shared/lib/calendar-sync/**
  - src/shared/lib/cloudflare*
  - src/shared/lib/instagram*
  - src/shared/lib/turnstile*
  - src/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe*
  - src/app/(admin)/admin/(dashboard)/_shared/lib/stripe*
  - src/app/api/webhooks/**
  - src/app/**/api-keys/**
---

# 外部 API 統合 retry パターン

> 外部 API 統合は retry + idempotency の共通契約に従う。新規 SDK 統合時はこのルールを適用する。

## 共通原則（公式ベストプラクティス準拠）

- **リトライ対象**: 429 / 500 / 503 + ネットワークエラー（`ECONNRESET` / `ETIMEDOUT` / `EAI_AGAIN` / `ENOTFOUND` / `ECONNREFUSED`）
- **403 の扱いは `reason` 検査が必要** — 公式仕様で `rateLimitExceeded` / `userRateLimitExceeded` / `quotaExceeded` reason は 429 と機能的に同等（Google Calendar API 公式: _"rateLimitExceeded errors can return either 403 or 429 error codes—functionally similar, respond with exponential backoff"_）。HTTP status だけで判定せず `error.errors[*].reason` と `error.response.data.error.errors[*].reason` 両方を検査する（参照実装: `@/shared/lib/google-calendar/retry.ts` の `extractFirstErrorReason`）
- **即時失敗**: 400 / 401 / 403 (`forbidden` 等 usageLimits 以外) / 404 / 409 / 422（公式推奨: 再試行しない。`invalid_api_key` / `validation_error` 等）
- **Backoff**: `INITIAL_BACKOFF_MS * 2^attempt + jitter`（例: 1s → 2s → 4s + 0-200ms jitter）
- **最大リトライ回数**: 3（公式推奨 3-5 の下限）
- **冪等性**: mutation API には idempotency key / 重複防止識別子を付与

## 実装 SSoT

| 領域            | ヘルパー                                       | 場所                                    |
| --------------- | ---------------------------------------------- | --------------------------------------- |
| Resend          | `sendEmail({ payload, idempotencyKey, ... })`  | `@/shared/lib/email/send.ts`            |
| Google Calendar | `withGoogleApiRetry(() => client.xxx(...))`    | `@/shared/lib/google-calendar/retry.ts` |
| Turnstile       | `validateTurnstile({ token, expectedAction })` | `@/shared/lib/action-helpers.ts`        |

**直接 SDK メソッド呼び出しは禁止**。例外:

- 接続テスト（`domains.list()` / `calendars.get()` 等の単発検証）
- SDK 初期化時の OAuth 設定（`oauth2Client.on('tokens', ...)` 等のイベント登録）
- Turnstile の `verifyTurnstileToken` は `turnstile.ts` 内部のみ（`validateTurnstile` が唯一の公開境界）

## Turnstile 固有の retry 戦略（公式仕様）

Turnstile の siteverify は **token 1 回限り消費** のため通常 retry 不可（再送すると `timeout-or-duplicate` エラーが返る）。
公式推奨は `idempotency_key` + 同一 token の組み合わせで「元の検証結果を再取得」する方式:

- `verifyTurnstileToken` は毎回 `crypto.randomUUID()` で `idempotency_key` を自動生成し siteverify に送信
- network 失敗時は同じ (`token`, `idempotency_key`) ペアで再送すれば元の結果を取得可能（ただし現プロジェクトの retry ループは未実装）
- timeout は公式推奨 10 秒
- `remoteip` を送信してボットスコア精度を向上
- response `action` と呼び出し時 `expectedAction` を突き合わせて token 盗用による action 偽装を防ぐ

**新規 captcha 保護エンドポイント追加時**:

1. `TURNSTILE_ACTIONS` (`@/shared/lib/turnstile-actions`) に識別子を追加（公式制約: 英数/`_`/`-`、最大32文字）
2. クライアント Widget に `action={TURNSTILE_ACTIONS.xxx}` を指定
3. Server Action / API Route で `validateTurnstile({ token, expectedAction: TURNSTILE_ACTIONS.xxx })` を呼ぶ
4. Better Auth エンドポイントの場合は `admin-auth.ts` の `TURNSTILE_PROTECTED_ENDPOINTS` Map に `[path, action]` を追加

## 新規 SDK 統合時のチェックリスト

1. SDK が `{ data, error }` を返すか throw するかを確認
   - Resend: `{ data, error }`
   - googleapis / Stripe: throw (`GaxiosError` / `Stripe.errors.StripeError`)
2. SDK 用 retry wrapper を `@/shared/lib/<service>/retry.ts` に作成（`google-calendar/retry.ts` を参照実装）
   - retry 対象エラーコード / HTTP status の抽出関数（`extractStatusCode` / `extractSystemErrorCode`）
   - `isRetryable<Service>Error(error)` の判定関数
   - `with<Service>Retry<T>(fn)` の実行関数
3. 全 API 呼び出しを wrapper 経由に変更（接続テスト等の例外を除く）
4. idempotency / 重複防止キーの形式を決定
   - Resend: 公式形式 `<event-type>/<entity-id>` / 256 文字以内 / 24 時間有効
   - Stripe: `Idempotency-Key` ヘッダー / 任意文字列 / 24 時間有効
   - サービス側に idempotency がないサービスは request signature ハッシュで代替

## Idempotency Key 設計パターン（Resend 例）

| 用途                         | key 形式                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| 安定 ID 系                   | `reservation-confirm/${reservationId}`                       |
| バリエーション別             | `reservation-status/${id}/${newStatus}`                      |
| アクション別管理者通知       | `reservation-admin/${id}/${action}`                          |
| 可変コンテンツ（admin 返信） | `inquiry-reply/${id}/${hashForKey(replyMessage)}`            |
| URL / トークン（reset 等）   | `password-reset/${hashForKey(resetUrl)}`                     |
| 配信先ごと（全員通知）       | `event-cancelled/${eventId}/${hashForKey(participantEmail)}` |

`hashForKey(value)` は `@/shared/lib/email/send.ts` が export する sha256 先頭 32 文字ヘルパー。email アドレス / resetUrl / トークン等を key に含める場合に使う。

**key を省略してよい場合**:

- webhook / cron 通知のように「発火のたびに新規メール」が正しい挙動
- idempotency key のベースになる安定した識別子が存在しない

## Retry 禁止パターン

```typescript
// NG: try/catch + setTimeout の手書き retry（jitter なし・型安全性なし）
for (let i = 0; i < 3; i++) {
  try {
    return await sdk.method();
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
}

// NG: 全エラーリトライ（400/401/403 まで再試行してレート制限を悪化させる）
try {
  return await sdk.method();
} catch {
  return await sdk.method();
}

// OK: 共通ヘルパー経由（retry 対象判定・backoff・jitter が統一される）
return await withGoogleApiRetry(() => sdk.method());
```

## Cloudflare R2（`@aws-sdk/client-s3`）

- **SSoT ヘルパー**: `uploadFile()` / `deleteFile()` / `deleteFiles()`（`@/shared/lib/r2/{upload,delete}`）経由のみ。`S3Client` や `PutObjectCommand` / `DeleteObjectCommand` の直接 send は `r2/*` 内部のみ許可
- **S3Client**: `getR2Client()`（`@/shared/lib/r2/client`）singleton。`new S3Client(...)` 直接生成禁止
- **リトライ**: AWS SDK v3 が標準の retry（`maxAttempts: 3` + exponential backoff + network / 5xx / throttle 自動対象）を内蔵。カスタム wrapper 不要
- **キー・URL 操作**: `generateStorageKey()` / `buildPublicUrl()` / `extractKeyFromUrl()`（`@/shared/lib/r2/keys`）経由。raw string 組み立て禁止
- **アップロード方式**: Server Action プロキシ（ブラウザ → Server Action → R2）。Presigned URL 未採用（Cloud Run HTTP/1 32 MiB 制約内 + credentials のブラウザ露出回避）
- **Bucket 構成**: 単一 bucket + key prefix（`STORAGE_PREFIXES` = `spaces` / `posts` / `site` / `media`）。prefix 毎の別 bucket は不可
- **非対応 S3 機能**: ACL / KMS 暗号化 / Object Lock / Object Tagging（[R2 公式](https://developers.cloudflare.com/r2/api/s3/api/)）

## 検出 grep（新規直接呼び出しの検出）

```bash
# Resend 直接呼び出しチェック（許可: send.ts, api-keys/resend.ts）
grep -rn "resend\.emails\.send\|new Resend(" src/ | grep -v "email/send.ts\|api-keys/resend.ts"

# Google Calendar 直接呼び出しチェック（許可: retry.ts + oauth.ts/setCredentials）
# events / calendars / channels 配下の全メソッドを検出（将来追加メソッドも拾う）
grep -rnE "(calendar|client)\.(events|calendars|channels)\.[a-zA-Z]+\s*\(" src/ | grep -v "retry\|withGoogleApiRetry"

# Cloudflare R2 直接呼び出しチェック（許可: shared/lib/r2/* 内部のみ）
grep -rnE "new S3Client\(|new (Put|Delete|Get|List|Head|Copy)Object(s)?Command\(" src/ | grep -v "shared/lib/r2/"
```

## 参照実装

- `@/shared/lib/email/send.ts` — Resend 用 SSoT（idempotency + retry）
- `@/shared/lib/google-calendar/retry.ts` — Google Calendar 用 retry wrapper
- `@/shared/lib/google-calendar/events.ts` — retry wrapper 経由の実装例
- `@/shared/lib/r2/client.ts` — R2 S3Client singleton
- `@/shared/lib/r2/upload.ts` — R2 `PutObjectCommand`（`@aws-sdk/client-s3`）
- `@/shared/lib/r2/delete.ts` — R2 `DeleteObject` / `DeleteObjectsCommand`
- `@/shared/lib/r2/keys.ts` — R2 Object key 生成・Public URL 組み立て
- `resend-patterns.md` — Resend SDK 固有のエラーハンドリング詳細
