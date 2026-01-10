# JWT認証要件定義

> **Note**: このドキュメントにはJWT認証システムの詳細な要件定義が記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。セキュリティポリシーについては、[`SECURITY.md`](./SECURITY.md)を参照してください。

---

## 概要

### JWT認証の目的と背景

このプロジェクトでは、Auth.js 5を使用したJWT（JSON Web Token）セッション戦略を採用しています。JWTセッション戦略は、ステートレスな認証を実現し、スケーラビリティとパフォーマンスの向上を目的としています。

### プロジェクトでの位置づけ

JWT認証は、以下の機能を提供します：

- **認証**: ユーザーのログイン・ログアウト
- **セッション管理**: サーバーサイドでのセッション管理（JWT）
- **認可**: ロールベースアクセス制御（RBAC）
- **セキュリティ**: セキュアなCookie設定とトークン暗号化

### Databaseセッション戦略との比較

| 項目 | JWTセッション | Databaseセッション |
|------|--------------|-------------------|
| **パフォーマンス** | データベースクエリ不要 | 毎回データベースクエリ |
| **スケーラビリティ** | ステートレス（高い） | ステートフル（制限あり） |
| **実装の複雑さ** | シンプル | やや複雑 |
| **セキュリティ** | JWE（暗号化JWT）使用 | データベース依存 |
| **推奨用途** | 本プロジェクト（推奨） | 高度なセッション管理が必要な場合 |

**JWTを選択する理由**:
- パフォーマンス向上（データベースクエリ削減）
- スケーラビリティ（ステートレスアーキテクチャ）
- 実装の簡潔性（Auth.js 5のデフォルト動作）
- セキュリティ（JWEによる暗号化）

---

## 機能要件

### セッション管理

#### JWTトークンの生成と検証

- **生成**: ログイン成功時に`jwt`コールバックでJWTトークンを生成
- **検証**: リクエスト時に`auth()`関数で自動的にJWTトークンを検証
- **暗号化**: JWE（暗号化JWT）を使用してトークンを暗号化（Auth.js 5のデフォルト）

#### セッション有効期限

- **maxAge**: 30日（`30 * 24 * 60 * 60`秒）
  - セッションの最大有効期限
  - この期間を超えると自動的にログアウト

#### セッション更新

- **updateAge**: 24時間（`24 * 60 * 60`秒）
  - セッションが自動更新される間隔
  - この間隔ごとに新しいJWTトークンが生成される

#### セッション無効化（ログアウト）

- **ログアウト時**: CookieからJWTトークンを削除
- **即座の無効化**: ログアウト後、即座にセッションが無効になる

#### 単一アクティブセッション管理

- **要件**: 新規ログイン時に既存セッションを無効化（オプション）
- **実装**: `jwt`コールバックでセッションIDを管理し、新規ログイン時に既存セッションを無効化

### トークン管理

#### JWTペイロード構造

JWTトークンには以下の情報を含めます：

```typescript
{
  sub: string,        // ユーザーID
  email: string,      // メールアドレス
  name: string,       // ユーザー名
  role: 'admin' | 'user', // ロール
  iat: number,        // 発行日時（Unix timestamp）
  exp: number,        // 有効期限（Unix timestamp）
}
```

#### トークン署名と検証

- **署名アルゴリズム**: HS256（推奨）
- **シークレットキー**: `AUTH_SECRET`または`NEXTAUTH_SECRET`環境変数から取得
- **検証**: `auth()`関数で自動的に署名を検証

#### JWE（暗号化JWT）の使用

- **デフォルト動作**: Auth.js 5はJWE（暗号化JWT）をデフォルトで使用
- **暗号化**: サーバーシークレットでトークンを暗号化
- **利点**: トークンが盗まれても、シークレットキーなしでは復号化できない

#### トークン検証

以下の項目を検証します：

- **署名**: トークンの署名が有効か
- **iss（Issuer）**: トークンの発行者が正しいか
- **aud（Audience）**: トークンの受信者が正しいか
- **exp（Expiration）**: トークンが有効期限内か

#### 最小限のペイロード

