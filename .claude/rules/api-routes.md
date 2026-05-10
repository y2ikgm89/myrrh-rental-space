---
paths:
  - src/app/api/**
---

# API Routes パターンルール

> Route Handlers / Webhooks / Cron / OAuth コールバックの実装規約

## エラーレスポンス

- **設定依存エラーは 503（500 禁止）** — Webhook トークン未設定・API キー未設定等は `{ status: 503 }`。500 にすると外部サービスが自動リトライを繰り返す
- **`error.message` をレスポンスボディ・URL パラメータに露出禁止** — DB ホスト名・スキーマ名等の内部情報漏洩リスク。`logError()` でサーバー記録のみ、外部には固定メッセージ
- **OAuth コールバックの URL クエリに生エラー禁止** — `?error=${error.message}` はブラウザ履歴に永続。固定の安全メッセージのみ

## API Route の処理順序（必須）

全 Route Handler は以下の順序を厳守する:

1. **認証チェック** (`checkPermission`) — 未認証リクエストを DB アクセス・バリデーション前に弾く
2. **入力バリデーション** (`safeParse`) — 認証済みリクエストのみバリデーションエラーを返す。クエリパラメータの UUID は `z.string().uuid()` で形式チェック（Prisma エラーに頼らない）
3. **ビジネスロジック** — DB 操作・レスポンス生成

```typescript
// NG: バリデーション → 認証（未認証者にパラメータ情報が漏洩）
const parsed = schema.safeParse(input);
if (!parsed.success) return jsonValidationError(parsed.error);
const auth = await checkPermission("media", "read", request.headers);

// OK: 認証 → バリデーション
const auth = await checkPermission("media", "read", request.headers);
if (!auth.success)
  return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
const parsed = schema.safeParse(input);
if (!parsed.success) return jsonValidationError(parsed.error);
```

## Rate Limiting

- **`checkRateLimit(pathname, clientIp)` に一元化**（`proxy.ts` で呼び出し）
- エンドポイント別: `/api/auth` → 10/15分、`/api/admin/login-tokens` → 30/分、その他 → 100/分
- **Webhook・Cron・Cloud Run probe (`/api/live`, `/api/health`) はレート制限対象外**（`proxy.ts` で早期リターン）。Cloud Run probe は `x-forwarded-for` を設定せず `getClientIp()` が `"unknown"` を返すため、burst 時に probe が同一 bucket に合算されて 429 となり liveness 失敗 → コンテナ kill 連鎖の silent bug になる
- **`proxy.ts` のレート制限は Server Actions をカバーしない** — Server Actions はページ URL への POST（`/contact` 等）で、proxy の `/api` 判定をバイパスする。公開フォーム送信には `checkActionRateLimit(formSubmitRateLimiter)` を Server Action 冒頭で呼ぶ。`getClientIpFromHeaders()` で `headers()` 経由の IP 取得

## Webhook パターン

```typescript
// Webhook: 署名検証 → イベント処理 → 200 応答 → unstable_rethrow 必須
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");
    if (!sig) return jsonError("Missing signature", 400);

    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    // ... イベント処理
    return jsonSuccess({ received: true });
  } catch (error) {
    unstable_rethrow(error); // PPR bail out 対策（必須）
    logError(error, { ... });
    return jsonSuccess({ error: "Processing failed" }); // 200 を返す
  }
}
```

### Stripe Checkout Webhook（公式推奨フルセット）

Checkout Session は5イベントで処理する（[公式](https://docs.stripe.com/payments/checkout/fulfill-orders)）:

| イベント                                   | 処理                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `checkout.session.completed`               | `session.payment_status === "paid"` なら即 fulfill。`"unpaid"` なら ID のみ保存 |
| `checkout.session.async_payment_succeeded` | 非同期決済成功 → fulfill                                                        |
| `checkout.session.async_payment_failed`    | 非同期決済失敗 → FAILED                                                         |
| `checkout.session.expired`                 | セッション期限切れ → FAILED                                                     |
| `charge.refunded`                          | 返金 → REFUNDED                                                                 |

**べき等性ガード必須** — 処理前に現在の `paymentStatus` をチェックし、既に処理済みならスキップ（Webhook 重複配信対策）

**atomic claim パターン必須** — `findUnique → update` の 2 ステップ idempotency は並行配信で race window が残り、確認メール / 監査ログが二重実行される。`updateMany({ where: { status: { not: TARGET } } })` の `count` 判定で claim 成否を gate する（→ `prisma-patterns.md` §状態遷移の atomic claim）

````

## Cron パターン

```typescript
// Cron: Authorization ヘッダー検証 → 処理 → ログ → unstable_rethrow 必須
export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "myCron",
    });
    if (authResult) return authResult;
    // ... 処理
    return jsonSuccess({ ok: true });
  } catch (error) {
    unstable_rethrow(error); // PPR bail out 対策（必須）
    logError(error, { ... });
    return jsonError("Internal error", 500);
  }
}
```

## セキュリティ: トークン比較

- **共有秘密トークンの `!==` / `===` 比較禁止** — タイミング攻撃でトークン値が漏洩する。`crypto.timingSafeEqual` を使用
- Google Calendar webhook の実装例: `src/app/api/webhooks/google-calendar/route.ts` の `timingSafeTokenEqual()`

## 禁止事項

1. **個別の `apiRateLimiter.check()` 直接呼び出し禁止** — `checkRateLimit()` に一元化
2. **`NextResponse.json({ error: error.message })` 禁止** — 内部情報漏洩
3. **Webhook で 500 を返すこと禁止** — 外部サービスのリトライ爆発を防止。処理失敗時も 200 を返しログに記録
4. **Cron で `connection()` 使用禁止** — API Route は PPR 対象外
5. **Route Handler の catch ブロックで `unstable_rethrow(error)` 省略禁止** — PPR bail out エラーを握り潰すとビルド時 ERROR ログ。catch 先頭に `unstable_rethrow(error)` を必ず配置
6. **`export const dynamic` は PPR 環境で使用禁止** — `cacheComponents: true` と非互換（ビルドエラー）
7. **Stripe Webhook で `session.payment_status` チェック省略禁止** — `checkout.session.completed` では `"paid"` を確認してから fulfill。非同期決済（`"unpaid"`）は `async_payment_succeeded` を待つ

## CSV Export Route Handler（参照実装）

`src/app/api/admin/export/event-registrations/route.ts` が最新の正本。予約・顧客の既存 Route は `unstable_rethrow` / `logError` が欠落しているため参照しない

## Gotchas

### HTTP セキュリティヘッダー

- **`X-XSS-Protection` ヘッダー追加禁止** — Chromium/Firefox削除済み、`mode=block` はXSS悪用リスクあり。`next.config.ts` headers に新規追加しないこと（削除済み）
- **`Permissions-Policy` に `interest-cohort=()` 追加禁止** — Google FLoC は2022年廃止済み。不要（削除済み）
- **セキュリティヘッダーは `proxy.ts` に一元化（`next.config.ts` への追加禁止）** — nonce のリクエスト毎生成が必須なため。Cache-Control のみ `next.config.ts` で管理。CSP nonce: `Buffer.from(crypto.randomUUID()).toString('base64')`
- **`proxy.ts` の rewrite パスは `createResponse()` と同一ヘッダーセット必須** — `NextResponse.rewrite()` を追加する際は requestHeaders に `x-nonce` / `x-pathname` / `Content-Security-Policy`、レスポンスに `response.headers.set("x-pathname", pathname)` + `applySecurityHeaders()` を必ず設定。欠落するとその URL パスでのみ nonce 伝播が壊れる
- **`style-src` は本番で nonce ベース（`'unsafe-inline'` に戻さない）** — `proxy.ts` で `'nonce-${nonce}'` を設定済み。Next.js が `<style>` タグに自動で nonce を付与。開発時のみ `'unsafe-inline'`（HMR 互換性のため）

### 環境変数

- **`NEXT_PUBLIC_*` はサーバーコードでも `clientEnv` 経由で参照** — `process.env["NEXT_PUBLIC_APP_URL"]` 等の直接参照は型バリデーションを迂回する。`clientEnv.NEXT_PUBLIC_APP_URL` を使用すること（`@/shared/lib/env/client` から import）
- **R2 環境変数は全てオプション** — `env/server.ts` で `.optional()` 設定済み。`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` は未設定でも起動可能（設定なしの場合はファイルアップロード機能が無効化）

## Gotchas

### Stripe 決済

- **Webhook の署名ヘッダー存在チェックを DB 読み取りの前に配置** — `stripe-signature` ヘッダーが無いリクエストを `getStripeSettings()` 等の DB アクセス・復号処理の前に 400 で弾く。偽造リクエストによる不要な DB 負荷を防止
- **Stripe `checkout.session.completed` で即座に fulfill しない** — `session.payment_status === "paid"` を必ずチェック。非同期決済（銀行振込等）は `"unpaid"` で来るため `async_payment_succeeded` を待つ。カード決済のみでも将来の決済手段追加に備える
- **Webhook べき等性ガードは atomic claim で実装** — `findUnique → update` の 2 ステップは並行配信で race window が残るため、`prisma.reservation.updateMany({ where: { id, paymentStatus: { not: PAID } } })` の `count` 判定で排他制御する。relation 込みデータが必要なら claim 成功後に `findUniqueOrThrow` で再取得。`claimReservationAsPaid` (`@/shared/domain/reservations/payment-queries`) が canonical 参照実装
- **`payment_intent` フィールドは `string | PaymentIntent | null`** — `typeof session.payment_intent === "string"` で型安全に取得。`as` 禁止

### CSV Export

- **空結果で 404/エラーを返さない** — `generateCsv` はヘッダーのみの空 CSV を正常に返す。0件は正常状態
- **ステータスラベルは `enums/helpers.ts` の `*_STATUS_LABELS` を使用** — Route にローカル定義禁止。`status-badges.tsx` の Badge ラベルも `helpers.ts` を正本とする
- **ファイル名は `resource-yyyyMMdd.csv`** — イベントタイトル等のユーザー入力値をファイル名に含めない（エンコーディング問題回避）
- **新しい Prisma enum のステータスラベルは `enums/helpers.ts` に `*_STATUS_LABELS` を追加必須** — Badge config と CSV Export Route の両方から参照される Single Source of Truth。追加済み: `RESERVATION_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, `EVENT_STATUS_LABELS`

### Cron / Webhook

- **Cron の排他実行には `pg_try_advisory_lock` を使用** — Cloud Run 複数インスタンスで同時実行されるとトランザクション競合が発生する。`pg_try_advisory_lock(固定ID)` で非ブロッキングロック取得 → 失敗時は `{ skipped: true }` で即時リターン。`finally` で `pg_advisory_unlock` 必須。実装例: `src/app/api/cron/calendar-sync/route.ts`
- **`deleteAccountAction` は削除前に customerId 取得 + 全関連タグ無効化必須** — `auth.api.deleteUser()` は Cascade で Customer/Reservation/Review を削除するため、削除後は customerId を取得不可。削除前に `getCustomerByUserId` で取得し、削除後に `CUSTOMERS`/`RESERVATIONS`/`REVIEWS`/`INQUIRIES`/`EVENTS` + `customers.detail(id)` を全て無効化
````
