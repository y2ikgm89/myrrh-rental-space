# 認証・認可

## 概要

Better Auth による認証システム。セッション管理 + ロールベースアクセス制御。

## 技術スタック

| コンポーネント | 技術 |
|--------------|------|
| 認証ライブラリ | Better Auth 1.4.13 |
| セッション | Cookie-based (scrypt) |
| データベース | Prisma Adapter |
| プロバイダー | Email/Password, Google |

## 認証フロー

### 1. ログイン

```
[ログインフォーム] → [signIn.email()] → [セッション生成] → [Cookie設定]
```

### 2. セッション検証

```
[リクエスト] → [Cookie取得] → [セッション検証] → [ユーザー情報取得]
```

### 3. ログアウト

```
[signOut()] → [Cookie削除]
```

## 実装パターン

### Server Component

```typescript
import { verifySession } from '@/lib/auth'

export default async function AdminPage() {
  const user = await verifySession() // 未認証→リダイレクト
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
import { getSession } from '@/lib/auth'

export default async function PublicPage() {
  const session = await getSession() // null許容
  return <Page user={session?.user} />
}
```

## セッション設定

```typescript
session: {
  expiresIn: 60 * 60 * 24 * 30, // 30日（秒）
  updateAge: 60 * 60 * 24,      // 24時間ごとに更新
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5,              // 5分間キャッシュ
  },
}
```

## Cookie設定

```typescript
// Better Auth はセキュアなCookie設定をデフォルトで提供
// HttpOnly, Secure (本番環境), SameSite: Lax
```

## RBAC（ロールベースアクセス制御）

### ロール定義

```typescript
enum Role {
  ADMIN = 'ADMIN',   // 全権限
  EDITOR = 'EDITOR', // コンテンツ編集
  VIEWER = 'VIEWER', // 閲覧のみ
  USER = 'USER',     // デフォルト
}
```

### 権限チェック

```typescript
// 管理者のみ
export const verifySession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user || session.user.role !== Role.ADMIN) {
    redirect('/admin/login')
  }
  return session.user
})
```

## Google OAuth連携

Google Calendar連携用のOAuth設定。

```typescript
// src/lib/auth.ts
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    accessType: 'offline',
    prompt: 'consent',
  },
},
```

## セキュリティ考慮事項

### パスワードハッシュ

- scrypt（Better Auth デフォルト）
- セキュアなソルト生成

### ブルートフォース対策

- レート制限
- Turnstile bot保護

### セッションハイジャック対策

- HttpOnly Cookie
- Secure属性（本番環境）
- 定期的なセッション更新

### CSRF対策

- SameSite=Lax
- Server Actions自動保護

## 環境変数

```bash
# 必須
BETTER_AUTH_SECRET=your-secret-key-at-least-32-characters
BETTER_AUTH_URL=https://your-domain.com

# Google OAuth（オプション）
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```
