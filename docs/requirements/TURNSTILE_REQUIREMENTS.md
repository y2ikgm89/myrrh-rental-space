# Cloudflare Turnstile 要件定義

> **Note**: このドキュメントにはCloudflare Turnstileの詳細な要件定義が記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。セキュリティポリシーについては、[`SECURITY.md`](./SECURITY.md)を参照してください。API仕様については、[`API.md`](./API.md)を参照してください。

---

## 概要

### Cloudflare Turnstileの目的と背景

このプロジェクトでは、Bot対策としてCloudflare Turnstileを導入します。Turnstileは、ユーザーに負担をかけない非対話型のCAPTCHA代替ソリューションであり、フォーム送信時のBot攻撃を効果的に防止します。

### プロジェクトでの位置づけ

Cloudflare Turnstileは、以下の機能を提供します：

- **Bot対策**: フォーム送信時のBot攻撃を防止
- **ユーザー体験**: 非対話型ウィジェットにより、ユーザーに負担をかけない
- **多層防御**: 既存のCloudflare Bot Fight Modeと併用して、より強固なセキュリティを実現
- **アナリティクス**: Bot攻撃パターンの分析と可視化

### 既存のBot対策との比較

| 項目 | Cloudflare Bot Fight Mode | Cloudflare Turnstile |
|------|--------------------------|---------------------|
| **適用範囲** | 全トラフィック | フォーム送信時のみ |
| **制御粒度** | サイト全体 | ウィジェット単位 |
| **ユーザー体験** | 透明（バックグラウンド） | 非対話型（managedモード） |
| **アナリティクス** | 基本統計 | 詳細分析（7次元分析） |
| **コスト** | 無料プランで利用可能 | 無料プランで利用可能（20ウィジェット） |

**Turnstileを追加する理由**:
- フォーム送信時の追加検証層（多層防御）
- より細かい制御（ウィジェット単位、フォーム単位）
- アナリティクスによる詳細な分析（Bot攻撃パターンの特定）
- 既存のレート制限（`@upstash/ratelimit`）との併用

### Cloudflare Turnstileの特徴（2026-01-06時点の最新情報）

- **無料プラン**: 20ウィジェット、無制限チャレンジ、15ホスト名/ウィジェット、7日間のアナリティクス、WCAG 2.1 AA準拠
- **Enterpriseプラン**: 無制限ウィジェット、200ホスト名/ウィジェット、30日間のアナリティクス、カスタムブランディング、エフェメラルID
- **非対話型**: ユーザーに負担をかけないCAPTCHA代替（managedモード）
- **プライバシー重視**: 個人情報を収集しない、GDPR準拠
- **最新機能**: 高度なアナリティクス（TopN統計、7次元分析）、Flexibleウィジェットサイズ（100%幅対応）

---

## 機能要件

### 導入対象フォーム

以下のフォームにCloudflare Turnstileを導入します：

1. **ログインフォーム**: Auth.js 5の`signIn`前にTurnstile検証
   - パス: `/api/auth/signin`またはカスタムログインページ
   - 目的: 不正ログイン試行の防止

2. **予約フォーム**: `createReservation` Server Action実行前にTurnstile検証
   - パス: `/reservation` - `ReservationForm.tsx`
   - 目的: 不正予約の防止、スパム予約の防止

3. **お問い合わせフォーム**: `createInquiry` Server Action実行前にTurnstile検証
   - パス: `/contact`
   - 目的: スパムメールの防止

### ウィジェット設定

#### ウィジェットタイプ

- **managed**（推奨）: 非対話型、ユーザーに負担をかけない
- **interactive**: 必要に応じて使用（高度なBot検出が必要な場合）

#### テーマ設定

- **light**（デフォルト）: ライトテーマ
- **dark**: ダークテーマ（設定可能、アクセシビリティ対応）

#### ウィジェットサイズ

- **normal**: 標準サイズ（推奨）
- **compact**: コンパクトサイズ
- **flexible**: 100%幅対応（レスポンシブ）

### 検証フロー

#### クライアントサイドフロー

1. フォームが表示される
2. Turnstileウィジェットが自動的に読み込まれる
3. ユーザーがフォームに入力する
4. Turnstileがバックグラウンドで検証を実行（managedモード）
5. トークンが生成される（`cf-turnstile-response`）
6. フォーム送信時にトークンが含まれる

