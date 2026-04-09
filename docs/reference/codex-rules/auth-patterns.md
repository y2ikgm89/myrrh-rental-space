---
paths:
  - src/app/**
  - src/shared/**
---

# 認証パターンルール

> Better Auth 1.6.1 / RBAC / Next.js 16 対応（`package.json` の `better-auth` と一致）

## Better Auth 公式パターン

### nextCookies プラグイン（必須）

Server Actions で `Set-Cookie` を正しく処理するために必須。**`plugins` 配列の最後に配置すること**:

```typescript
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

// 管理者用
export const adminAuth = betterAuth({
  cookiePrefix: "admin-auth",
  // ...config
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});

// 顧客用
export const customerAuth = betterAuth({
  cookiePrefix: "customer-auth",
  basePath: "/api/customer-auth",
  // ...config
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});
```

### 静的初期化パターン

管理者用と顧客用で Better Auth インスタンスを分離:

- `src/shared/lib/admin-auth.ts` で `export const adminAuth = createAdminAuth()` を **モジュールロード時に 1 回だけ** 生成（email/password、`cookiePrefix: "admin-auth"`）
- `src/shared/lib/customer-auth.ts` で `export const customerAuth = createCustomerAuth()` を **モジュールロード時に 1 回だけ** 生成（Google/LINE、`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`）

Google OAuth provider 設定も env / Secret Manager を正本にし、DB から動的に上書きしない。
**`getAuth()` / `resetAuthInstance()` 等の動的 bootstrap は再導入しない**（AGENTS.md）。

### Prisma アダプター + Prisma 7（必須）

- **`prismaAdapter`** には `src/shared/db/prisma.ts` の **`basePrisma`**（`$extends` 前）のみを渡す。アプリ用の拡張済み `prisma` をアダプターに渡さない。
- **`experimental: { joins: true }`** を `betterAuth(...)` に維持（Prisma でセッション取得時の join を公式推奨どおり有効化）。
- 参照: [Better Auth — Prisma — Joins](https://www.better-auth.com/docs/adapters/prisma#joins-experimental)

### Server Components でのセッション取得（adminAuth.api 直接呼び出し）

```typescript
import { adminAuth } from "@/shared/lib/admin-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await adminAuth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/admin/login");
  }

  return <h1>Welcome {session.user.name}</h1>;
}
```

### Server Actions でのセッション取得（adminAuth.api 直接呼び出し）

```typescript
import { adminAuth } from "@/shared/lib/admin-auth";
import { headers } from "next/headers";

const someAuthenticatedAction = async () => {
  "use server";
  const session = await adminAuth.api.getSession({
    headers: await headers(),
  });
};
```

---

## 権限階層

```
SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER
```

| ロール        | 権限                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `SUPER_ADMIN` | システム全体の管理（ユーザー管理・監査ログ含む）                            |
| `ADMIN`       | コンテンツ管理全般（ユーザー管理除く）                                      |
| `EDITOR`      | 割り当てられたページのみ編集可能（`userPageAssignment` でリソース単位制御） |
| `VIEWER`      | 閲覧のみ（編集不可）                                                        |
| `USER`        | 公開ユーザー（管理画面アクセス不可）                                        |

### リソース別アクション一覧

`Resource` 型と `Action` 型は `@/admin/lib/permissions` で定義:

```typescript
type Resource =
  | "space"
  | "location"
  | "spaceCategory"
  | "reservation"
  | "customer"
  | "inquiry"
  | "post"
  | "news"
  | "page"
  | "faq"
  | "terms"
  | "settings"
  | "user"
  | "auditLog"
  | "navigation"
  | "announcementBar"
  | "media"
  | "coupon"
  | "blockTemplate";

type Action = "create" | "read" | "update" | "delete" | "publish" | "manage";

// 権限キー: "resource:action" 形式
type PermissionKey = `${Resource}:${Action}`;
```

---

## Server Action の認証パターン

HOF（Higher-Order Function）パターンは廃止済み。
各 Server Action 内で `checkAdminAuth` / `checkPermission` / `checkResourceAccess` を**直接呼び出す**。

### checkAdminAuth（認証のみ、権限チェックなし）

```typescript
import { checkAdminAuth } from "@/admin/lib/action-auth";

export async function myAction(input: Input) {
  // 1. 認証チェック（管理画面アクセス可能なロールか確認）
  const auth = await checkAdminAuth();
  if (!auth.success) return auth.error;

  const { user } = auth;
  // 2. アクション実行
}
```

### checkPermission（リソース × アクションの権限チェック — 通常はこちらを使用）

```typescript
import { checkPermission } from "@/admin/lib/action-auth";

export async function createSpace(data: SpaceInput) {
  const auth = await checkPermission("space", "create");
  if (!auth.success) return auth.error;

  const { user } = auth;
  // アクション実行
}
```

### checkResourceAccess（EDITOR ロール用のリソース単位アクセス制御）

EDITOR は `userPageAssignment` テーブルで許可されたリソース ID のみアクセス可能。

```typescript
import { checkResourceAccess } from "@/admin/lib/action-auth";

export async function updatePage(id: string, data: PageInput) {
  // EDITOR の場合、id が userPageAssignment に含まれるかチェック
  const auth = await checkResourceAccess("page", "update", id);
  if (!auth.success) return auth.error;

  const { user } = auth;
  // アクション実行
}
```

### checkRole（特定ロール以上が必要なケース）

```typescript
import { checkRole } from "@/admin/lib/action-auth";
import { Role } from "@/shared/generated/prisma/enums";

export async function deleteAuditLog(id: string) {
  // SUPER_ADMIN のみ実行可能な操作
  const auth = await checkRole(Role.SUPER_ADMIN);
  if (!auth.success) return auth.error;

  const { user } = auth;
  // アクション実行
}
```

### NG パターン（認証チェックなし）

```typescript
// NG: 認証チェックなし
export async function deleteSpace(id: string) {
  await prisma.space.delete({ where: { id } });
  return createSuccess("削除しました");
}

// NG: 権限ハードコード
export async function deleteSpace(id: string) {
  const session = await getSession();
  if (session?.user.role !== "SUPER_ADMIN")
    return createFailure("権限がありません");
  // ...
}
```

---

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
import { createFailure } from "@/shared/types/server-actions";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createFailure("ログインが必要です");
  }
  // アクション実行（通常は checkAdminAuth/checkPermission を使用）
}
```

### オプショナル認証（リダイレクトなし）

```typescript
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";

export default async function Page() {
  const user = await getCurrentAdminUser(); // AdminUser | undefined
  if (user) {
    return <AuthenticatedView user={user} />;
  }
  return <PublicView />;
}
```

### セッション取得関数の使い分け

**管理者用（`@/shared/lib/admin-auth`）:**

| 関数                    | キャッシュ     | 未認証時               | 用途                                            |
| ----------------------- | -------------- | ---------------------- | ----------------------------------------------- |
| `verifyAdminSession()`  | `cache()` あり | `/` redirect           | Server Components（DASHBOARD_ROLES 必須）       |
| `getCurrentAdminUser()` | `cache()` あり | `undefined` を返す     | Server Components（オプショナル）               |
| `getAdminSession()`     | なし           | `null` を返す          | Server Actions（直接使用は稀）                  |
| `getAdminSessionUser()` | なし           | `null` を返す          | Server Actions（型安全なユーザー取得）          |
| `checkAdminAuth()`      | なし           | `ActionFailure` を返す | Server Actions（認証のみ）                      |
| `checkPermission()`     | なし           | `ActionFailure` を返す | Server Actions（権限チェック付き — 通常はこれ） |

**顧客用（`@/shared/lib/customer-auth`）:**

| 関数                       | キャッシュ     | 未認証時           | 用途                                         |
| -------------------------- | -------------- | ------------------ | -------------------------------------------- |
| `verifyCustomerSession()`  | なし           | `/login` redirect  | マイページ（CUSTOMER 認証、管理者→`/admin`） |
| `getCurrentCustomerUser()` | `cache()` あり | `undefined` を返す | 公開ページ（オプショナル顧客認証）           |
| `getCustomerSession()`     | なし           | `null` を返す      | マイページ Server Actions                    |
| `getCustomerSessionUser()` | なし           | `null` を返す      | マイページ Server Actions（型安全）          |

---

## 型安全な Role 取得

Better Auth の `additionalFields` は `string` 型で定義されるため、
`getRoleFromSession` / `getSessionUser` で型安全に `Role` enum に変換する:

```typescript
// 管理者用
import { isValidRole, getAdminSessionUser } from "@/shared/lib/admin-auth";

const user = getAdminSessionUser(session); // AdminUser | null

// 顧客用
import { getCustomerSessionUser } from "@/shared/lib/customer-auth";

const user = getCustomerSessionUser(session); // CustomerUser | null

// isValidRole は両モジュールから export（同一実装）
if (isValidRole(session?.user?.role)) {
  const role = session.user.role; // Role 型に narrowed
}
```

**User 型の定義:**

```typescript
// 管理者用（admin-auth.ts）
export type AdminUser = Omit<AdminSession["user"], "role"> & {
  role: Role;
};

// 顧客用（customer-auth.ts）
export type CustomerUser = Omit<CustomerSession["user"], "role"> & {
  role: Role;
};
```

---

## 監査ログ

`logAction()` は非同期（fire-and-forget）で実行。失敗時はエラーログに記録するが、
アクション自体には影響しない:

```typescript
import { checkPermission, logAction } from "@/admin/lib/action-auth";
import { createSuccess } from "@/shared/types/server-actions";

export async function deleteSpace(id: string) {
  const auth = await checkPermission("space", "delete");
  if (!auth.success) return auth.error;

  await prisma.space.delete({ where: { id } });
  updateTag(CACHE_TAGS.SPACES);

  // 監査ログ記録（非同期、失敗しても処理を止めない）
  logAction(auth.user.id, "delete", "space", id);

  return createSuccess("削除しました");
}
```

**`logAction` のシグネチャ:**

```typescript
function logAction(
  userId: string,
  action: Action, // 'create' | 'update' | 'delete' | 'publish' | 'manage'
  resource: Resource,
  resourceId?: string, // オプション（一覧操作の場合は省略）
): void;
```

---

## 禁止事項

1. **認証チェック漏れ禁止**
   - 管理画面のすべての Server Actions は必ず `checkAdminAuth()` または `checkPermission()` を呼び出す

2. **直接的な role アクセス禁止**
   - `session.user.role` を直接比較しない
   - `getRoleFromSession(session)` または `getSessionUser(session)` を使用

3. **`cache()` の誤用禁止**
   - Server Actions 内では `getAdminSession()` / `getCustomerSession()` を使用（`cache()` 不使用）
   - Server Components では `verifyAdminSession()` / `getCurrentAdminUser()` を使用（`cache()` あり）

4. **権限ハードコード禁止**
   - `user.role === 'ADMIN'` → `checkPermission()` または `hasPermission(user.role, resource, action)`
   - `user.role === Role.ADMIN` の直接比較 → `checkRole(Role.ADMIN)` を使用

5. **HOF（`withPermission`）パターン禁止**
   - Turbopack HMR との互換性のため廃止済み
   - 各 Server Action 内で `checkAdminAuth` / `checkPermission` を直接呼び出す

---

## ファイル配置

| パス                                   | 内容                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@/shared/lib/admin-auth.ts`           | 管理者用 Better Auth 設定・セッション検証（`cookiePrefix: "admin-auth"`、email/password）                            |
| `@/shared/lib/admin-auth-client.ts`    | 管理者用認証クライアント（`adminAuthClient`）                                                                        |
| `@/shared/lib/customer-auth.ts`        | 顧客用 Better Auth 設定・セッション検証（`cookiePrefix: "customer-auth"`、Google/LINE）                              |
| `@/shared/lib/customer-auth-client.ts` | 顧客用認証クライアント（`customerAuthClient`）                                                                       |
| `@/admin/lib/action-auth.ts`           | Server Action 用認証ヘルパー（`checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `checkRole`, `logAction`） |
| `@/admin/lib/permissions.ts`           | 権限定義（`ROLE_PERMISSIONS`, `hasPermission`, `userHasResourceAccess`）                                             |
| `@/admin/lib/audit.ts`                 | 監査ログ記録（`logUserAction`, `logPermissionDenied`）                                                               |
| `@/admin/lib/role-guards.ts`           | ロール判定ヘルパー（`isEditorRole` 等）                                                                              |
