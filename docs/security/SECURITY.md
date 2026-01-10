# セキュリティポリシーとベストプラクティス

> **Note**: このドキュメントにはセキュリティポリシーとベストプラクティスが記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

---

## セキュリティ方針

このシステムは、以下のセキュリティ原則に基づいて設計・実装されています：

1. **最小権限の原則**: 必要最小限の権限のみを付与
2. **多層防御**: 複数のセキュリティ層で保護
3. **セキュリティバイデザイン**: 設計段階からセキュリティを考慮
4. **定期的な監査**: セキュリティ脆弱性の定期的な確認と修正

---

## 認証・認可

### 認証システム

- **Auth.js 5**: 業界標準の認証ライブラリを使用
- **JWTセッション**: サーバーサイドでセッション管理
- **セキュアなCookie設定**:
  - `HttpOnly`: JavaScriptからのアクセスを防止
  - `Secure`: HTTPS接続時のみ送信
  - `SameSite=Strict`: CSRF攻撃を防止

### セッション管理

**重要**: Prisma 7では、`@/generated/prisma/client`からPrismaClientをインポートします。

```typescript
// ✅ 良い例: Auth.js 5の設定（Prisma 7対応）
// src/lib/auth.ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { PrismaClient } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  ...authConfig,
})
```

**セッション設定**:

```typescript
// auth.config.ts
export default {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日
    updateAge: 24 * 60 * 60, // 24時間ごとに更新
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
}
```

**重要なポイント**:
- **Prisma 7対応**: `@/generated/prisma/client`からPrismaClientをインポート
- **JWTセッション推奨**: パフォーマンス向上のため、JWTセッション戦略を推奨
- **Prisma Adapter**: `@auth/prisma-adapter`を使用（`@next-auth/prisma-adapter`は非推奨）

### 認可（ロールベースアクセス制御）

- **管理者 (`admin`)**: すべての操作が可能
- **一般ユーザー (`user`)**: 予約作成、お問い合わせ送信のみ

### ルート保護

```typescript
// src/proxy.ts (Next.js 16)
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export default async function proxy(request: NextRequest) {
  const session = await auth()
  
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!session || session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }
  
  return NextResponse.next()
}
```

**注意**: Auth.js 5では`auth()`メソッドを使用します。`getServerSession`は非推奨です。

### ログインページへのアクセス制限

管理画面のログインページ（`/admin/login`）へのアクセスは、シークレットトークンまたはワンタイムトークンで制限されています。これにより、URLを知っている人だけがログインページにアクセスできるようになります。

**環境変数の設定（必須）**:

```bash
# .env.local (開発環境)
ADMIN_LOGIN_TOKEN=your-secret-token-here

# Google Secret Manager (本番環境)
ADMIN_LOGIN_TOKEN=your-production-secret-token-here
```

**重要**: `ADMIN_LOGIN_TOKEN` 環境変数は開発環境・本番環境ともに**必須**です。設定されていない場合、アプリケーションは起動時にエラーを返します。

**スタッフへのログインURL共有方法**:

#### 方法1: トークン生成（推奨）

1. 管理画面のダッシュボードにアクセス
2. 「スタッフ用ログインURL生成」セクションで「新しいログインURLを生成」をクリック
3. 生成されたURLをスタッフに共有
   - 生成されたURLは30日間有効
   - **使用されるたびに自動的に30日間延長される**（定期的に使用されるトークンは自動的に延長されるため、新しいトークンを生成する必要はありません）
   - 有効期限内であれば複数回使用可能（別日に再度ログインする場合も同じURLを使用可能）
   - セキュリティ上、より安全な方法

#### 方法2: 環境変数トークンを使用（開発・緊急時のみ）

1. 環境変数 `ADMIN_LOGIN_TOKEN` の値を確認
2. ログインページにアクセスする際は、`?token=your-secret-token-here` を付与
   - 例: `https://example.com/admin/login?token=your-secret-token-here`
3. この方法は永続的に有効なため、セキュリティリスクが高い

**実装の詳細**:

- `proxy.ts` で起動時に環境変数の存在を検証（未設定の場合はエラー）
- ログインページへのアクセス時に以下の順序でトークンを検証:
  1. 環境変数のトークンと一致するかチェック
  2. 生成されたトークンがデータベースに存在し、有効期限内かチェック
