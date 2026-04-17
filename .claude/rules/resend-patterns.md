---
paths:
  - src/shared/lib/email*
  - src/**/api-keys/resend*
  - src/shared/emails/**
---

# Resend SDK パターン（v6+）

> 公式ベストプラクティス準拠 — `{ data, error }` / idempotency key / 自動リトライ

## API 契約（SSoT: `src/shared/lib/email/send.ts`）

メール送信は必ず `sendEmail({ payload, idempotencyKey?, operation, context?, maxRetries? })` 経由で呼ぶ。
`resend.emails.send()` を `*-emails.ts` の外で直接呼ばない（API key 接続テスト `api-keys/resend.ts` のみ例外）。

```typescript
import { sendEmail, hashForKey } from "@/shared/lib/email/send";

return sendEmail({
  payload: {
    to: data.customerEmail,
    subject: `【ご予約確認】${spaceName} - ${date}`,
    react: ReservationConfirmationEmail({
      /* ... */
    }),
  },
  idempotencyKey: `reservation-confirm/${data.reservationId}`,
  operation: "sendReservationConfirmationEmail",
  context: {
    reservationId: data.reservationId,
    customerEmail: data.customerEmail,
  },
});
```

`payload` は Resend `CreateEmailOptions` から `from` を除いた型（`from` は `getFromAddress()` で自動設定）。

## Idempotency Key（公式ベストプラクティス）

**公式推奨形式**: `<event-type>/<entity-id>`（最大 256 文字、24 時間有効）。
retry 時に同一 key で再送すると元レスポンスが返り重複送信を防ぐ。異なる payload を同一 key で送ると 409 エラー。

| 用途                                 | key 形式                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| 安定した ID を持つイベント           | `reservation-confirm/${reservationId}`                       |
| 同一エンティティで複数バリエーション | `reservation-status/${reservationId}/${newStatus}`           |
| 管理者通知（アクション別）           | `reservation-admin/${reservationId}/${action}`               |
| 可変コンテンツの再送（admin reply）  | `inquiry-reply/${inquiryId}/${hashForKey(replyMessage)}`     |
| URL / トークンベース（reset 等）     | `password-reset/${hashForKey(resetUrl)}`                     |
| 配信先ごと（全員通知メール）         | `event-cancelled/${eventId}/${hashForKey(participantEmail)}` |

`hashForKey(value)` は `send.ts` が export する sha256 先頭 32 文字のヘルパー。
email アドレスや resetUrl のような長い文字列・`/` や `#` を含む文字列を key に入れる場合に使う。

**idempotency key を省略してよい場合**:

- webhook 通知のように「発火のたびに新規メール」が正しい挙動のケース
- idempotency key のベースになる安定した識別子が存在しないケース

## 自動リトライ（公式推奨仕様）

`sendEmail` は 429 / 500 系エラーを exponential backoff で最大 3 回まで自動再試行する。
400 / 401 / 403 / 404 / 409 / 422 は即時失敗（公式推奨: リトライしない）。

| `error.name`            | HTTP | 挙動         |
| ----------------------- | ---- | ------------ |
| `rate_limit_exceeded`   | 429  | リトライ対象 |
| `internal_server_error` | 500  | リトライ対象 |
| `application_error`     | 500  | リトライ対象 |
| `validation_error` 他   | 4xx  | 即時失敗     |

バックオフ時間: `INITIAL_BACKOFF_MS * 2^attempt + jitter` → 1s → 2s → 4s（`INITIAL_BACKOFF_MS = 1000`）。
呼び出し側で再試行したくない場合は `maxRetries: 0` を渡す。

## エラーハンドリング

Resend SDK v3+ は例外を投げない。全 API メソッドが `{ data, error }` を返すため、
`sendEmail` 内部で `{ error }` を destructure して判定する。

```typescript
// send.ts の内部実装
const { error } = idempotencyKey
  ? await resend.emails.send(fullPayload, { idempotencyKey })
  : await resend.emails.send(fullPayload);

if (!error) return { success: true };
```

`try/catch` は React Email コンポーネントのレンダリング例外などの保険として残す（API エラーは必ず `{ error }` で返ってくる）。

## 接続テスト（`api-keys/resend.ts` のみ）

```typescript
const resend = new Resend(apiKey);
const { error } = await resend.domains.list();
if (error?.name === "invalid_api_key") {
  /* ... */
}
```

接続テストは `sendEmail` の対象外（単発の読み取り検証のため、retry / idempotency 不要）。

## 禁止事項

- `resend.emails.send()` を `*-emails.ts` / `api-keys/resend.ts` の外で直接呼ぶこと
- `try/catch` のみで API エラーを処理すること（`{ data, error }` を必ず destructure）
- `error.message` をユーザーに直接露出すること（内部詳細漏洩リスク）
- `getResendClient()` の null チェック省略
- idempotency key に生の長大トークンや email アドレスをそのまま入れること（`hashForKey()` でハッシュ化）
- 後方互換のための re-export ファイル（`src/shared/lib/email.ts` 等）の追加

## Gotchas

- **`better-auth` 1.5.x で Prisma アダプターが別パッケージに分離** — `@better-auth/prisma-adapter` を別途インストール必要（`bun add @better-auth/prisma-adapter`）。import パス `better-auth/adapters/prisma` は変わらずコード修正不要
- **Resend SDK v3+（v6 含む）は例外を投げない** — `resend.emails.send()` / `resend.domains.list()` 等はすべて `{ data, error }` を返す（ネットワークエラーも含む）。`try/catch` のみでは API エラーをキャッチできない。必ず `const { error } = await resend.xxx()` で `error` をチェックする
- **Idempotency は 24 時間ウィンドウ** — それを超えた同一 key の送信は新規扱い。リマインダー等「最大 24 時間に 1 回送れば良い」イベントには適合、月次ダイジェストは non-stable suffix（timestamp 等）が必要
- **`resend.emails.send(payload, options)` の 2 引数形式が推奨** — `idempotencyKey` を payload に inline しても動作するが、`send.ts` は第 2 引数形式で統一（公式 AI onboarding ドキュメント準拠）
- **Stripe API version `2026-03-25.dahlia`** — stripe SDK v22 の `LatestApiVersion` に合わせる。SDK アップグレード時は `bun run type-check` の型エラーで新バージョン文字列が判明 → `stripe.ts` の `apiVersion` を更新。v22 では `accounts.retrieve()` に `null` 引数が必須
