---
paths:
  - src/app/**
  - src/shared/**
---

# 認証パターンルール

> Better Auth 1.5.3 / RBAC / Next.js 16 対応

## Better Auth 公式パターン

### nextCookies プラグイン（必須）

Server Actions で `Set-Cookie` を正しく処理するために必須。**`plugins` 配列の最後に配置すること**:

```typescript
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
  // ...config
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});
```

### 遅延非同期初期化パターン（本プロジェクト固有）

Better Auth インスタンスは `betterAuth()` をモジュールロード時に同期生成するが、
Google OAuth 資格情報は DB に保存されるため非同期読取が必要。

| 関数                  | 用途                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `baseAuth`            | 型推論専用（`socialProviders` なしで同期生成）                            |
| `getAuth()`           | 実リクエスト用（DB から資格情報を読み、キャッシュ済みインスタンスを返す） |
| `resetAuthInstance()` | 管理画面で OAuth 設定変更時にキャッシュ破棄                               |

### Server Components でのセッション取得（auth.api 直接呼び出し）

```typescript
import { getAuth } from '@/shared/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const auth = await getAuth()
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/admin/login')
  }

  return <h1>Welcome {session.user.name}</h1>
}
```

### Server Actions でのセッション取得（auth.api 直接呼び出し）

```typescript
import { getAuth } from "@/shared/lib/auth";
import { headers } from "next/headers";

const someAuthenticatedAction = async () => {
  "use server";
  const auth = await getAuth();
  const session = await auth.api.getSession({
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

### executeAdminMutation（書き込み系 — 標準パターン）

権限チェック・実行・監査ログ・DomainError ハンドリングを一括処理する。
`@/admin/lib/admin-action` から import。**Server Actions の書き込み操作は原則これを使用**:

```typescript
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { createSuccess } from "@/admin/types/server-actions";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);

  return executeAdminMutation({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    success: (result) => createSuccess("作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

**`executeAdminMutationResult`** — `ActionResult` ではなく `MutationResult<T>` を返す変種（API Route 呼び出し等）:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";

export const updateItem = async (id: string, input: ItemInput) =>
  executeAdminMutationResult({
    resource: "item",
    action: "update",
    resourceId: id,
    execute: async () => updateItemCommand(id, input),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ITEMS);
    },
  });
```

**EDITOR ロール用リソース単位アクセス制御**:

```typescript
return executeAdminMutation({
  resource: "page",
  action: "update",
  resourceId: id,
  checkResourceAccess: true, // ← EDITOR の userPageAssignment チェックを有効化
  execute: async (user) => updatePageCommand(id, parsed.data),
  success: (result) => createSuccess("更新しました", result),
});
```

### checkPermission（API Route 用 — 直接呼び出し）

API Route は `executeAdminMutation` を使わず `checkPermission` を直接呼び出す。
`request.headers` を第3引数に渡す（Server Actions と異なり `headers()` が使えないため）:

```typescript
import { checkPermission } from "@/admin/lib/action-auth";

export async function POST(request: Request) {
  const auth = await checkPermission("media", "create", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }
  // API処理
}
```

### NG パターン

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
}

// NG: Server Actions で checkPermission 直接呼び出し（executeAdminMutation を使う）
export async function createItem(input: ItemInput) {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

---

## セッション取得パターン

### Server Components（`cache()` でリクエスト単位にメモ化）

**Next.js Data Access Layer (DAL) パターン**に準拠。同一リクエスト内で複数回呼び出しても DB アクセスは 1 回のみ:

```typescript
import { verifySession, verifyAdminSession } from '@/shared/lib/auth'

// 認証必須ページ（未認証なら /admin/login にリダイレクト）
export default async function AdminPage() {
  const user = await verifySession()
  return <div>Welcome, {user.name}</div>
}

// SUPER_ADMIN 限定ページ（ADMIN 以外はリダイレクト）
export default async function SuperAdminPage() {
  const user = await verifyAdminSession()
  // ...
}
```

### Server Actions（`cache()` **不使用**）

Server Actions は複数リクエストにまたがるため `cache()` を使用しない:

```typescript
import { getSession, getSessionUser } from "@/shared/lib/auth";
import { createFailure } from "@/shared/types/server-actions";

export async function myAction() {
  const session = await getSession();
  const user = getSessionUser(session);
  if (!user) {
    return createFailure("ログインが必要です");
  }
  // アクション実行（通常は checkAdminAuth/checkPermission を使用）
}
```

### オプショナル認証（リダイレクトなし）

```typescript
import { getCurrentUser } from '@/shared/lib/auth'

export default async function Page() {
  const user = await getCurrentUser()  // User | undefined
  if (user) {
    return <AuthenticatedView user={user} />
  }
  return <PublicView />
}
```

### セッション取得関数の使い分け

| 関数                           | キャッシュ     | 未認証時               | 用途                                             |
| ------------------------------ | -------------- | ---------------------- | ------------------------------------------------ |
| `verifySession()`              | `cache()` あり | リダイレクト           | Server Components（認証必須）                    |
| `verifyAdminSession()`         | `cache()` あり | リダイレクト           | Server Components（SUPER_ADMIN 必須）            |
| `getCurrentUser()`             | `cache()` あり | `undefined` を返す     | Server Components（オプショナル）                |
| `executeAdminMutation()`       | なし           | `ActionFailure` を返す | Server Actions（書き込み系 — **標準パターン**）  |
| `executeAdminMutationResult()` | なし           | `MutationError` を返す | Server Actions（`MutationResult<T>` を返す変種） |
| `checkPermission()`            | なし           | `ActionFailure` を返す | API Route（`request.headers` を第3引数に渡す）   |

---

## 型安全な Role 取得

Better Auth の `additionalFields` は `string` 型で定義されるため、
`getRoleFromSession` / `getSessionUser` で型安全に `Role` enum に変換する:

```typescript
import {
  isValidRole,
  getRoleFromSession,
  getSessionUser,
} from "@/shared/lib/auth";

// セッションから Role を取得（string → Role enum）
const role = getRoleFromSession(session); // Role | null

// ユーザー取得（role が Role 型に変換済み）
const user = getSessionUser(session); // User | null

// isValidRole で個別検証
if (isValidRole(session?.user?.role)) {
  const role = session.user.role; // Role 型に narrowed
}
```

**User 型の定義:**

```typescript
// Better Auth の Session['user'] の role を Role enum に置き換えた型
export type User = Omit<Session["user"], "role"> & {
  role: Role;
};
```

---

## 監査ログ

`executeAdminMutation` は `logAction()` を内部で自動呼び出しするため、手動呼び出し不要。
`resolveAuditResourceId` でリソース ID を動的解決できる:

```typescript
return executeAdminMutation({
  resource: "space",
  action: "create",
  execute: async () => createSpaceCommand(parsed.data),
  success: (result) => createSuccess("作成しました", result),
  // create 操作では execute 後に ID が確定するため resolveAuditResourceId で解決
  resolveAuditResourceId: (data) => data.id,
});
```

API Route 等で `executeAdminMutation` を使わない場合のみ `logAction()` を直接呼び出す:

```typescript
function logAction(
  userId: string,
  action: Action,
  resource: Resource,
  resourceId?: string,
): void;
```

---

## 禁止事項

1. **認証チェック漏れ禁止**
   - 管理画面の書き込み系 Server Actions は `executeAdminMutation` / `executeAdminMutationResult` を使用
   - API Route は `checkPermission()` を直接呼び出す

2. **Server Actions での `checkPermission` 直接呼び出し禁止**
   - `executeAdminMutation` が権限チェック・監査ログ・DomainError ハンドリングを一括処理する
   - 直接 `checkPermission` を使うと監査ログが漏れる

3. **直接的な role アクセス禁止**
   - `session.user.role` を直接比較しない
   - `getRoleFromSession(session)` または `getSessionUser(session)` を使用

4. **`cache()` の誤用禁止**
   - Server Actions 内では `getSession()` を使用（`cache()` 不使用）
   - Server Components では `verifySession()` / `getCurrentUser()` を使用（`cache()` あり）

5. **権限ハードコード禁止**
   - `user.role === 'ADMIN'` → `executeAdminMutation` の `resource`/`action` で宣言的に指定
   - `user.role === Role.ADMIN` の直接比較禁止

6. **HOF（`withPermission` / `withReadPermission`）パターン禁止**
   - Turbopack HMR との互換性のため廃止済み

---

## ファイル配置

| パス                          | 内容                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@/shared/lib/auth.ts`        | Better Auth 設定・遅延初期化・セッション検証ユーティリティ                                               |
| `@/shared/lib/auth-client.ts` | クライアント用認証フック（`authClient`）                                                                 |
| `@/admin/lib/admin-action.ts` | `executeAdminMutation` / `executeAdminMutationResult`（Server Actions 標準認証パターン）                 |
| `@/admin/lib/action-auth.ts`  | 認証プリミティブ（`checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `checkRole`, `logAction`） |
| `@/admin/lib/permissions.ts`  | 権限定義（`ROLE_PERMISSIONS`, `hasPermission`, `userHasResourceAccess`）                                 |
| `@/admin/lib/audit.ts`        | 監査ログ記録（`logUserAction`, `logPermissionDenied`）                                                   |
| `@/admin/lib/role-guards.ts`  | ロール判定ヘルパー（`isEditorRole` 等）                                                                  |