- 有効なトークンの場合のみログインページを表示
- **ログイン成功時に有効期限を自動延長**: スタッフがログインに成功した際に、有効期限が30日間自動的に延長される
  - 定期的にログインされるトークンは自動的に延長されるため、新しいトークンを生成する必要はない
  - 使用されなくなったトークンは期限切れになる（セキュリティ上良い）
- 生成されたトークンは有効期限内であれば複数回使用可能（別日に再度ログインする場合も同じURLを使用可能）
- 未認証ユーザーが管理画面にアクセスした際は、トークン付きURLにリダイレクト

**セキュリティ上の注意**:

- **ワンタイムトークン生成を推奨**: より安全で、使用後に自動的に無効化される
- 環境変数のトークンは開発・緊急時のみ使用（永続的に有効なため）
- トークンは推測困難な長いランダム文字列を使用（推奨: 32文字以上）
- 環境変数は開発環境・本番環境ともに必須
- 環境変数のトークンは定期的に変更することを推奨

### Server Actionsでの権限チェック

```typescript
// src/actions/admin/spaces.ts
'use server'

import { auth } from '@/lib/auth'

export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  // ... 実装
}
```

**注意**: Auth.js 5では`auth()`メソッドを使用します。`getServerSession`は非推奨です。

---

## 入力検証

### Zodスキーマバリデーション

すべてのユーザー入力はZodスキーマで検証します。

```typescript
// src/lib/validations/space.ts
import { z } from 'zod'

export const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  address: z.string().min(1).max(200),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
  // ...
})
```

### クライアントサイドとサーバーサイドの両方で検証

1. **クライアントサイド**: ユーザーエクスペリエンス向上
2. **サーバーサイド**: セキュリティ確保（必須）

### ファイルアップロードの検証

**画像ファイル**:
```typescript
// 画像ファイルサイズチェック（用途に応じて異なる）
const maxImageSize = 10 * 1024 * 1024 // 10MB（スペース管理用）
// または
const maxImageSize = 5 * 1024 * 1024 // 5MB（ブログ管理用）

if (file.size > maxImageSize) {
  throw new Error(`File size exceeds ${maxImageSize / 1024 / 1024}MB`)
}

// 画像ファイル形式チェック
const allowedImageTypes = [
  'image/jpeg',  // JPEG
  'image/png',   // PNG
  'image/webp',  // WebP
  'image/avif'   // AVIF（次世代画像フォーマット、高圧縮率）
]
if (!allowedImageTypes.includes(file.type)) {
  throw new Error('Invalid image file type. Allowed: JPEG, PNG, WebP, AVIF')
}
```

**動画ファイル**:
```typescript
// 動画ファイルサイズチェック（用途に応じて異なる）
const maxVideoSize = 100 * 1024 * 1024 // 100MB（スペース紹介動画用）
// または
const maxVideoSize = 50 * 1024 * 1024 // 50MB（ブログ埋め込み動画用）

if (file.size > maxVideoSize) {
  throw new Error(`File size exceeds ${maxVideoSize / 1024 / 1024}MB`)
}

// 動画ファイル形式チェック
const allowedVideoTypes = [
  'video/mp4',   // MP4（H.264コーデック推奨、広くサポート）
  'video/webm'   // WebM（オープン形式、モダンブラウザでサポート）
]
if (!allowedVideoTypes.includes(file.type)) {
  throw new Error('Invalid video file type. Allowed: MP4 (H.264), WebM')
}

// 動画のコーデック検証（オプション、より厳密な検証が必要な場合）
// MP4ファイルの場合はH.264コーデックを推奨（H.265/HEVCは現時点では対応しない）
// WebMファイルの場合はVP8またはVP9コーデックを推奨

// 注意: H.265（HEVC）コーデックは現時点では対応しない
// 理由:
// 1. Firefoxが特許ライセンス問題でサポートしていない
// 2. 一部のPCでハードウェアデコーダーが無効化されている場合がある
// 3. すべてのユーザー環境で確実に再生できるとは限らない
```

---

## SQLインジェクション対策

### Prisma ORMの使用

Prisma ORMは自動的にパラメータ化クエリを使用するため、SQLインジェクション攻撃を防止します。

```typescript
// ✅ 安全
const user = await prisma.user.findUnique({
  where: { email: userEmail },
})

// ❌ 危険（Prismaでは不可能）
// const query = `SELECT * FROM users WHERE email = '${userEmail}'`
```

### 生のSQLクエリの使用を避ける