#### サーバーサイドフロー

1. Server ActionまたはRoute Handlerがトークンを受信
2. Turnstile検証ユーティリティが呼び出される
3. Cloudflare Siteverify APIにリクエストを送信
4. 検証結果を確認
5. 検証成功時のみ、フォーム処理を続行
6. 検証失敗時はエラーレスポンスを返す

---

## 非機能要件

### セキュリティ要件

#### シークレットキーの管理

- **開発環境**: `.env.local`ファイルに保存（Gitにコミットしない）
- **本番環境**: Google Secret Managerに保存
- **取得方法**: 環境変数から取得（`process.env.TURNSTILE_SECRET_KEY`）
- **バリデーション**: 起動時にZodスキーマで検証

#### トークンセキュリティ

- **有効期限**: 5分以内（`challenge_ts`検証）
- **再利用防止**: トークンは1回のみ使用可能（Cloudflare APIが自動処理）
- **サーバーサイド検証**: 必須（クライアントサイドのみでは不十分）

#### レート制限との統合

既存の`@upstash/ratelimit`とTurnstile検証を併用して、多層防御を実現します。

**統合パターン**:

```typescript
// src/actions/reservation.ts
'use server'

import { verifyTurnstileToken } from '@/lib/turnstile'
import { checkRateLimit } from '@/lib/rate-limit'
import { headers } from 'next/headers'

export async function createReservation(formData: FormData) {
  // 1. レート制限チェック（IPアドレスベース）
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
  const rateLimitResult = await checkRateLimit(`reservation:${ipAddress}`)
  
  if (!rateLimitResult) {
    return {
      success: false,
      error: 'Too many requests. Please try again later.',
    }
  }
  
  // 2. Turnstile検証
  const token = formData.get('cf-turnstile-response')
  if (!token || typeof token !== 'string') {
    return {
      success: false,
      error: 'Turnstile verification required',
    }
  }
  
  const isValid = await verifyTurnstileToken(token)
  if (!isValid) {
    // Turnstile検証失敗時もレート制限をカウント（Bot攻撃の可能性）
    return {
      success: false,
      error: 'Turnstile verification failed',
    }
  }
  
  // 3. フォーム処理を続行
  // ...
}
```

**レート制限設定**:

詳細は[`SECURITY.md`](./SECURITY.md)の「レート制限」セクションを参照してください。

- **予約フォーム**: 15分間に5回（[`SECURITY.md`](./SECURITY.md)参照）
- **お問い合わせフォーム**: 15分間に3回（[`SECURITY.md`](./SECURITY.md)参照）
- **ログインフォーム**: 15分間に5回（[`SECURITY.md`](./SECURITY.md)参照）

**統合の利点**:
- Turnstile検証失敗時もレート制限をカウントすることで、Bot攻撃を効果的に防止
- レート制限とTurnstile検証の両方で多層防御を実現

### パフォーマンス要件

#### レスポンス時間

- **ウィジェット読み込み**: 1秒以内（CDN経由）
- **検証処理**: 500ms以内（Cloudflare APIへのリクエスト）
- **フォーム送信**: 検証処理を含めて2秒以内

#### ユーザー体験への影響

- 非対話型ウィジェット（managedモード）により、ユーザーに負担をかけない
- フォーム送信をブロックしない（非同期処理）

### アクセシビリティ要件

#### WCAG 2.1 AA準拠

- Cloudflare TurnstileはWCAG 2.1 AA準拠（デフォルト機能）
- スクリーンリーダー対応
- キーボードナビゲーション対応

---

## 技術要件

### ライブラリ選択

#### 推奨ライブラリ: `@marsidev/react-turnstile`

**選択理由**:
- TypeScript対応（完全な型定義）
- SSR対応（Next.js App Router対応）
- 高評価（Benchmark Score: 94.8）
- アクティブなメンテナンス
- 公式ドキュメントが充実

**バージョン**: 最新安定版（2026-01-06時点）

### 実装パターン

#### Server Actions統合