- **原則**: 必要最小限の情報のみを含める
- **禁止**: 機密情報（パスワード、APIキーなど）を含めない
- **推奨**: ユーザーID、ロール、メールアドレスなどの基本情報のみ

### 認証フロー

#### ログイン時のJWT生成

1. ユーザーがログイン情報を入力
2. `signIn`コールバックで認証を実行
3. 認証成功時、`jwt`コールバックでJWTトークンを生成
4. JWTトークンを暗号化（JWE）
5. 暗号化されたJWTをHttpOnly Cookieに保存

#### リクエスト時のJWT検証

1. リクエストが到着
2. `auth()`関数でCookieからJWTトークンを取得
3. JWTトークンを復号化
4. 署名、有効期限、iss、audを検証
5. 検証成功時、セッション情報を返却

#### セッション更新フロー

1. `updateAge`（24時間）経過後、リクエストが到着
2. `jwt`コールバックが自動的に呼び出される
3. 新しいJWTトークンを生成
4. 新しいJWTトークンを暗号化
5. Cookieを更新

#### ログアウトフロー

1. ユーザーがログアウトを実行
2. `signOut()`関数が呼び出される
3. CookieからJWTトークンを削除
4. セッションが即座に無効化される

#### トークンリフレッシュ実装（OAuthプロバイダー使用時）

OAuthプロバイダー（Google、GitHubなど）を使用する場合、アクセストークンのリフレッシュを実装します：

1. `jwt`コールバックでアクセストークンの有効期限をチェック
2. 期限切れの場合、リフレッシュトークンを使用して新しいアクセストークンを取得
3. 新しいアクセストークンをJWTトークンに保存
4. エラー時は`RefreshTokenError`を設定

---

## 非機能要件

### セキュリティ要件

#### HttpOnly Cookie設定

- **必須**: `httpOnly: true`を設定
- **目的**: XSS（クロスサイトスクリプティング）攻撃対策
- **効果**: JavaScriptからCookieにアクセスできないため、トークンが盗まれにくい

#### Secure Cookie設定

- **本番環境で必須**: `secure: true`を設定
- **目的**: HTTPS接続時のみCookieを送信
- **設定**: `process.env.NODE_ENV === 'production'`で条件分岐

#### SameSite設定

- **推奨値**: `'lax'`または`'strict'`
- **デフォルト**: `'lax'`（Auth.js 5のデフォルト）
- **目的**: CSRF（クロスサイトリクエストフォージェリ）攻撃対策
- **選択基準**:
  - `'lax'`: 一般的なWebアプリケーションに適している（推奨）
  - `'strict'`: より厳格なセキュリティが必要な場合

#### トークン有効期限の適切な設定

- **現在の設定**: maxAge: 30日、updateAge: 24時間
- **検討事項**: 短命なアクセストークン（15-60分）とリフレッシュトークンの組み合わせ
- **推奨**: セキュリティ要件に応じて調整可能

#### シークレットキーの管理

- **開発環境**: `.env.local`ファイルに保存（Gitにコミットしない）
- **本番環境**: Google Secret Managerに保存
- **取得方法**: 環境変数から取得（`process.env.AUTH_SECRET`）

#### 強力なシークレットキー

- **最小長**: 32文字以上
- **推奨**: 256ビット以上のエントロピー
- **生成方法**: `openssl rand -base64 32`またはAuth.jsの推奨方法

#### 定期的なキーローテーション

- **推奨頻度**: 定期的（例: 四半期ごと）
- **実装方法**: 新しいシークレットキーを生成し、段階的に移行
- **注意**: ローテーション中は既存セッションが無効化される可能性がある

### パフォーマンス要件

#### データベースクエリ削減

- **JWTの利点**: セッション検証時にデータベースクエリが不要
- **効果**: レスポンス時間の短縮、データベース負荷の軽減

#### トークン検証の高速化

- **検証方法**: メモリ内での署名検証
- **処理時間**: ミリ秒単位での検証が可能

#### スケーラビリティ（ステートレス）