可能な限りPrisma ORMを使用し、生のSQLクエリは避けます。必要な場合は、必ずパラメータ化クエリを使用します。

---

## XSS（クロスサイトスクリプティング）対策

### Reactの自動エスケープ

ReactはデフォルトでXSS攻撃を防止します。

```typescript
// ✅ 安全（Reactが自動エスケープ）
<div>{userInput}</div>

// ❌ 危険（使用を避ける）
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### サニタイゼーション

ユーザー入力のHTMLを表示する必要がある場合は、適切なサニタイゼーションライブラリ（例: `DOMPurify`）を使用します。

---

## セキュリティヘッダーの設定

> **Note**: セキュリティヘッダーの詳細な要件定義については、[`ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md)を参照してください。

### next.config.jsでの設定

`next.config.js`でセキュリティヘッダーを設定します。

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
    ].join('; '),
  },
]

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

### セキュリティヘッダーの説明

- **X-DNS-Prefetch-Control**: DNSプリフェッチの制御
- **Strict-Transport-Security**: HSTSの設定（HTTPS接続を強制）
- **X-Frame-Options**: クリックジャッキング対策（`SAMEORIGIN`で同一オリジンのみ許可）
- **X-Content-Type-Options**: MIMEタイプスニッフィング対策
- **X-XSS-Protection**: XSS対策（レガシーブラウザ用）
- **Referrer-Policy**: リファラー情報の制御
- **Content-Security-Policy**: CSPの設定（XSS攻撃の緩和）

---

## CSRF（クロスサイトリクエストフォージェリ）対策

> **Note**: CSRF対策の詳細な要件定義については、[`ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md)を参照してください。

### Next.js標準機能

Next.jsのServer Actionsは自動的にCSRF保護を提供します。すべてのフォーム送信とデータ変更はServer Actionsを使用します。

### Auth.jsの内蔵機能

Auth.jsはCSRF保護を内蔵しています。認証関連のリクエストは自動的に保護されます。

### SameSite Cookie

セッションCookieに`SameSite=Strict`を設定することで、CSRF攻撃を防止します。

```typescript
// src/lib/auth.ts
export const authOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日
    updateAge: 24 * 60 * 60, // 24時間ごとに更新
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
}
```

### Server ActionsでのCSRF保護

Server Actionsは自動的にCSRFトークンを検証します。追加の設定は不要です。

```typescript
// ✅ 良い例: Server Action（自動的にCSRF保護）
'use server'

export async function createSpace(formData: FormData) {
  // CSRF保護は自動的に適用される
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  // ... 実装
}
```

---

## 環境変数管理

### 開発環境

- `.env.local`を使用（Gitにコミットしない）
- `.env.example`にテンプレートを記載（機密情報は含めない）

### 本番環境

- Google Secret Managerを使用
- 環境変数のバリデーションを起動時に実行

```typescript
// src/config/env.ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  // ...
})

export const env = envSchema.parse(process.env)
```

### 機密情報のハードコード禁止

- APIキー、パスワード、シークレットをソースコードに直接記述しない
- 環境変数またはSecret Managerから取得

---

## データベースセキュリティ

### Row Level Security (RLS)

SupabaseのRow Level Securityを設定して、データベースレベルでアクセス制御を行います。

```sql
-- 例: ユーザーは自分の予約のみ閲覧可能
CREATE POLICY "Users can view their own reservations"
ON reservations
FOR SELECT
USING (auth.uid() = "userId");
```

### 接続セキュリティ

- SSL/TLS接続を強制
- 接続プーリングURLを使用
- IP制限の設定（必要に応じて）

---

## レート制限

### グローバルレート制限（DDoS対策）

全リクエストに対してIPアドレスベースのグローバルレート制限を適用します。

```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// グローバルレート制限（DDoS対策用）
const globalRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '15 m'), // 15分間に100回
})

export async function checkGlobalRateLimit(ipAddress: string) {
  const { success } = await globalRatelimit.limit(`global:${ipAddress}`)
  return success
}
```

**詳細**: [`DDOS_PROTECTION_REQUIREMENTS.md`](./DDOS_PROTECTION_REQUIREMENTS.md)を参照してください。

### ログイン試行回数制限

```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 15分間に5回
})

