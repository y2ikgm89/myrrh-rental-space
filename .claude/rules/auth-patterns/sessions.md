---
description: Better Auth 公式パターン（nextCookies / 静的初期化 / Prisma adapter）+ Server Components / Server Actions / API Route のセッション取得関数使い分け
paths:
  - src/shared/lib/admin-auth.ts
  - src/shared/lib/customer-auth.ts
  - src/app/**/layout.tsx
  - src/app/**/page.tsx
  - src/**/lib/auth/**
---

# Better Auth セッション取得

> Better Auth 公式 nextCookies + 静的初期化 + Prisma 7 adapter 設定 + Server Components / Server Actions のセッション取得関数 SSoT。

## Better Auth 公式パターン

### nextCookies プラグイン（必須）

Server Actions で `Set-Cookie` を正しく処理するために必須。**`plugins` 配列の最後に配置すること**:

```typescript
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

// 管理者用
export const adminAuth = betterAuth({
  cookiePrefix: "admin-auth",
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});

// 顧客用
export const customerAuth = betterAuth({
  cookiePrefix: "customer-auth",
  basePath: "/api/customer-auth",
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});
```

### 静的初期化パターン（本プロジェクト正本）

管理者用と顧客用で Better Auth インスタンスを分離:

- `src/shared/lib/admin-auth.ts` で `export const adminAuth = createAdminAuth()` を **モジュールロード時に 1 回だけ** 生成（email/password、`cookiePrefix: "admin-auth"`）
- `src/shared/lib/customer-auth.ts` で `export const customerAuth = createCustomerAuth()` を **モジュールロード時に 1 回だけ** 生成（Google/LINE、`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`）

Google OAuth は `serverEnv`（env / Secret Manager）を正本とし、**DB から provider を動的に差し替えたり、`getAuth()` / `resetAuthInstance()` で再 bootstrap したりしない**（AGENTS.md の不変条件）。

### Prisma アダプター + Prisma 7（必須設定）

- **アダプターに渡すクライアント**: `$extends` による Decimal 換算などを付けたアプリ用 `prisma` は使わない。`src/shared/db/prisma.ts` の **`basePrisma`（拡張前の `PrismaClient`）** のみを `src/shared/db/better-auth-adapter.ts` から `prismaAdapter(...)` に渡す
- **`generateId: "uuid"`**: DB スキーマが `@db.Uuid` のため `advanced.database.generateId: "uuid"` 必須（[公式](https://www.better-auth.com/docs/concepts/database)）。未設定だと Better Auth がランダム文字列 ID を生成し `invalid input syntax for type uuid` エラー
- **`baseURL`**: `betterAuth({ baseURL: serverEnv.BETTER_AUTH_URL ?? getAppUrl(), ... })` で明示設定（[公式](https://www.better-auth.com/docs/concepts/dynamic-base-url)）

## セッション取得パターン

### Server Components（`cache()` でリクエスト単位にメモ化）

**Next.js Data Access Layer (DAL) パターン**に準拠。同一リクエスト内で複数回呼び出しても DB アクセスは 1 回のみ:

```typescript
import { verifyAdminSession } from "@/shared/lib/admin-auth";

// 管理認証必須ページ（未認証なら /admin/login にリダイレクト、DASHBOARD_ROLES 必須）
export default async function AdminPage() {
  const user = await verifyAdminSession();
  return <div>Welcome, {user.name}</div>;
}
```

### Server Actions（`cache()` **不使用**）

Server Actions は複数リクエストにまたがるため `cache()` を使用しない:

```typescript
import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { createMutationError } from "@/shared/lib/mutation-result";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createMutationError("ログインが必要です");
  }
}
```

**`getAdminSessionUser` / `getCustomerSessionUser` signature** は 2026-05-18 PR #134 で `(session: AdminSession | null)` → `(session: unknown)` に拡張済 (`getCustomerSessionUser` 同様)。内部 `isRecord(session)` + `isValidSessionUser(session.user)` + `isValidRole(role)` の 3 段 type guard で narrow するため、test fixture や Better Auth Session 型と structural mismatch な input でも cast 不要で安全に検証可能。call site (上記 `verifyAdminSession` 等) は wider 型受け取りで backward compatible (`AdminSession | null` も `unknown` の subtype として受理)。

### オプショナル認証（リダイレクトなし）

```typescript
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";

export default async function Page() {
  const user = await getCurrentAdminUser(); // AdminUser | undefined
  if (user) return <AuthenticatedView user={user} />;
  return <PublicView />;
}
```

### セッション取得関数の使い分け

**管理者用（`@/shared/lib/admin-auth`）:**

| 関数                           | キャッシュ     | 未認証時                               | 用途                                             |
| ------------------------------ | -------------- | -------------------------------------- | ------------------------------------------------ |
| `verifyAdminSession()`         | `cache()` あり | `/` redirect                           | Server Components（DASHBOARD_ROLES 必須）        |
| `getCurrentAdminUser()`        | `cache()` あり | `undefined` を返す                     | Server Components（オプショナル）                |
| `getAdminSession()`            | なし           | `null` を返す                          | Server Actions（直接使用は稀）                   |
| `getAdminSessionUser()`        | なし           | `null` を返す                          | Server Actions（型安全にユーザー取得）           |
| `executeAdminMutationResult()` | なし           | `MutationError` を返す                 | Server Actions（書き込み系 — **標準パターン**）  |
| `checkPermission()`            | なし           | `PermissionResult`（`!success`）を返す | API Route（`request.headers` を第 3 引数に渡す） |

**顧客用（`@/shared/lib/customer-auth`）:**

| 関数                       | キャッシュ     | 未認証時           | 用途                                            |
| -------------------------- | -------------- | ------------------ | ----------------------------------------------- |
| `verifyCustomerSession()`  | `cache()` あり | `/login` redirect  | マイページ（CUSTOMER 認証、管理者→`/admin`）    |
| `getCurrentCustomerUser()` | `cache()` あり | `undefined` を返す | 公開ページ（オプショナル顧客認証）              |
| `getCustomerSession()`     | なし           | `null` を返す      | マイページ Server Actions                       |
| `getCustomerSessionUser()` | なし           | `null` を返す      | マイページ Server Actions（型安全ユーザー取得） |