```typescript
// src/actions/reservation.ts
'use server'

import { verifyTurnstileToken } from '@/lib/turnstile'
import { createReservationSchema } from '@/lib/validations/reservation'

export async function createReservation(formData: FormData) {
  // 1. Turnstile検証
  const token = formData.get('cf-turnstile-response')
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'Turnstile verification required' }
  }

  const isValid = await verifyTurnstileToken(token)
  if (!isValid) {
    return { success: false, error: 'Turnstile verification failed' }
  }

  // 2. バリデーション
  const data = createReservationSchema.parse({
    spaceId: formData.get('spaceId'),
    // ...
  })

  // 3. データベース操作
  // ...
}
```

#### Route Handlers実装

```typescript
// src/app/api/turnstile/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    const isValid = await verifyTurnstileToken(token)

    return NextResponse.json({ success: isValid })
  } catch (error) {
    console.error('Turnstile verification error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

#### Client Components実装

```typescript
// src/components/ui/turnstile.tsx
'use client'

import { Turnstile } from '@marsidev/react-turnstile'
import { useState } from 'react'

export function TurnstileWidget({
  onVerify,
  onError,
}: {
  onVerify: (token: string) => void
  onError?: () => void
}) {
  const [siteKey] = useState(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

  if (!siteKey) {
    console.error('TURNSTILE_SITE_KEY is not set')
    return null
  }

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onVerify}
      onError={onError}
      options={{
        theme: 'light',
        size: 'normal',
      }}
    />
  )
}
```

### 環境変数

#### 開発環境 (`.env.local`)

```env
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
```

#### 本番環境 (Google Secret Manager)

- `TURNSTILE_SITE_KEY`: サイトキー（公開可能）
- `TURNSTILE_SECRET_KEY`: シークレットキー（機密情報）
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: クライアントサイド用サイトキー（公開可能）

#### 環境変数のバリデーション

```typescript
// src/config/env.ts（存在する場合）または新規作成
import { z } from 'zod'

const envSchema = z.object({
  TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
})

export const env = envSchema.parse(process.env)
```

### CSP（Content Security Policy）の調整

既存のCSP設定（[`SECURITY.md`](./SECURITY.md)参照）に以下を追加：

```typescript
// next.config.js
const securityHeaders = [
  // ... 既存の設定
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'strict-dynamic' https://challenges.cloudflare.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com",
      // ... その他の設定
    ].join('; '),
  },
]
```

---

## 実装要件

### Server Actions統合

#### 予約フォーム統合

```typescript
// src/actions/reservation.ts
'use server'

import { verifyTurnstileToken } from '@/lib/turnstile'
import { createReservationSchema } from '@/lib/validations/reservation'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createReservation(formData: FormData) {
  try {
    // 1. Turnstile検証
    const token = formData.get('cf-turnstile-response')
    if (!token || typeof token !== 'string') {
      return {
        success: false,
        error: 'Turnstile verification required',
      }
    }

    const isValid = await verifyTurnstileToken(token)
    if (!isValid) {
      return {
        success: false,
        error: 'Turnstile verification failed',
      }
    }

    // 2. バリデーション
    const data = createReservationSchema.parse({
      spaceId: formData.get('spaceId'),
      customerLastName: formData.get('customerLastName'),
      customerFirstName: formData.get('customerFirstName'),
      customerEmail: formData.get('customerEmail'),
      startTime: formData.get('startTime'),
      endTime: formData.get('endTime'),
    })

    // 3. データベース操作
    const reservation = await prisma.reservation.create({
      data,
    })

    // 4. キャッシュ無効化
    revalidatePath('/reservation')
    revalidatePath('/admin/reservations')

    return {
      success: true,
      reservationId: reservation.id,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        details: error.errors,
      }
    }

    console.error('Error creating reservation:', error)
    return {
      success: false,
      error: 'Failed to create reservation',
    }
  }
}
```

#### お問い合わせフォーム統合

同様のパターンで`createInquiry` Server Actionに統合します。

#### ログインフォーム統合

Auth.js 5の`signIn`コールバック内でTurnstile検証を実行します。

**実装パターン1: signInコールバック内で検証（推奨）**

```typescript
// src/lib/auth.ts
import { verifyTurnstileToken } from '@/lib/turnstile'