- **利点**: ステートレスアーキテクチャにより、水平スケーリングが容易
- **効果**: 複数のサーバーインスタンス間でセッション情報を共有する必要がない

### 可用性要件

#### セッション復旧

- **要件**: トークン有効期限内であれば、セッションを復旧可能
- **実装**: `auth()`関数で自動的にセッションを復旧

#### エラーハンドリング

- **無効なトークン**: ログインページにリダイレクト
- **期限切れトークン**: ログインページにリダイレクト
- **検証エラー**: 適切なエラーメッセージを表示

---

## 技術要件

### Auth.js 5設定

#### セッション戦略

```typescript
session: {
  strategy: 'jwt', // デフォルト（データベースプロバイダー未設定時）
}
```

#### JWT設定

```typescript
session: {
  strategy: 'jwt',
  maxAge: 30 * 24 * 60 * 60, // 30日
  updateAge: 24 * 60 * 60,   // 24時間ごとに更新
}
```

#### Cookie設定

```typescript
cookies: {
  sessionToken: {
    name: 'next-auth.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax', // または 'strict'
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    },
  },
}
```

#### JWE（暗号化JWT）の使用

- **デフォルト**: Auth.js 5は自動的にJWEを使用
- **暗号化**: サーバーシークレットでトークンを暗号化
- **設定**: 追加設定は不要（デフォルト動作）

#### カスタムエンコード/デコードのサポート

必要に応じて、カスタムエンコード/デコード関数を実装可能：

```typescript
jwt: {
  async encode({ token, secret, maxAge }) {
    // カスタムエンコードロジック
  },
  async decode({ token, secret }) {
    // カスタムデコードロジック
  },
}
```

#### useSecureCookies設定

```typescript
useSecureCookies: process.env.NODE_ENV === 'production',
```

- **本番環境**: `true`に設定（HTTPS必須）
- **開発環境**: `false`に設定（HTTPでも動作）

### Prisma Adapter統合

#### ユーザー情報の取得（JWT生成時）

- **タイミング**: ログイン時のみデータベースからユーザー情報を取得
- **実装**: `jwt`コールバックでユーザー情報をJWTトークンに保存

#### ロール情報の取得

- **取得方法**: データベースからユーザーのロール情報を取得
- **保存先**: JWTトークンのペイロードに保存

#### データベースクエリの最小化

- **原則**: ログイン時のみデータベースクエリを実行
- **効果**: セッション検証時はデータベースクエリが不要

### Middleware統合

#### JWT検証

```typescript
import { auth } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const session = await auth()
  
  // セッション検証
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}
```

#### ルート保護

- **保護対象**: `/admin`パス配下のすべてのルート
- **実装**: Middlewareで`/admin`パスをチェックし、認証されていない場合はログインページにリダイレクト

#### ロールベースアクセス制御（RBAC）

```typescript
if (request.nextUrl.pathname.startsWith('/admin')) {
  if (!session || session.user.role !== 'admin') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}
```

### コールバック実装

#### jwtコールバック

トークンへのカスタムプロパティ追加：

```typescript
callbacks: {
  async jwt({ token, user, account }) {
    // 初回ログイン時
    if (user) {
      token.id = user.id
      token.role = user.role
    }
    
    // OAuthプロバイダー使用時
    if (account) {
      token.accessToken = account.access_token
      token.refreshToken = account.refresh_token
      token.expiresAt = account.expires_at
    }
    
    return token
  },
}
```

#### sessionコールバック

クライアントに公開するセッションデータの制御：

```typescript
callbacks: {
  async session({ session, token }) {
    // JWTトークンからセッション情報を取得
    if (token) {
      session.user.id = token.id
      session.user.role = token.role
      session.accessToken = token.accessToken
    }
    
    return session
  },
}
```

#### signInコールバック

サインイン制御（メールドメイン制限など）：

```typescript
callbacks: {
  async signIn({ user, account, profile }) {
    // メールドメイン制限
    if (account?.provider === 'google') {
      return profile?.email?.endsWith('@company.com') ?? false
    }
    
    return true
  },
}
```

#### redirectコールバック

リダイレクト動作のカスタマイズ：

