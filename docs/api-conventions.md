# API レスポンス規約

`src/app/api/**` の Route Handler が返す JSON レスポンスとステータスコードの SSoT。

## ヘルパー（必須）

`src/app/api/**` の Route Handler は `NextResponse.json(...)` を直接呼ばず、
`@/shared/lib/route-responses` のヘルパー経由でレスポンスを返す。

```ts
import {
  jsonError,
  jsonSuccess,
  jsonValidationError,
  getRouteErrorStatus,
} from "@/shared/lib/route-responses";
```

| ヘルパー                 | 用途                                                                                    | shape               |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------- |
| `jsonSuccess<T>(data)`   | 成功レスポンス（200 デフォルト、201 等カスタム可）                                      | `T`                 |
| `jsonError(msg, status)` | 失敗レスポンス（400 デフォルト）                                                        | `{ error: string }` |
| `jsonValidationError`    | Zod の `ZodError` を最初の issue メッセージで 400 返却                                  | `{ error: string }` |
| `getRouteErrorStatus`    | `checkAdminAuth` / `checkPermission` の `error.error` メッセージから 401/403/400 を判定 | -                   |

## ステータスコード規約

| 状況                                       | code | 例 / 由来                                                                                               |
| ------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------- |
| 成功                                       | 200  | `jsonSuccess(data)`                                                                                     |
| 作成成功                                   | 201  | `jsonSuccess(data, 201)`                                                                                |
| 入力不正（バリデーション失敗）             | 400  | `jsonValidationError(err)` / `jsonError("...が不正です")`                                               |
| **未認証（セッションなし）**               | 401  | `checkAdminAuth` の `"ログインが必要です"`                                                              |
| **認証済 + 権限不足**                      | 403  | `checkPermission` の `"...権限がありません"` / `"管理者権限が必要です"` / `"...アクセス権がありません"` |
| リソース不在                               | 404  | `jsonError("見つかりません", 404)`                                                                      |
| サーバーエラー（DB 例外・外部 API 失敗等） | 500  | `jsonError("...に失敗しました", 500)`                                                                   |

### 401 と 403 の区別

`getRouteErrorStatus` が SSoT。`AuthResult` / `PermissionResult` の
`error.error` メッセージ文字列から自動判定する。

- `"ログイン"` を含む → **401**（未認証 = セッション無し）
- `"権限"` or `"アクセス権"` を含む → **403**（認証済だが権限不足）
- それ以外 → 400

これは `checkAdminAuth` / `checkPermission`
（`src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`）が返す
日本語メッセージ文字列と一致させている。メッセージを変更する場合は
`getRouteErrorStatus` の判定パターンも同時に更新する。

### 典型形

```ts
import {
  jsonError,
  jsonSuccess,
  getRouteErrorStatus,
} from "@/shared/lib/route-responses";
import { checkPermission } from "@/admin/lib/action-auth";

export async function GET(request: Request): Promise<Response> {
  const auth = await checkPermission("event", "read", request.headers);
  if (!auth.success) {
    // 401 (未認証) or 403 (権限不足) を自動判定
    return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
  }

  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    return jsonValidationError(parsed.error);
  }

  const data = await fetchData(parsed.data);
  return jsonSuccess(data);
}
```

## CSV / リダイレクト等の許可リスト

以下は `NextResponse.json` / `jsonSuccess` で表現できないため、
`new Response(...)` / `NextResponse.redirect(...)` の直返しを許可する:

- **CSV エクスポート**（`text/csv`, `Content-Disposition: attachment`）
  - `src/app/api/admin/export/reservations/route.ts`
  - `src/app/api/admin/export/customers/route.ts`
  - `src/app/api/admin/export/event-registrations/route.ts`
- **OAuth コールバックのリダイレクト**（`NextResponse.redirect`）
  - `src/app/api/instagram/oauth/callback/route.ts`
  - その他の OAuth callback route

これら CSV / redirect route であっても、**エラー JSON 応答は
`jsonError` 経由**で返す（成功時のみ直返しが許可）。

## キャッシュヘッダ

`next.config.ts` の `headers()` で SSoT。詳細は
`.claude/rules/route-handlers-and-api.md` および
`project_cloudflare-cdn-cache-control-2026-06-17` の memory entry を参照。

## 関連ルール

- `.claude/rules/route-handlers-and-api.md` — Route Handler / API の規約
- `.claude/rules/admin-server-actions.md` — Server Action / RBAC
- `src/shared/lib/route-responses.ts` — ヘルパー実体
- `__tests__/unit/lib/route-responses.test.ts` — 回帰テスト
