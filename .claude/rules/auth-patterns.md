# 認証パターンルール

> Better Auth 1.4 / RBAC対応

## 概要

Better Authを使用した認証・認可パターン。

## Better Auth公式パターン

### Server Actionsでのセッション取得

```typescript
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const someAuthenticatedAction = async () => {
  "use server"
  const session = await auth.api.getSession({
    headers: await headers()
  })
}
```

### Server Componentsでの認証

```typescript
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    redirect("/sign-in")
  }

  return <h1>Welcome {session.user.name}</h1>
}
```

### nextCookies プラグイン（必須）

Server ActionsでSet-Cookieを正しく処理:

```typescript
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"

export const auth = betterAuth({
  // ...config
  plugins: [nextCookies()]  // 配列の最後に配置
})
```

## 権限階層

```
SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER
```

| ロール | 権限 |
|--------|------|
| `SUPER_ADMIN` | システム全体の管理（ユーザー管理、監査ログ含む） |
| `ADMIN` | コンテンツ管理全般（ユーザー管理除く） |
| `EDITOR` | 割り当てられたページのみ編集可能 |
| `VIEWER` | 閲覧のみ（編集不可） |
| `USER` | 公開ユーザー（管理画面アクセス不可） |

## Server Actionsでの認証

### 基本パターン（checkAdminAuth）

```typescript
import { checkAdminAuth } from '@/admin/lib/action-auth'

export async function myAction(input: Input) {
  // 1. 認証チェック
  const auth = await checkAdminAuth()
  if (!auth.success) return auth.error

  const { user } = auth
  // 2. アクション実行
}
```

### 権限チェック（checkPermission）

```typescript
import { checkPermission } from '@/admin/lib/action-auth'

export async function createSpace(data: SpaceInput) {
  const auth = await checkPermission('space', 'create')
  if (!auth.success) return auth.error

  const { user } = auth
  // アクション実行
}
```

### リソースアクセスチェック（EDITOR用）

```typescript
import { checkResourceAccess } from '@/admin/lib/action-auth'

export async function updatePage(id: string, data: PageInput) {
  const auth = await checkResourceAccess('page', 'update', id)
  if (!auth.success) return auth.error

  const { user } = auth
  // アクション実行
}
```

## セッション取得パターン

### Server Components（cache()でメモ化）

```typescript
import { verifySession, verifyAdminSession } from '@/shared/lib/auth'

// リダイレクト付き（認証必須ページ）
export default async function AdminPage() {
  const user = await verifySession()  // 未認証なら /admin/login へ
  return <div>Welcome, {user.name}</div>
}

// 管理者限定
export default async function SuperAdminPage() {
  const user = await verifyAdminSession()  // ADMIN以外はリダイレクト
}
```

### オプショナル認証（リダイレクトなし）

```typescript
import { getCurrentUser } from '@/shared/lib/auth'

export default async function Page() {
  const user = await getCurrentUser()  // undefined or User
  if (user) {
    return <AuthenticatedView user={user} />
  }
  return <PublicView />
}
```

### Server Actions（cache()不使用）

```typescript
import { getSession, getSessionUser } from '@/shared/lib/auth'

export async function myAction() {
  const session = await getSession()
  const user = getSessionUser(session)
  if (!user) {
    return createFailure('ログインが必要です')
  }
}
```

## 型安全なRole取得

```typescript
import { isValidRole, getRoleFromSession, getSessionUser } from '@/shared/lib/auth'

// セッションからRole取得
const role = getRoleFromSession(session)  // Role | null

// ユーザー取得（roleがRole型に変換済み）
const user = getSessionUser(session)  // User | null
```

## 監査ログ

```typescript
import { logAction } from '@/admin/lib/action-auth'

export async function deleteSpace(id: string) {
  const auth = await checkPermission('space', 'delete')
  if (!auth.success) return auth.error

  await prisma.space.delete({ where: { id } })

  // 監査ログ記録（非同期、失敗無視）
  logAction(auth.user.id, 'delete', 'space', id)

  return createSuccess('削除しました')
}
```

## 禁止事項

1. **認証チェック漏れ禁止**
   - 管理画面のServer Actionsは必ず認証チェック

2. **直接的なroleアクセス禁止**
   - `session.user.role` → `getRoleFromSession(session)` または `getSessionUser(session)`

3. **cache()の誤用禁止**
   - Server Actions内では `getSession()` を使用（cache()不使用）
   - Server Componentsでは `verifySession()` を使用（cache()あり）

4. **権限ハードコード禁止**
   - `user.role === 'ADMIN'` → `checkPermission()` または `hasPermission()`

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/auth.ts` | Better Auth設定、セッション検証 |
| `@/shared/lib/auth-client.ts` | クライアント用認証フック |
| `@/admin/lib/action-auth.ts` | Server Action用認証ヘルパー |
| `@/admin/lib/permissions.ts` | 権限定義、権限チェック関数 |