```typescript
callbacks: {
  async redirect({ url, baseUrl }) {
    // 相対URLを許可
    if (url.startsWith('/')) {
      return `${baseUrl}${url}`
    }
    
    // 同じオリジンのURLを許可
    if (new URL(url).origin === baseUrl) {
      return url
    }
    
    return baseUrl
  },
}
```

---

## セキュリティ要件（詳細）

### トークンセキュリティ

#### シークレットキーの強度

- **最小長**: 32文字以上
- **推奨**: 256ビット以上のエントロピー
- **生成方法**: 
  ```bash
  openssl rand -base64 32
  ```
  またはAuth.jsの推奨方法

#### トークン署名アルゴリズム

- **推奨**: HS256（HMAC-SHA256）
- **理由**: シンプルで高速、十分なセキュリティ

#### トークンペイロードの最小化

- **原則**: 必要最小限の情報のみを含める
- **含める情報**: ユーザーID、ロール、メールアドレス
- **含めない情報**: パスワード、APIキー、機密情報

#### JWE（暗号化JWT）の使用

- **デフォルト**: NextAuth.js v5は自動的にJWEを使用
- **暗号化**: サーバーシークレットでトークンを暗号化
- **利点**: トークンが盗まれても、シークレットキーなしでは復号化できない

#### トークン検証の徹底

以下の項目を必ず検証：

- **署名**: トークンの署名が有効か
- **iss（Issuer）**: トークンの発行者が正しいか
- **aud（Audience）**: トークンの受信者が正しいか
- **exp（Expiration）**: トークンが有効期限内か

#### 定期的なキーローテーション

- **推奨頻度**: 定期的（例: 四半期ごと）
- **実装方法**: 
  1. 新しいシークレットキーを生成
  2. 環境変数を更新
  3. アプリケーションを再起動
  4. 既存セッションは自動的に無効化される

### Cookieセキュリティ

#### HttpOnly設定

- **必須**: `httpOnly: true`
- **目的**: XSS（クロスサイトスクリプティング）攻撃対策
- **効果**: JavaScriptからCookieにアクセスできない

#### Secure設定

- **本番環境で必須**: `secure: true`
- **目的**: HTTPS接続時のみCookieを送信
- **設定**: `process.env.NODE_ENV === 'production'`で条件分岐

#### SameSite設定

- **推奨値**: `'lax'`または`'strict'`
- **デフォルト**: `'lax'`（Auth.js 5のデフォルト）
- **目的**: CSRF（クロスサイトリクエストフォージェリ）攻撃対策
- **選択基準**:
  - `'lax'`: 一般的なWebアプリケーションに適している（推奨）
  - `'strict'`: より厳格なセキュリティが必要な場合

#### Path設定

- **設定値**: `'/'`
- **目的**: すべてのパスでCookieを送信

#### Domain設定

- **設定**: 必要に応じて設定
- **デフォルト**: 現在のドメイン
- **注意**: サブドメイン間でCookieを共有する場合のみ設定

### セッション管理セキュリティ

#### セッション固定攻撃対策

- **対策**: ログイン成功時に新しいセッションIDを生成
- **実装**: Auth.js 5が自動的に処理

#### トークンリフレッシュ時のセキュリティ

- **要件**: リフレッシュトークンも暗号化して保存
- **実装**: JWEを使用してリフレッシュトークンを暗号化

#### ログアウト時のトークン無効化

- **実装**: CookieからJWTトークンを削除
- **効果**: 即座にセッションが無効化される

#### 単一アクティブセッション管理

- **要件**: 新規ログイン時に既存セッションを無効化（オプション）
- **実装**: `jwt`コールバックでセッションIDを管理し、新規ログイン時に既存セッションを無効化

#### セッション有効期限の適切な設定

- **現在の設定**: maxAge: 30日、updateAge: 24時間
- **検討事項**: セキュリティ要件に応じて調整可能
- **推奨**: 短命なアクセストークン（15-60分）とリフレッシュトークンの組み合わせを検討

---

## 実装要件

### 設定ファイル

#### src/lib/auth.ts

