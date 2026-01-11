# 認証・認可

## 概要

Auth.js 5 による認証システム。JWTセッション + ロールベースアクセス制御。

## 技術スタック

| コンポーネント | 技術 |
|--------------|------|
| 認証ライブラリ | Auth.js 5.0.0-beta.30 |
| セッション | JWT (HS256) |
| データベース | Prisma Adapter |
| プロバイダー | Credentials, Google |

## 認証フロー

### 1. ログイン

```
[ログインフォーム] → [signIn()] → [JWT生成] → [Cookie設定]
```

### 2. セッション検証

```
[リクエスト] → [Cookie取得] → [JWT検証] → [ユーザー情報取得]
```

### 3. ログアウト

```
[signOut()] → [Cookie削除]
```

## 実装パターン

### Server Component

```typescript
import { verifyAdminSession } from '@/lib/auth'

export default async function AdminPage() {
  const user = await verifyAdminSession() // 未認証→リダイレクト
  return <Dashboard user={user} />
}
```

### Server Action

```typescript
import { withAuth, createSuccess } from '@/types/server-actions'

export const updateSettings = withAuth(async (user, data: Input) => {
  // user: 認証済み管理者
  // 未認証→ActionFailure返却
  return createSuccess('更新しました')
})
```

### オプショナル認証

```typescript
import { getCurrentUser } from '@/lib/auth'

export default async function PublicPage() {
  const user = await getCurrentUser() // null許容
  return <Page user={user} />
}
```

## JWTペイロード

```typescript
interface JWTPayload {
  sub: string      // ユーザーID
  email: string
  name: string
  role: Role       // ADMIN | EDITOR | VIEWER
  iat: number      // 発行時刻
  exp: number      // 有効期限
}
```

## Cookie設定

```typescript
cookies: {
  sessionToken: {
    name: 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30日
    },
  },
}
```

## RBAC（ロールベースアクセス制御）

### ロール定義

```typescript
enum Role {
  ADMIN = 'ADMIN',   // 全権限
  EDITOR = 'EDITOR', // コンテンツ編集
  VIEWER = 'VIEWER', // 閲覧のみ
}
```

### 権限チェック

```typescript
// 管理者のみ
export const verifyAdminSession = cache(async () => {
  const user = await verifySession()
  if (user.role !== Role.ADMIN) {
    redirect('/admin/login')
  }
  return user
})
```

## Google OAuth連携

Google Calendar連携用のOAuth設定。

```typescript
// src/lib/auth.ts
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  authorization: {
    params: {
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
    },
  },
}),
```

## セキュリティ考慮事項

### ブルートフォース対策

- レート制限（10回/10秒）
- Turnstile bot保護

### セッションハイジャック対策

- HttpOnly Cookie
- Secure属性（本番環境）
- 定期的なトークンローテーション

### CSRF対策

- SameSite=Lax
- Server Actions自動保護