export async function checkRateLimit(identifier: string) {
  const { success } = await ratelimit.limit(identifier)
  return success
}
```

### エンドポイント別レート制限

以下のエンドポイントに対して個別のレート制限を設定します：

- **予約フォーム**: 15分間に5回（`Ratelimit.slidingWindow(5, '15 m')`）
- **お問い合わせフォーム**: 15分間に3回（`Ratelimit.slidingWindow(3, '15 m')`）
- **ログインフォーム**: 15分間に5回（`Ratelimit.slidingWindow(5, '15 m')`）

**詳細**: [`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md)を参照してください。

### APIレート制限

Route HandlersとServer Actionsでレート制限を実装します。

#### Route Handlersでのレート制限

```typescript
// src/app/api/spaces/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 1分間に100回
})

export async function GET(request: NextRequest) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  
  const { success } = await ratelimit.limit(`api:${ip}`)
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }
  
  // ... 実装
}
```

#### Server Actionsでのレート制限

```typescript
// src/actions/reservation.ts
'use server'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 15分間に5回
})

export async function createReservation(data: ReservationData) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  
  const { success } = await ratelimit.limit(`reservation:${ip}`)
  
  if (!success) {
    throw new Error('Rate limit exceeded')
  }
  
  // ... 実装
}
```

#### レート制限の設定

エンドポイントごとに適切なレート制限を設定します：

- **認証エンドポイント**: 10リクエスト/10秒
- **フォーム送信**: 5リクエスト/分
- **API Routes**: 100リクエスト/分
- **その他**: エンドポイントごとに適切な設定

### Bot対策

#### Cloudflare Turnstile

フォーム送信時のBot対策として、Cloudflare Turnstileを導入します。

**統合方法**:
- 予約フォーム、お問い合わせフォーム、ログインフォームにTurnstileウィジェットを統合
- Server Actions内でTurnstile検証を実行
- レート制限と併用して多層防御を実現

**詳細**: [`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md)を参照してください。

#### Cloudflare Bot Fight Mode

既存のCloudflare Bot Fight ModeとTurnstileを併用して、より強固なセキュリティを実現します。

**詳細**: [`CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md)を参照してください。

### IPブロック機能

異常アクセス検出時や手動でIPアドレスをブロックする機能を実装します。

**機能**:
- 自動IPブロック（異常アクセス検出時）
- 手動IPブロック（管理画面）
- IPブロックリストの管理（ホワイトリスト、ブラックリスト）

**詳細**: [`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md)を参照してください。

---

## セキュリティヘッダー

### 現在の設定（基本レベル）

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com;"
  },
]

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

### 最高レベルの設定（推奨）

2026-01-05時点のOWASPベストプラクティスに基づく最高レベルの設定：

```typescript
// next.config.js
const securityHeaders = [
  // DNS Prefetch Control（パフォーマンス最適化）
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  // HSTS（HTTP Strict Transport Security）
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  // X-Frame-Options（クリックジャッキング対策）
  // より厳格な設定: SAMEORIGIN → DENY
  {
    key: 'X-Frame-Options',
    value: 'DENY' // すべてのフレーム埋め込みを拒否
  },
  // X-Content-Type-Options（MIMEスニッフィング対策）
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  // X-XSS-Protection（モダンブラウザではCSPで十分だが、レガシーブラウザ対応のため設定）
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  // Referrer-Policy（最新推奨値）
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin' // origin-when-cross-origin から更新
  },
  // Permissions-Policy（旧Feature-Policy、ブラウザ機能制御）
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'battery=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=()',
      'execution-while-not-rendered=()',
      'execution-while-out-of-viewport=()',
      'fullscreen=()',
      'geolocation=()',
      'gyroscope=()',
      'keyboard-map=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'navigation-override=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()',
    ].join(', ')
  },
  // Content-Security-Policy（厳格な設定）
  // 注意: unsafe-eval と unsafe-inline を削除し、nonce/hashベースに移行推奨
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'strict-dynamic' https://challenges.cloudflare.com", // Cloudflare Turnstile用
      "style-src 'self' 'unsafe-inline'", // Next.jsのスタイル要件のため一時的に許可
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "frame-src 'self' https://challenges.cloudflare.com", // Cloudflare Turnstile用
      "connect-src 'self' https://challenges.cloudflare.com", // Cloudflare Turnstile Siteverify API用
      "object-src 'none'", // Flash等のプラグインを無効化
      "base-uri 'self'", // baseタグの注入を防止
      "form-action 'self'",
      "frame-ancestors 'none'", // X-Frame-Optionsの代替（CSP Level 3）
      "upgrade-insecure-requests", // HTTPをHTTPSに自動アップグレード
    ].join('; ')
  },
]

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

