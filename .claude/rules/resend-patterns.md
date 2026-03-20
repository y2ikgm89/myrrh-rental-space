---
paths:
  - src/shared/lib/email*
  - src/**/api-keys/resend*
  - src/shared/emails/**
---

# Resend SDK パターン（v6+）

## エラーハンドリング

Resend SDK v3+ は例外を投げない。全 API メソッドが `{ data, error }` を返す。

```typescript
// ✅ 正しい: { error } を destructure してチェック
const { error } = await resend.emails.send({ ... });
if (error) {
  logError({ message: `Resend send failed: ${error.message}`, ... });
  return { success: false };
}

// ❌ 禁止: try/catch のみに依存
try {
  await resend.emails.send({ ... });
} catch (e) { /* API エラーはここに来ない */ }
```

> `catch` ブロックは React Email レンダリング例外の保険として残してよいが、API エラーは必ず `{ error }` でチェック。

## クライアント取得パターン

```typescript
// 1. 有効性チェック → 2. クライアント取得 → 3. null チェック
if (!isEmailEnabled()) return { success: true };

const resend = getResendClient();
if (!resend) return { success: true };

// 4. 送信
const { error } = await resend.emails.send({ ... });
```

## 接続テスト

```typescript
const resend = new Resend(apiKey);
const { error } = await resend.domains.list();
// error.name === "invalid_api_key" で無効キー判定
```

## 禁止事項

- `try/catch` のみのエラーハンドリング
- `error.message` をユーザーに直接露出（内部詳細漏洩リスク）
- `getResendClient()` の null チェック省略

## Gotchas

- **`better-auth` 1.5.x で Prisma アダプターが別パッケージに分離** — `@better-auth/prisma-adapter` を別途インストール必要（`bun add @better-auth/prisma-adapter`）。import パス `better-auth/adapters/prisma` は変わらずコード修正不要
- **Resend SDK v3+（v6 含む）は例外を投げない** — `resend.emails.send()` / `resend.domains.list()` 等はすべて `{ data, error }` を返す（ネットワークエラーも含む）。`try/catch` のみでは API エラーをキャッチできない。必ず `const { error } = await resend.xxx()` で `error` をチェックする。`catch` ブロックは React Email レンダリング例外の保険として保持する
- **Stripe API version `2026-02-25.clover`** — stripe SDK v20.4.0 のデフォルトバージョン（プレビューではない）。SDK アップグレード時は `bun run type-check` の型エラーで新バージョン文字列が判明 → `stripe.ts` の `apiVersion` を更新。監査時に「余分な `.clover` サフィックス」と誤識別しないこと