export const { handlers, auth, signIn, signOut } = NextAuth({
  // ... 既存の設定
  callbacks: {
    async signIn({ user, account, profile, credentials }) {
      // Turnstile検証（credentialsプロバイダー使用時）
      if (credentials && credentials.turnstileToken) {
        const isValid = await verifyTurnstileToken(credentials.turnstileToken)
        if (!isValid) {
          return false // ログインを拒否
        }
      }
      
      return true
    },
    // ... その他のコールバック
  },
})
```

**実装パターン2: カスタムログインページで検証**

```typescript
// src/app/(public)/login/page.tsx
'use client'

import { signIn } from 'next-auth/react'
import { TurnstileWidget } from '@/components/ui/turnstile'
import { useState } from 'react'

export default function LoginPage() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  
  async function handleSubmit(formData: FormData) {
    if (!turnstileToken) {
      // Turnstile検証が完了していない場合はエラー
      return
    }
    
    // Turnstileトークンをcredentialsに含める
    const result = await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      turnstileToken,
      redirect: false,
    })
    
    // エラーハンドリング
  }
  
  return (
    <form action={handleSubmit}>
      {/* ログインフォーム */}
      <TurnstileWidget
        onVerify={setTurnstileToken}
        onError={() => setTurnstileToken(null)}
      />
    </form>
  )
}
```

**注意事項**:
- Auth.js 5のCredentialsプロバイダーを使用する場合、`signIn`コールバック内でTurnstile検証を実行
- カスタムログインページを使用する場合、クライアントサイドでTurnstileトークンを取得し、`signIn`関数に渡す
- レート制限との統合: ログイン試行回数制限とTurnstile検証を併用（詳細は「レート制限との統合」セクションを参照）

### Route Handlers実装

詳細は上記の「技術要件」セクションの「Route Handlers実装」を参照してください。

### Client Components実装

#### Turnstileウィジェットコンポーネント

```typescript
// src/components/ui/turnstile.tsx
'use client'

import { Turnstile } from '@marsidev/react-turnstile'
import { useState, useEffect } from 'react'

export interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onError?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' | 'flexible'
  className?: string
}

export function TurnstileWidget({
  onVerify,
  onError,
  theme = 'light',
  size = 'normal',
  className,
}: TurnstileWidgetProps) {
  const [siteKey, setSiteKey] = useState<string | undefined>()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setSiteKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  }, [])

  if (!mounted || !siteKey) {
    // SSR時やサイトキーが設定されていない場合は何も表示しない
    return null
  }

  return (
    <div className={className}>
      <Turnstile
        siteKey={siteKey}
        onSuccess={onVerify}
        onError={onError}
        onExpire={() => {
          // トークンが期限切れになった場合の処理
          onError?.()
        }}
        options={{
          theme,
          size,
        }}
      />
    </div>
  )
}
```

#### フォームコンポーネントへの統合パターン

**予約フォームへの統合**:

```typescript
// src/components/public/ReservationForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { createReservation } from '@/actions/reservation'
import { TurnstileWidget } from '@/components/ui/turnstile'

