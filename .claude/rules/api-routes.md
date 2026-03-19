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
// Stripe Webhook: 署名検証 → イベント処理 → 200 応答
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json(null, { status: 400 });

  const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  // ... イベント処理
  return NextResponse.json({ received: true });
}
```

## Cron パターン

```typescript
// Cron: Authorization ヘッダー検証 → 処理 → ログ
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(null, { status: 401 });
  }
  // ... 処理
  return NextResponse.json({ ok: true });
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