### 改善点の詳細

#### 1. X-Frame-Options: `SAMEORIGIN` → `DENY`
- **現在**: 同一オリジンからのフレーム埋め込みを許可
- **推奨**: すべてのフレーム埋め込みを拒否（より厳格）
- **注意**: 自サイト内でiframeを使用する場合は`SAMEORIGIN`のまま

#### 2. Referrer-Policy: `origin-when-cross-origin` → `strict-origin-when-cross-origin`
- **現在**: クロスオリジン時はオリジンのみ送信
- **推奨**: HTTPS→HTTPSの場合はオリジン、HTTPS→HTTPの場合は送信しない（より安全）

#### 3. Content-Security-Policy: `unsafe-eval`と`unsafe-inline`の削除
- **現在**: `unsafe-eval`と`unsafe-inline`が含まれており、XSS攻撃のリスクが高い
- **推奨**: 
  - `'strict-dynamic'`を使用して信頼されたスクリプトから読み込まれたスクリプトのみ実行
  - インラインスクリプトにはnonceまたはhashを使用
  - Next.jsのスタイル要件のため、`style-src`の`unsafe-inline`は一時的に許可（可能であればnonceベースに移行）
  - **Cloudflare Turnstile統合**: `script-src`、`frame-src`、`connect-src`に`https://challenges.cloudflare.com`を追加（詳細は[`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md)を参照）

#### 4. Permissions-Policy: 追加
- **現在**: 設定なし
- **推奨**: 不要なブラウザ機能（カメラ、マイク、位置情報など）を明示的に無効化

#### 5. CSPの追加ディレクティブ
- `object-src 'none'`: Flash等のプラグインを無効化
- `base-uri 'self'`: baseタグの注入を防止
- `form-action 'self'`: フォーム送信先を制限
- `frame-ancestors 'none'`: X-Frame-Optionsの代替（CSP Level 3）
- `upgrade-insecure-requests`: HTTPをHTTPSに自動アップグレード

### CSPの段階的実装（推奨アプローチ）

最高レベルのCSPを実装する際は、段階的に移行することを推奨します：

1. **フェーズ1**: `Content-Security-Policy-Report-Only`で監視
   ```typescript
   {
     key: 'Content-Security-Policy-Report-Only',
     value: '...' // 厳格なポリシー
   }
   ```

2. **フェーズ2**: 違反レポートを確認し、ポリシーを調整

3. **フェーズ3**: 問題がなければ`Content-Security-Policy`に切り替え

### Next.js固有の考慮事項

- **開発環境**: 開発時はCSPを緩和するか、開発環境のみ除外
- **Next.js Script**: `next/script`コンポーネントは自動的にnonceを処理
- **スタイル**: Next.jsのスタイルインジェクション要件のため、`style-src 'unsafe-inline'`が必要な場合がある

### 参考リソース

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [Content Security Policy (CSP) - web.dev](https://web.dev/articles/strict-csp)
- [Permissions Policy - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Permissions_Policy)

---

## 依存関係のセキュリティ

### 定期的な更新

- 依存関係を定期的に更新
- セキュリティパッチを即座に適用
- `bun audit`で脆弱性を確認

### セキュリティ脆弱性の監視

```bash
# 脆弱性の確認
bun audit

# 自動修正（可能な場合）
bun audit fix
```

### 重大なセキュリティ脆弱性への対応

**CVE-2025-55182**: React 19.0-19.2.0とNext.js 15.x-16.0.6の重大な脆弱性

- **必須対応**: React 19.2.3、Next.js 16.1.1に即座にアップグレード（最新安定版）
- **影響**: 認証されていないリモートコード実行が可能

---

## ログと監視

### セキュリティイベントのログ記録

以下のセキュリティイベントをログに記録します：

- 認証失敗の試行
- 権限エラー
- 不正な入力の検出
- 異常なアクセスパターン
- レート制限違反
- Turnstile検証失敗
- IPブロックの発生
- スパム検出

### ログ形式

構造化ログ（JSON形式）を使用します：

```typescript
// src/lib/logger.ts
export function logSecurityEvent(
  type: string,
  details: Record<string, unknown>
) {
  console.log(JSON.stringify({
    level: 'warn',
    type: 'security_event',
    eventType: type,
    details,
    timestamp: new Date().toISOString(),
  }))
}
```

### ログの保護

- 機密情報（パスワード、トークン）をログに記録しない
- ログへのアクセスを制限
- ログの保持期間を設定

### 監視とアラート（無料プラン）

**監視項目**:
- Cloudflare Analytics（無料プランで基本統計利用可能）
- Cloud Runのメトリクス（無料枠内）
- アプリケーションログ（無料枠内）

**アラート設定**:
- Cloud Runのメトリクスアラート（無料枠内）
- 必要に応じてメール通知（Resend無料プラン）

**詳細**:
- DDoS対策の監視: [`DDOS_PROTECTION_REQUIREMENTS.md`](./DDOS_PROTECTION_REQUIREMENTS.md)を参照
- 荒らし対策の監視: [`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md)を参照