export function ReservationForm({ spaceId }: { spaceId: string }) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    if (!turnstileToken) {
      setError('Turnstile verification is required')
      return
    }

    // TurnstileトークンをFormDataに追加
    formData.set('cf-turnstile-response', turnstileToken)

    startTransition(async () => {
      const result = await createReservation(formData)
      
      if (!result.success) {
        setError(result.error || 'Failed to create reservation')
        // Turnstileトークンをリセット（再検証が必要）
        setTurnstileToken(null)
      } else {
        // 成功時の処理
        setError(null)
      }
    })
  }

  return (
    <form action={handleSubmit}>
      {/* フォームフィールド */}
      
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      
      <TurnstileWidget
        onVerify={setTurnstileToken}
        onError={() => {
          setTurnstileToken(null)
          setError('Turnstile verification failed. Please try again.')
        }}
        theme="light"
        size="normal"
      />
      
      <button type="submit" disabled={!turnstileToken || isPending}>
        {isPending ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
```

**お問い合わせフォームへの統合**:

同様のパターンで`ContactForm.tsx`に統合します。

**エラーハンドリング**:
- Turnstileトークンが取得できない場合: ユーザーにエラーメッセージを表示し、再試行を促す
- Turnstile検証失敗時: サーバーサイドでエラーレスポンスを返し、クライアントサイドでエラーメッセージを表示
- トークン期限切れ時: `onExpire`コールバックでトークンをリセットし、再検証を促す

---

## テスト要件

> **Note**: 包括的なテスト要件定義については、[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照してください。このセクションでは、Cloudflare Turnstile統合に特化したテスト要件を記載します。

**テストフレームワーク**: Bun test（`bun:test`）を使用。詳細は[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照。

### 単体テスト

#### サーバーサイド検証ユーティリティのテスト

```typescript
// tests/unit/turnstile.test.ts
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { verifyTurnstileToken } from '@/lib/turnstile'

describe('Turnstile Verification', () => {
  beforeEach(() => {
    // 環境変数のモック
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key'
  })

  afterEach(() => {
    // クリーンアップ
    delete process.env.TURNSTILE_SECRET_KEY
  })

  it('should verify valid token', async () => {
    // Cloudflare APIの成功レスポンスをモック
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          'error-codes': [],
          challenge_ts: new Date().toISOString(),
        }),
      })
    ) as typeof fetch

    const result = await verifyTurnstileToken('valid-token')
    expect(result).toBe(true)
  })

  it('should reject invalid token', async () => {
    // Cloudflare APIの失敗レスポンスをモック
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      })
    ) as typeof fetch

    const result = await verifyTurnstileToken('invalid-token')
    expect(result).toBe(false)
  })

  it('should reject expired token', async () => {
    // 期限切れトークンのレスポンスをモック
    const expiredTime = new Date()
    expiredTime.setMinutes(expiredTime.getMinutes() - 6) // 6分前（5分の有効期限を超えている）

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          'error-codes': [],
          challenge_ts: expiredTime.toISOString(),
        }),
      })
    ) as typeof fetch

    const result = await verifyTurnstileToken('expired-token')
    expect(result).toBe(false)
  })

  it('should handle API errors', async () => {
    // ネットワークエラーをモック
    global.fetch = mock(() => Promise.reject(new Error('Network error')))

    const result = await verifyTurnstileToken('token')
    expect(result).toBe(false)
  })

  it('should handle missing secret key', async () => {
    delete process.env.TURNSTILE_SECRET_KEY

    const result = await verifyTurnstileToken('token')
    expect(result).toBe(false)
  })
})
```

### 統合テスト

#### Route Handler統合のテスト

```typescript
// tests/integration/turnstile-api.test.ts
import { describe, it, expect } from 'bun:test'

describe('Turnstile API Route', () => {
  it('should verify token via API', async () => {
    // Route Handlerのテスト
  })
})
```

#### Server Actions統合のテスト

```typescript
// tests/integration/reservation-turnstile.test.ts
import { describe, it, expect } from 'bun:test'
import { createReservation } from '@/actions/reservation'

describe('Reservation with Turnstile', () => {
  it('should reject reservation without Turnstile token', async () => {
    const formData = new FormData()
    // Turnstileトークンなし
    const result = await createReservation(formData)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Turnstile verification')
  })

  it('should reject reservation with invalid Turnstile token', async () => {
    const formData = new FormData()
    formData.set('cf-turnstile-response', 'invalid-token')
    const result = await createReservation(formData)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Turnstile verification failed')
  })
})
```

### E2Eテスト

#### フォーム送信フロー全体のテスト

```typescript
// tests/e2e/turnstile-flow.spec.ts
import { test, expect } from '@playwright/test'