Auth.js設定ファイル：

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      // 認証プロバイダー設定
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日
    updateAge: 24 * 60 * 60,   // 24時間
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  useSecureCookies: process.env.NODE_ENV === 'production',
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    async jwt({ token, user, account }) {
      // JWTコールバック実装
    },
    async session({ session, token }) {
      // セッションコールバック実装
    },
  },
})
```

#### 環境変数設定

**開発環境** (`.env.local`):

```env
AUTH_SECRET=your-secret-key-minimum-32-characters
AUTH_URL=http://localhost:3000
```

**本番環境** (Google Secret Manager):

- `AUTH_SECRET`: 32文字以上のシークレットキー
- `AUTH_URL`: 本番環境のURL（例: `https://example.com`）

**環境変数の説明**:

- `AUTH_SECRET`または`NEXTAUTH_SECRET`: 必須、32文字以上
- `AUTH_URL`または`NEXTAUTH_URL`: 本番環境で必須
- `trustHost: true`: 本番環境で推奨

### Middleware実装

#### src/proxy.ts (Next.js 16)

JWT検証とルート保護：

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export default async function proxy(request: NextRequest) {
  const session = await auth()
  
  // 管理画面の保護
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    
    // ロールベースアクセス制御
    if (session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

### Server Actions統合

#### 認証チェック関数

```typescript
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function requireAuth() {
  const session = await auth()
  
  if (!session) {
    redirect('/login')
  }
  
  return session
}
```

#### ロールチェック関数

```typescript
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function requireAdmin() {
  const session = await auth()
  
  if (!session || session.user.role !== 'admin') {
    redirect('/login')
  }
  
  return session
}
```

#### エラーハンドリング

```typescript
import { auth } from '@/lib/auth'

export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  
  if (!session) {
    throw new Error('Unauthorized')
  }
  
  if (session.user.role !== 'admin') {
    throw new Error('Forbidden')
  }
  
  // 実装
}
```

### Client Components統合

#### セッション状態の取得

**Server Components**:

```typescript
import { auth } from '@/lib/auth'

export default async function Page() {
  const session = await auth()
  
  if (!session) {
    return <div>Not authenticated</div>
  }
  
  return <div>Hello, {session.user.name}</div>
}
```

**Client Components**:

```typescript
'use client'

import { useSession } from 'next-auth/react'

export default function ClientComponent() {
  const { data: session, status } = useSession()
  
  if (status === 'loading') {
    return <div>Loading...</div>
  }
  
  if (!session) {
    return <div>Not authenticated</div>
  }
  
  return <div>Hello, {session.user.name}</div>
}
```

#### ログイン/ログアウトUI

```typescript
'use client'

import { signIn, signOut } from 'next-auth/react'

export default function AuthButtons() {
  return (
    <div>
      <button onClick={() => signIn()}>Sign In</button>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}
```

#### セッション更新

```typescript
'use client'

import { useSession } from 'next-auth/react'

export default function UpdateSession() {
  const { data: session, update } = useSession()
  
  const handleUpdate = async () {
    await update({
      user: {
        name: 'New Name',
      },
    })
  }
  
  return (
    <button onClick={handleUpdate}>
      Update Session
    </button>
  )
}
```

---

## テスト要件

> **Note**: 包括的なテスト要件定義については、[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照してください。このセクションでは、JWT認証に特化したテスト要件を記載します。

**テストフレームワーク**: Bun test（`bun:test`）を使用。詳細は[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照。

### 単体テスト

#### JWT生成・検証のテスト

```typescript
import { describe, it, expect } from 'bun:test'
import { encode, decode } from '@/lib/auth'

describe('JWT', () => {
  it('should generate and verify JWT token', async () => {
    const token = await encode({
      sub: 'user-id',
      email: 'user@example.com',
      role: 'admin',
    })
    
    const decoded = await decode(token)
    
    expect(decoded.sub).toBe('user-id')
    expect(decoded.email).toBe('user@example.com')
    expect(decoded.role).toBe('admin')
  })
})
```

#### セッション更新のテスト

```typescript
import { describe, it, expect } from 'bun:test'
import { updateSession } from '@/lib/auth'

describe('Session Update', () => {
  it('should update session after updateAge', async () => {
    // セッション更新のテスト
  })
})
```

#### ログアウトのテスト

```typescript
import { describe, it, expect } from 'bun:test'
import { signOut } from '@/lib/auth'

describe('Sign Out', () => {
  it('should remove JWT token from cookie', async () => {
    // ログアウトのテスト
  })
})
```

### 統合テスト

**テスト環境**: テスト用データベースを使用。トランザクションを使用したテスト分離を推奨。詳細は[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)の「データベース操作のテスト方法」セクションを参照。

#### 認証フローのテスト

```typescript
import { describe, it, expect } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { signIn, auth } from '@/lib/auth'

describe('Authentication Flow', () => {
  it('should authenticate user and create session', async () => {
    // トランザクション内でテストを実行（自動ロールバック）
    await prisma.$transaction(async (tx) => {
      // テストユーザーの作成
      const user = await tx.user.create({
        data: {
          email: 'user@example.com',
          password: 'hashed-password',
          // ... other fields
        },
      })
      
      await signIn('credentials', {
        email: 'user@example.com',
        password: 'password',
      })
      
      const session = await auth()
      
      expect(session).toBeTruthy()
      expect(session?.user.email).toBe('user@example.com')
    }, { timeout: 10000 })
  })
})
```

#### Middleware統合のテスト

```typescript
import { describe, it, expect } from 'bun:test'
import { middleware } from '@/middleware'

describe('Middleware', () => {
  it('should protect admin routes', async () => {
    // Middleware統合のテスト
  })
})
```

#### Server Actions統合のテスト

**注意**: Server Actionsは統合テストで直接呼び出し、E2Eテストでフロー全体を検証。詳細は[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)の「Server Actionsのテスト」セクションを参照。

```typescript
import { describe, it, expect } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { createSpace } from '@/actions/admin/spaces'

describe('Server Actions', () => {
  it('should check authentication in server actions', async () => {
    // トランザクション内でテストを実行（自動ロールバック）
    await prisma.$transaction(async (tx) => {
      // 認証済みユーザーでServer Actionを呼び出し
      const result = await createSpace({
        name: 'Test Space',
        // ... other fields
      })
      
      expect(result.success).toBe(true)
      // 認証チェック、データベース状態、キャッシュ無効化を検証
    }, { timeout: 10000 })
  })
})
```

### セキュリティテスト

**詳細**: セキュリティテストの包括的な要件については、[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)の「セキュリティテスト」セクションを参照。

#### 無効なトークンのテスト

```typescript
import { describe, it, expect } from 'bun:test'

describe('Security', () => {
  it('should reject invalid token', async () => {
    // 無効なトークンのテスト
  })
})
```

#### 期限切れトークンのテスト

```typescript
import { describe, it, expect } from 'bun:test'

describe('Security', () => {
  it('should reject expired token', async () => {
    // 期限切れトークンのテスト
  })
})
```

#### Cookie設定のテスト

```typescript
import { describe, it, expect } from 'bun:test'

describe('Security', () => {
  it('should set secure cookie in production', async () => {
    // Cookie設定のテスト
  })
})
```

---

## 運用要件

### 監視

#### セッションエラーの監視

- **監視項目**: セッション検証失敗、トークン復号化エラー
- **監視方法**: ログを監視し、異常なパターンを検出
- **アラート**: エラー率が閾値を超えた場合にアラートを送信

#### トークン検証失敗の監視

- **監視項目**: 無効なトークン、期限切れトークン
- **監視方法**: ログを監視し、異常なパターンを検出
- **アラート**: 検証失敗率が閾値を超えた場合にアラートを送信

### ログ

#### 認証成功/失敗のログ

- **ログ項目**: ログイン成功、ログイン失敗、ログアウト
- **ログ形式**: 構造化ログ（JSON形式）
- **ログレベル**: INFO（成功）、WARN（失敗）

#### セッション更新のログ

- **ログ項目**: セッション更新、セッション期限切れ
- **ログ形式**: 構造化ログ（JSON形式）
- **ログレベル**: INFO

### トラブルシューティング

#### よくある問題と解決方法

**問題1: セッションが即座に無効化される**

- **原因**: シークレットキーが変更された
- **解決方法**: 環境変数を確認し、シークレットキーが正しいか確認

**問題2: Cookieが設定されない**

- **原因**: `secure: true`が設定されているが、HTTPSを使用していない
- **解決方法**: 開発環境では`secure: false`に設定

**問題3: ログイン後、リダイレクトがループする**

- **原因**: Middlewareの設定が正しくない
- **解決方法**: Middlewareの設定を確認し、リダイレクト条件を確認

#### デバッグ方法

- **ログレベル**: 開発環境では`DEBUG`レベルでログを出力
- **トークン検証**: トークンの内容を確認（開発環境のみ）
- **Cookie確認**: ブラウザの開発者ツールでCookieを確認

---

## 移行要件（既存システムがある場合）

### Databaseセッションからの移行手順

1. **準備**: 既存のDatabaseセッションデータをバックアップ
2. **設定変更**: Auth.js設定をJWTセッション戦略に変更
3. **テスト**: 開発環境で動作確認
4. **本番移行**: 本番環境に適用
5. **監視**: 移行後の動作を監視

### データ移行（必要に応じて）

- **原則**: JWTセッション戦略では、既存のセッションデータは不要
- **注意**: 移行後、既存セッションは自動的に無効化される

### 段階的移行計画

1. **フェーズ1**: 開発環境でJWTセッション戦略をテスト
2. **フェーズ2**: ステージング環境でテスト
3. **フェーズ3**: 本番環境に適用（メンテナンス時間を設定）
4. **フェーズ4**: 移行後の動作を監視

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書（技術スタック詳細）
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシーとベストプラクティス
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件
- [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) - データベース設計
- [`API.md`](./API.md) - API仕様
- [`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md) - テスト要件定義（包括的なテスト要件、Bun test、Playwright、Prisma 7のベストプラクティス）

### 外部リソース

- [Auth.js Documentation](https://authjs.dev) - Auth.js公式ドキュメント
- [NextAuth.js Documentation](https://next-auth.js.org) - NextAuth.js公式ドキュメント
- [JWT.io](https://jwt.io) - JWT仕様とデバッガー
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html) - JWTセキュリティベストプラクティス

---

## 実装優先順位

1. **フェーズ1**: 基本JWT設定（Auth.js設定、環境変数）
2. **フェーズ2**: 認証フロー実装（ログイン、ログアウト、セッション管理）
3. **フェーズ3**: Middleware統合（ルート保護、RBAC）
4. **フェーズ4**: セキュリティ強化（Cookie設定、トークン検証強化）
5. **フェーズ5**: テスト実装（単体テスト、統合テスト、セキュリティテスト、E2Eテスト）
   - 詳細は[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照

---

## 注意事項

- **Auth.js 5（ベータ版）の制約**: ベータ版のため、安定版リリースを継続監視
- **Prisma Adapterとの互換性**: `@auth/prisma-adapter@2.11.1`との互換性を確認
- **Bunランタイムでの動作確認**: Bun 1.3.5での動作を確認
- **既存のセキュリティポリシーとの整合性**: `docs/SECURITY.md`のセキュリティポリシーと整合
- **最新情報（2025年、Context7取得済み）の反映**:
  - JWE（暗号化JWT）の使用（NextAuth.js v5のデフォルト、サーバーシークレットで暗号化）
  - SameSite設定の検討（'lax'と'strict'の比較、デフォルトは'lax'）
  - Cookie設定: `httpOnly: true`（必須）、`secure: true`（本番環境で必須）
  - `useSecureCookies`設定（本番環境でHTTPS必須）
  - トークンリフレッシュ実装（OAuthプロバイダー使用時、`jwt`コールバックで実装）
  - キーローテーション戦略の実装
  - 単一アクティブセッション管理の実装
  - `jwt`コールバックと`session`コールバックの適切な実装
  - ロールベースアクセス制御（RBAC）の実装パターン