---

## データ保護

### 個人情報の保護

- GDPR、個人情報保護法に準拠
- 個人情報の暗号化（保存時、転送時）
- データの最小化（必要な情報のみ収集）

### データバックアップ

- 定期的なデータバックアップ
- バックアップの暗号化
- バックアップからの復旧テスト

---

## インシデント対応

### セキュリティインシデントの報告

セキュリティ脆弱性を発見した場合は、以下の手順に従ってください：

1. 脆弱性を公開しない
2. プロジェクトメンテナーに直接報告
3. 詳細な情報を提供（再現手順、影響範囲など）

### インシデント対応手順

1. **検出**: セキュリティインシデントの検出
2. **評価**: 影響範囲と深刻度の評価
3. **対応**: インシデントの封じ込めと修正
4. **復旧**: システムの復旧と検証
5. **事後対応**: 再発防止策の実施

---

## セキュリティチェックリスト

### 開発時

- [ ] すべての入力がZodスキーマで検証されている
- [ ] 認証が必要な操作で権限チェックが実装されている
- [ ] 機密情報がハードコードされていない
- [ ] SQLインジェクション対策が実装されている（Prisma ORM使用）
- [ ] XSS対策が実装されている（React自動エスケープ）
- [ ] セキュリティヘッダーが設定されている

### デプロイ前

- [ ] 環境変数が適切に設定されている
- [ ] Secret Managerに機密情報が保存されている
- [ ] データベースのRLSポリシーが設定されている
- [ ] HTTPSが有効になっている
- [ ] セキュリティヘッダーが設定されている
- [ ] 依存関係の脆弱性が確認されている

### 定期的な確認

- [ ] 依存関係の更新
- [ ] セキュリティパッチの適用
- [ ] ログの確認
- [ ] アクセスログの監視
- [ ] セキュリティ監査の実施

---

## 更新履歴

- **2026-01-08**: Context7で取得した最新情報に基づき、Auth.js 5の最新パターンを更新
  - Prisma 7対応の設定例を追加（`@/generated/prisma/client`からのインポート）
  - `auth()`メソッドの使用を確認（`getServerSession`は非推奨）
  - JWTセッション戦略の推奨を明確化
  - Prisma Adapterの最新パターン（`@auth/prisma-adapter`）を確認
- **2026-01-07**: ファイルアップロードの検証を拡張:
  - 画像フォーマットにAVIFを追加（次世代画像フォーマット、高圧縮率）
  - 動画ファイルの検証を追加（MP4/WebM、サイズ制限、コーデック検証）
  - 用途別のサイズ制限を明確化（画像: 5MB/10MB、動画: 50MB/100MB）

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md) - アーキテクチャ改善要件定義
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) - ベストプラクティスガイド
- [`DDOS_PROTECTION_REQUIREMENTS.md`](./DDOS_PROTECTION_REQUIREMENTS.md) - DDoS対策要件
- [`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md) - 荒らし対策要件
- [`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md) - Cloudflare Turnstile要件

### 外部リソース

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書（セキュリティベストプラクティス）
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ（セキュリティアーキテクチャ）
- [`ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md) - アーキテクチャ改善要件定義（セキュリティ強化）
- [`API.md`](./API.md) - API仕様（認証・認可）
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - デプロイメント手順（環境変数管理）
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) - ベストプラクティスガイド
- [`DDOS_PROTECTION_REQUIREMENTS.md`](./DDOS_PROTECTION_REQUIREMENTS.md) - DDoS対策要件
- [`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md) - 荒らし対策要件
- [`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md) - Cloudflare Turnstile要件

### 外部リソース

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [Auth.js Security](https://authjs.dev/getting-started/security)
- [Prisma Security](https://www.prisma.io/docs/guides/security)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
