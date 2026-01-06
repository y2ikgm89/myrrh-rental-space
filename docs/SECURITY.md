# セキュリティポリシーとベストプラクティス

> **Note**: このドキュメントにはセキュリティポリシーとベストプラクティスが記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。

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

### 認可（ロールベースアクセス制御）

- **管理者 (`admin`)**: すべての操作が可能
- **一般ユーザー (`user`)**: 予約作成、お問い合わせ送信のみ

### ルート保護

```typescript
// src/middleware.ts
import { auth } from '@/lib/auth'

export async function middleware(request: NextRequest) {
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

```typescript
// ファイルサイズチェック
if (file.size > 10 * 1024 * 1024) {
  throw new Error('File size exceeds 10MB')
}

// ファイル形式チェック
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
if (!allowedTypes.includes(file.type)) {
  throw new Error('Invalid file type')
}
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

## CSRF（クロスサイトリクエストフォージェリ）対策

### Auth.jsの内蔵機能

Auth.jsはCSRF保護を内蔵しています。

### SameSite Cookie

```typescript
cookies: {
  sessionToken: {
    options: {
      sameSite: 'strict',
    },
  },
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

Route Handlersでレート制限を実装します。

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

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書（セキュリティベストプラクティス）
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ（セキュリティアーキテクチャ）
- [`API.md`](./API.md) - API仕様（認証・認可）
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - デプロイメント手順（環境変数管理）

### 外部リソース

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [Auth.js Security](https://authjs.dev/getting-started/security)
- [Prisma Security](https://www.prisma.io/docs/guides/security)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
