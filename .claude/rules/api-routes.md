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

## Rate Limiting

- **`checkRateLimit(pathname, clientIp)` に一元化**（`proxy.ts` で呼び出し）
- エンドポイント別: `/api/auth` → 10/15分、`/api/admin/login-tokens` → 30/分、その他 → 100/分
- **Webhook・Cron はレート制限対象外**（`proxy.ts` で早期リターン）

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

## Gotchas

### HTTP セキュリティヘッダー

- **`X-XSS-Protection` ヘッダー追加禁止** — Chromium/Firefox削除済み、`mode=block` はXSS悪用リスクあり。`next.config.ts` headers に新規追加しないこと（削除済み）
- **`Permissions-Policy` に `interest-cohort=()` 追加禁止** — Google FLoC は2022年廃止済み。不要（削除済み）
- **セキュリティヘッダーは `proxy.ts` に一元化（`next.config.ts` への追加禁止）** — nonce のリクエスト毎生成が必須なため。Cache-Control のみ `next.config.ts` で管理。CSP nonce: `Buffer.from(crypto.randomUUID()).toString('base64')`
- **`proxy.ts` の rewrite パスは `createResponse()` と同一ヘッダーセット必須** — `NextResponse.rewrite()` を追加する際は requestHeaders に `x-nonce` / `x-pathname` / `Content-Security-Policy`、レスポンスに `response.headers.set("x-pathname", pathname)` + `applySecurityHeaders()` を必ず設定。欠落するとその URL パスでのみ nonce 伝播が壊れる
- **`style-src` は本番で nonce ベース（`'unsafe-inline'` に戻さない）** — `proxy.ts` で `'nonce-${nonce}'` を設定済み。Next.js が `<style>` タグに自動で nonce を付与。開発時のみ `'unsafe-inline'`（HMR 互換性のため）

### 環境変数

- **`NEXT_PUBLIC_*` はサーバーコードでも `clientEnv` 経由で参照** — `process.env["NEXT_PUBLIC_APP_URL"]` 等の直接参照は型バリデーションを迂回する。`clientEnv.NEXT_PUBLIC_APP_URL` を使用すること（`@/shared/lib/env/client` から import）
- **Supabase 環境変数はオプション** — `env/client.ts` で `.optional()` 設定済み。`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を必須（`z.string()`）に変更しないこと
````
