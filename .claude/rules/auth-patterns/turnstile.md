---
description: Cloudflare Turnstile 保護エンドポイント（Better Auth hooks.before パターン + クライアント送信）
paths:
  - src/shared/lib/admin-auth.ts
  - src/shared/lib/turnstile.ts
  - src/shared/lib/turnstile-actions.ts
  - src/shared/components/TurnstileWidget.tsx
---

# Turnstile 保護エンドポイント

> Better Auth `hooks.before` で Cloudflare Turnstile を validation する canonical パターン。

## before hook 実装

`/request-password-reset` / `/reset-password` は `admin-auth.ts` の `hooks.before` で Cloudflare Turnstile 保護。
Better Auth 公式 `captcha` プラグインと**同一の `x-captcha-response` ヘッダー契約**を採用しつつ、DB 管理 secret key との整合のため hook で実装（公式プラグインは静的 `secretKey` を要求するため採用不可）:

```typescript
const TURNSTILE_PROTECTED_ENDPOINTS: ReadonlyMap<string, TurnstileAction> =
  new Map([
    ["/request-password-reset", TURNSTILE_ACTIONS.admin_password_reset_request],
    ["/reset-password", TURNSTILE_ACTIONS.admin_password_reset],
  ]);

hooks: {
  before: createAuthMiddleware(async (ctx) => {
    const expectedAction = TURNSTILE_PROTECTED_ENDPOINTS.get(ctx.path);
    if (!expectedAction) return;
    const token = ctx.headers?.get("x-captcha-response") ?? undefined;
    const result = await validateTurnstile({ token, expectedAction });
    if (!result.success) {
      throw new APIError("BAD_REQUEST", { message: result.error });
    }
  }),
}
```

## クライアント送信パターン

```typescript
// $fetch（Better Auth クライアント型に無い endpoint）
await adminAuthClient.$fetch("/request-password-reset", {
  method: "POST",
  body: { email, redirectTo },
  headers: { "x-captcha-response": turnstileToken },
});

// 型推論される client method
await adminAuthClient.resetPassword({
  newPassword,
  token,
  fetchOptions: { headers: { "x-captcha-response": turnstileToken } },
});
```

## 新規保護エンドポイント追加手順

1. `turnstile-actions.ts` の `TURNSTILE_ACTIONS` に識別子を追加（公式制約: 英数 / `_` / `-`、最大 32 文字）
2. `admin-auth.ts` の `TURNSTILE_PROTECTED_ENDPOINTS` Map に `[path, action]` エントリを追加
3. クライアント該当 endpoint 呼び出しで `fetchOptions.headers["x-captcha-response"]` にトークンを渡す
4. `TurnstileWidget` に `action={TURNSTILE_ACTIONS.xxx}` を指定

## 禁止パターン

- Better Auth 公式 `captcha` プラグインの採用（静的 `secretKey` 要求 → DB 管理方針に非互換）
- `ctx.body` / URL からトークン読み取り（必ず `x-captcha-response` ヘッダー契約を維持。公式 captcha プラグイン互換性のため）
- `validateTurnstile` の結果を `try/catch` で握り潰す（`APIError("BAD_REQUEST")` で throw して Better Auth 標準エラーフローに流す）