test('should submit form with Turnstile verification', async ({ page }) => {
  await page.goto('/reservation')
  
  // フォーム入力
  await page.fill('[name="customerLastName"]', 'Test')
  // ...
  
  // Turnstileウィジェットの読み込みを待つ
  await page.waitForSelector('[data-sitekey]')
  
  // フォーム送信
  await page.click('button[type="submit"]')
  
  // 成功メッセージの確認
  await expect(page.locator('.success-message')).toBeVisible()
})
```

### テストカバレッジ

- **目標**: 80%以上（[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)準拠）
- **カバレッジ対象**: 
  - サーバーサイド検証ユーティリティ（`src/lib/turnstile.ts`）
  - Route Handler（`src/app/api/turnstile/verify/route.ts`）
  - Server Actions統合（Turnstile検証部分）

---

## 運用要件

### 監視（無料プラン）

#### Turnstile検証失敗の監視

**監視項目**:
- 検証失敗率、エラーコード、IPアドレス
- 検証失敗の時間帯、パターン

**監視方法**:
- ログを監視し、異常なパターンを検出
- Cloudflare Turnstileアナリティクス（無料プランで7日間のアナリティクス利用可能）

**アラート設定**:
- 検証失敗率が閾値を超えた場合にアラートを送信
- 無料プランでは基本的なログ監視とメール通知（Resend無料プラン）を活用

**実装例**:
```typescript
// src/lib/turnstile.ts
export async function verifyTurnstileToken(token: string) {
  // ... 検証処理 ...
  
  if (!isValid) {
    // ログに記録
    console.log(JSON.stringify({
      level: 'warn',
      type: 'turnstile_verification_failed',
      errorCode: data['error-codes']?.[0],
      timestamp: new Date().toISOString(),
    }))
  }
  
  return isValid
}
```

#### Bot攻撃パターンの分析

**分析項目**:
- Cloudflare Turnstileアナリティクスを活用（無料プランで7日間のアナリティクス利用可能）
- TopN統計、7次元分析（無料プランで利用可能）

**分析頻度**:
- **日次**: 基本的な統計の確認
- **週次**: 詳細なパターン分析とレビュー

**対応**:
- 異常なパターンを検出した場合、追加のセキュリティ対策を検討
- IPブロック機能との統合（[`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md)参照）

**詳細**: [`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md)を参照してください。

### ログ

#### Turnstile検証のログ

- **ログ項目**: 検証成功/失敗、エラーコード、IPアドレス、タイムスタンプ
- **ログ形式**: 構造化ログ（JSON形式）
- **ログレベル**: INFO（成功）、WARN（失敗）

### トラブルシューティング

#### よくある問題と解決方法

**問題1: Turnstileウィジェットが表示されない**

- **原因**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`が設定されていない、CSP設定が正しくない
- **解決方法**: 環境変数を確認し、CSP設定を確認

**問題2: 検証が常に失敗する**

- **原因**: `TURNSTILE_SECRET_KEY`が正しくない、トークンが期限切れ
- **解決方法**: シークレットキーを確認し、トークンの有効期限を確認

**問題3: CSPエラーが発生する**

- **原因**: CSP設定に`challenges.cloudflare.com`が含まれていない
- **解決方法**: `next.config.js`のCSP設定を確認し、必要なドメインを追加

#### デバッグ方法

- **ログレベル**: 開発環境では`DEBUG`レベルでログを出力
- **ブラウザコンソール**: クライアントサイドのエラーを確認
- **サーバーログ**: サーバーサイドの検証エラーを確認

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書（技術スタック詳細）
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシーとベストプラクティス
- [`API.md`](./API.md) - API仕様（Server Actions、Route Handlers）
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) - ベストプラクティスガイド
- [`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md) - テスト要件定義（包括的なテスト要件、Bun test、Playwright）
- [`CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md) - Cloudflare CDN統合ガイド（Bot Fight Mode参照）

### 外部リソース

- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/) - Cloudflare Turnstile公式ドキュメント
- [React Turnstile (@marsidev/react-turnstile)](https://github.com/marsidev/react-turnstile) - React Turnstileライブラリ
- [Cloudflare Turnstile Plans](https://developers.cloudflare.com/turnstile/plans/) - プランと料金情報
- [Cloudflare Turnstile Get Started](https://developers.cloudflare.com/turnstile/get-started/) - クイックスタートガイド

---

## 実装優先順位

1. **フェーズ1**: 依存関係のインストール、環境変数の設定
2. **フェーズ2**: サーバーサイド検証ユーティリティの実装、Zodスキーマの実装
3. **フェーズ3**: Route Handlerの実装、Turnstileコンポーネントの実装
4. **フェーズ4**: Server Actions統合（予約フォーム、お問い合わせフォーム、ログインフォーム）
5. **フェーズ5**: CSP設定の調整、環境変数テンプレートの更新
6. **フェーズ6**: テスト実装（単体テスト、統合テスト、E2Eテスト）
   - 詳細は[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照

---

## エラーハンドリング要件

### エラーコードとエラーメッセージ

Cloudflare Turnstile APIから返されるエラーコードに基づいて、適切なエラーメッセージを表示します。

**エラーコード一覧**:
- `missing-input-secret`: シークレットキーが設定されていない
- `invalid-input-secret`: シークレットキーが無効
- `missing-input-response`: トークンが提供されていない
- `invalid-input-response`: トークンが無効または期限切れ
- `bad-request`: リクエストが不正
- `timeout-or-duplicate`: トークンがタイムアウトまたは重複使用

**エラーハンドリング実装**:

```typescript
// src/lib/turnstile.ts
export interface TurnstileVerificationResult {
  success: boolean
  error?: string
  code?: string // Turnstile固有のエラーコード（例: 'missing-input-secret', 'invalid-input-response'）
  // 注意: このcodeはCloudflare Turnstile APIの公式エラーコードです。
  // Server ActionsやAPI Routesで使用する際は、プロジェクト標準エラーコード（VALIDATION_ERRORなど）にマッピングしてください。
}

export async function verifyTurnstileToken(
  token: string,
  ipAddress?: string
): Promise<TurnstileVerificationResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  
  if (!secretKey) {
    return {
      success: false,
      error: 'Turnstile secret key is not configured',
      code: 'missing-input-secret',
    }
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: ipAddress,
      }),
    })

    const data = await response.json()

    if (!data.success) {
      const errorCode = data['error-codes']?.[0] || 'unknown-error'
      return {
        success: false,
        error: getErrorMessage(errorCode),
        code: errorCode,
      }
    }

    // トークンの有効期限チェック（5分以内）
    if (data.challenge_ts) {
      const challengeTime = new Date(data.challenge_ts)
      const now = new Date()
      const diffMinutes = (now.getTime() - challengeTime.getTime()) / (1000 * 60)
      
      if (diffMinutes > 5) {
        return {
          success: false,
          error: 'Turnstile token has expired',
          code: 'invalid-input-response',
        }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Turnstile verification error:', error)
    return {
      success: false,
      error: 'Failed to verify Turnstile token',
      code: 'network-error',
    }
  }
}

function getErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    'missing-input-secret': 'Turnstile configuration error',
    'invalid-input-secret': 'Turnstile configuration error',
    'missing-input-response': 'Turnstile verification required',
    'invalid-input-response': 'Turnstile verification failed',
    'bad-request': 'Invalid request',
    'timeout-or-duplicate': 'Turnstile token expired or already used',
  }
  
  return errorMessages[errorCode] || 'Turnstile verification failed'
}
```

### ユーザーフレンドリーなエラーメッセージ

クライアントサイドで表示するエラーメッセージは、ユーザーに分かりやすい内容にします。

```typescript
// src/components/ui/turnstile.tsx
export function TurnstileWidget({ onError }: { onError?: (error: string) => void }) {
  const handleError = () => {
    onError?.('セキュリティ検証に失敗しました。ページを再読み込みして再度お試しください。')
  }

  return (
    <Turnstile
      // ...
      onError={handleError}
      onExpire={() => {
        onError?.('セキュリティ検証の有効期限が切れました。再度お試しください。')
      }}
    />
  )
}
```

## 注意事項

- **トークン有効期限**: トークンは5分で有効期限切れ、1回のみ使用可能（Cloudflare APIが自動処理）
- **サーバーサイド検証**: サーバーサイド検証は必須（クライアントサイドのみでは不十分、[`SECURITY.md`](./SECURITY.md)準拠）
- **既存システムとの統合**: 既存のBot Fight Modeと併用可能（多層防御、[`CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md)参照）
- **無料プラン**: 無料プランで十分な機能を提供（20ウィジェット、無制限チャレンジ）
- **エラーハンドリング**: すべてのエラーケースを適切に処理し、ユーザーに分かりやすいエラーメッセージを表示
- **レート制限との統合**: Turnstile検証失敗時もレート制限をカウントし、Bot攻撃を効果的に防止
- **最新情報（2026-01-06時点）の反映**:
  - Cloudflare Turnstileの最新機能（高度なアナリティクス、Flexibleウィジェットサイズ）
  - `@marsidev/react-turnstile`の最新バージョンとベストプラクティス
  - Next.js 16 App Routerとの統合パターン
  - Server ActionsとRoute Handlersのベストプラクティス（[`BEST_PRACTICES.md`](./BEST_PRACTICES.md)準拠）

---

## 更新履歴

- **2026-01-06**: 初版作成、Cloudflare Turnstileの要件定義を完了
