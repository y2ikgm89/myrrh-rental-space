# 荒らし対策要件定義

> **Note**: このドキュメントには荒らし対策の詳細な要件定義が記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。セキュリティポリシーについては、[`SECURITY.md`](../security/SECURITY.md)を参照してください。DDoS対策については、[`DDOS_PROTECTION_REQUIREMENTS.md`](./DDOS_PROTECTION_REQUIREMENTS.md)を参照してください。

---

## 概要

### 荒らし対策の全体像

このシステムでは、以下の荒らし行為に対して多層防御を実装します：

1. **Bot攻撃**: 自動化されたBotによるフォーム送信
2. **スパム**: 不適切なコンテンツの送信
3. **異常アクセス**: 異常なアクセスパターンによる攻撃
4. **IPベースの攻撃**: 特定のIPアドレスからの繰り返し攻撃

### 多層防御のアプローチ

以下の4層で荒らし行為を防御します：

1. **Cloudflare層**: Bot Fight Mode、Turnstile（無料プラン）
2. **レート制限層**: `@upstash/ratelimit`（無料プラン）
3. **IPブロック層**: アプリケーション側で実装（データベースに保存）
4. **コンテンツ検証層**: スパムキーワードフィルタリング（アプリケーション側で実装）

### 商用無料プランでの実現

**重要**: この要件定義は、商用無料で利用可能な機能のみに限定しています。

- ✅ Cloudflare無料プラン: Bot Fight Mode、Turnstile（20ウィジェット）
- ✅ レート制限: `@upstash/ratelimit`無料プラン
- ✅ IPブロック機能: アプリケーション側で実装（データベースに保存）
- ✅ スパム対策: アプリケーション側で実装（キーワードフィルタリング）
- ❌ 有料プランが必要な機能（高度なWAF、外部スパム検出サービス）は除外

---

## 機能要件

### IPブロック機能（自前実装、無料）

#### 自動IPブロック機能

**検出条件**:
- レート制限違反が一定回数以上（例: 15分間に10回以上、詳細は[`SECURITY.md`](../security/SECURITY.md)の「レート制限」セクションを参照）
- Turnstile検証失敗が一定回数以上（例: 15分間に5回以上、詳細は[`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md)を参照）
- 異常なリクエストパターン（例: 存在しないエンドポイントへの大量アクセス）

**ブロック期間**:
- **一時ブロック**: 1時間（自動解除）
- **永続ブロック**: 手動で解除が必要

**実装方法**:
- データベースにIPブロックリストを保存（Prisma + Supabase）
- MiddlewareでIPアドレスをチェック

#### 手動IPブロック機能（管理画面）

**機能**:
- 管理画面（`/admin/security/ip-blocks`）からIPアドレスを手動でブロック
- ブロック理由の記録
- ブロック解除機能

**実装方法**:
- Server ActionsでIPブロックリストを管理
- 管理画面のUIでIPアドレスを追加・削除

#### IPブロックリストの管理

**データベース設計**:
```prisma
// prisma/schema.prisma
model IpBlock {
  id        String   @id @default(cuid())
  ipAddress String   @unique
  reason    String?  // ブロック理由
  blockedAt DateTime @default(now())
  expiresAt DateTime? // nullの場合は永続ブロック
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([ipAddress])
  @@index([expiresAt])
}
```

**ホワイトリスト**:
- 信頼できるIPアドレスをホワイトリストに追加（オプション）
- ホワイトリストに登録されたIPアドレスはレート制限を緩和

**ブラックリスト**:
- ブロックされたIPアドレスをブラックリストに保存
- 期限切れのブロックは自動的に削除（バッチ処理）

#### ブロック解除プロセス

**自動解除**:
- `expiresAt`が設定されている場合、期限が来たら自動解除
- バッチ処理で期限切れのブロックを削除

**手動解除**:
- 管理画面から手動でブロックを解除
- ブロック解除の履歴を記録

---

## 非機能要件

### 異常アクセスパターンの検出

#### 検出アルゴリズム

**検出条件**:
1. **レート制限違反**: 15分間に10回以上のレート制限違反
2. **Turnstile検証失敗**: 15分間に5回以上のTurnstile検証失敗
3. **異常なリクエストパターン**: 
   - 存在しないエンドポイントへの大量アクセス（404エラーが10回以上）
   - 異常なUser-Agent（空、Bot検出ツールなど）
   - 異常なリファラー（存在しないドメインなど）

**検出ロジック**:
```typescript
// src/lib/abuse-detection.ts
export interface AbuseDetectionResult {
  isAbuse: boolean
  reason: string[]
  severity: 'low' | 'medium' | 'high'
}

export async function detectAbuse(
  ipAddress: string,
  path: string,
  userAgent: string | null,
  referer: string | null
): Promise<AbuseDetectionResult> {
  const reasons: string[] = []
  let severity: 'low' | 'medium' | 'high' = 'low'
  
  // 1. レート制限違反のチェック（詳細は[`SECURITY.md`](../security/SECURITY.md)の「レート制限」セクションを参照）
  const rateLimitViolations = await getRateLimitViolations(ipAddress, '15 m')
  if (rateLimitViolations >= 10) {
    reasons.push('rate_limit_violations')
    severity = 'high'
  }
  
  // 2. Turnstile検証失敗のチェック（詳細は[`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md)を参照）
  const turnstileFailures = await getTurnstileFailures(ipAddress, '15 m')
  if (turnstileFailures >= 5) {
    reasons.push('turnstile_failures')
    severity = severity === 'low' ? 'medium' : 'high'
  }
  
  // 3. 異常なリクエストパターンのチェック
  const notFoundErrors = await getNotFoundErrors(ipAddress, '15 m')
  if (notFoundErrors >= 10) {
    reasons.push('not_found_errors')
    severity = severity === 'low' ? 'medium' : 'high'
  }
  
  // 4. 異常なUser-Agentのチェック
  if (!userAgent || userAgent.length === 0) {
    reasons.push('empty_user_agent')
    severity = severity === 'low' ? 'medium' : severity
  }
  
  return {
    isAbuse: reasons.length > 0,
    reason: reasons,
    severity,
  }
}
```

#### 自動ブロック機能の実装要件

**ブロック条件**:
- `severity === 'high'`: 即座にブロック（1時間）
- `severity === 'medium'`: 警告ログを記録、3回目でブロック（1時間）
- `severity === 'low'`: 警告ログを記録のみ

**実装方法**:
```typescript
// src/lib/ip-block.ts
export async function blockIpAddress(
  ipAddress: string,
  reason: string[],
  duration: number = 3600 // デフォルト1時間
) {
  const expiresAt = new Date(Date.now() + duration * 1000)
  
  await prisma.ipBlock.upsert({
    where: { ipAddress },
    update: {
      reason: reason.join(', '),
      expiresAt,
      updatedAt: new Date(),
    },
    create: {
      ipAddress,
      reason: reason.join(', '),
      expiresAt,
    },
  })
  
  // ログに記録
  console.log(JSON.stringify({
    level: 'warn',
    type: 'ip_blocked',
    ipAddress,
    reason,
    expiresAt: expiresAt.toISOString(),
  }))
}
```

---

## 技術要件

### スパム対策（自前実装、無料）

#### コンテンツベースのスパム検出

**検出方法**:
- キーワードフィルタリング（データベースにスパムキーワードリストを保存）
- パターンマッチング（URL、メールアドレスのパターン）

**データベース設計**:
```prisma
// prisma/schema.prisma
model SpamKeyword {
  id        String   @id @default(cuid())
  keyword   String   @unique
  category  String   // 'url', 'email', 'text', etc.
  severity  String   @default('medium') // 'low', 'medium', 'high'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([keyword])
  @@index([category])
}
```

#### キーワードフィルタリング

**実装方法**:
```typescript
// src/lib/spam-detection.ts
export interface SpamDetectionResult {
  isSpam: boolean
  matchedKeywords: string[]
  severity: 'low' | 'medium' | 'high'
}

export async function detectSpam(content: string): Promise<SpamDetectionResult> {
  // スパムキーワードを取得
  const spamKeywords = await prisma.spamKeyword.findMany()
  
  const matchedKeywords: string[] = []
  let maxSeverity: 'low' | 'medium' | 'high' = 'low'
  
  // コンテンツをチェック
  for (const keyword of spamKeywords) {
    if (content.toLowerCase().includes(keyword.keyword.toLowerCase())) {
      matchedKeywords.push(keyword.keyword)
      
      // 最大のseverityを記録
      if (keyword.severity === 'high') {
        maxSeverity = 'high'
      } else if (keyword.severity === 'medium' && maxSeverity !== 'high') {
        maxSeverity = 'medium'
      } else if (keyword.severity === 'low' && maxSeverity === 'low') {
        maxSeverity = 'low'
      }
    }
  }
  
  return {
    isSpam: matchedKeywords.length > 0,
    matchedKeywords,
    severity: maxSeverity,
  }
}
```

#### スパム判定の閾値設定

**判定基準**:
- **high severity**: 即座にブロック
- **medium severity**: 警告ログを記録、3回目でブロック
- **low severity**: 警告ログを記録のみ

**実装方法**:
```typescript
// src/actions/reservation.ts
'use server'

import { detectSpam } from '@/lib/spam-detection'
import { blockIpAddress } from '@/lib/ip-block'
import { headers } from 'next/headers'

export async function createReservation(formData: FormData) {
  // ... 既存の検証処理 ...
  
  // スパム検出
  const content = `${formData.get('customerLastName')} ${formData.get('customerFirstName')} ${formData.get('customerEmail')}`
  const spamResult = await detectSpam(content)
  
  if (spamResult.isSpam) {
    // IPアドレスを取得
    const headersList = await headers()
    const ipAddress = 
      headersList.get('x-forwarded-for')?.split(',')[0] ||
      headersList.get('x-real-ip') ||
      'unknown'
    
    // ブロック処理
    if (spamResult.severity === 'high') {
      await blockIpAddress(ipAddress, ['spam_high'], 3600)
      return {
        success: false,
        error: 'Spam detected',
      }
    } else if (spamResult.severity === 'medium') {
      // 警告ログを記録
      console.warn('Spam detected (medium)', { ipAddress, matchedKeywords: spamResult.matchedKeywords })
      // 3回目の場合はブロック（実装が必要）
    }
  }
  
  // ... 通常の処理 ...
}
```

---

## 実装要件

### MiddlewareでのIPブロックチェック

```typescript
// src/proxy.ts (Next.js 16)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export default async function proxy(request: NextRequest) {
  // IPアドレスを取得
  const ipAddress = 
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  
  // IPブロックチェック
  const ipBlock = await prisma.ipBlock.findUnique({
    where: { ipAddress },
  })
  
  if (ipBlock) {
    // 期限切れチェック
    if (ipBlock.expiresAt && ipBlock.expiresAt < new Date()) {
      // 期限切れのブロックを削除
      await prisma.ipBlock.delete({
        where: { id: ipBlock.id },
      })
    } else {
      // ブロックされている場合は403を返す
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

### 管理画面の実装

```typescript
// src/app/admin/security/ip-blocks/page.tsx
import { getIpBlocks, blockIpAddress, unblockIpAddress } from '@/actions/admin/ip-blocks'

export default async function IpBlocksPage() {
  const ipBlocks = await getIpBlocks()
  
  return (
    <div>
      <h1>IPブロック管理</h1>
      {/* IPブロックリストの表示 */}
      {/* IPアドレス追加フォーム */}
      {/* ブロック解除ボタン */}
    </div>
  )
}
```

```typescript
// src/actions/admin/ip-blocks.ts
'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function getIpBlocks() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  return await prisma.ipBlock.findMany({
    orderBy: { blockedAt: 'desc' },
  })
}

export async function blockIpAddress(ipAddress: string, reason: string, duration?: number) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  const expiresAt = duration ? new Date(Date.now() + duration * 1000) : null
  
  return await prisma.ipBlock.upsert({
    where: { ipAddress },
    update: {
      reason,
      expiresAt,
      updatedAt: new Date(),
    },
    create: {
      ipAddress,
      reason,
      expiresAt,
    },
  })
}

export async function unblockIpAddress(ipAddress: string) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  return await prisma.ipBlock.delete({
    where: { ipAddress },
  })
}
```

**注意**: Auth.js 5では`auth()`メソッドを使用します。`getServerSession`は非推奨です。

### バッチ処理（期限切れブロックの削除）

```typescript
// src/lib/cron/cleanup-expired-blocks.ts
import { prisma } from '@/lib/prisma'

export async function cleanupExpiredBlocks() {
  const now = new Date()
  
  const deleted = await prisma.ipBlock.deleteMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  })
  
  console.log(`Cleaned up ${deleted.count} expired IP blocks`)
  
  return deleted.count
}
```

---

## 監視とアラート（無料プラン）

### リアルタイム監視システムの設計

**監視項目**:
- IPブロックの発生数
- スパム検出の発生数
- 異常アクセスパターンの検出数

**実装方法**:
- ログベースの監視（無料）
- 定期的なログレビュー（週次）

### 異常検知メカニズムの詳細

**検知ロジック**:
- レート制限違反の増加
- Turnstile検証失敗の増加
- スパム検出の増加

**ログ形式**:
```typescript
// src/lib/logger.ts
export function logAbuseDetection(
  ipAddress: string,
  type: 'rate_limit' | 'turnstile' | 'spam' | 'abuse_pattern',
  details: Record<string, unknown>
) {
  console.log(JSON.stringify({
    level: 'warn',
    type: 'abuse_detection',
    ipAddress,
    abuseType: type,
    details,
    timestamp: new Date().toISOString(),
  }))
}
```

### アラート通知の設定（無料プランで利用可能な範囲）

**推奨設定**:
- ログ監視（Cloud Runのログ、無料枠内）
- 必要に応じてメール通知（Resend無料プラン）

**制限事項**:
- 高度なアラート機能（例: Datadog、New Relic）は有料のため除外
- 基本的なログ監視とメール通知のみ実装

---

## テスト要件

### 単体テスト

```typescript
// tests/unit/abuse-detection.test.ts
import { describe, it, expect } from 'bun:test'
import { detectAbuse } from '@/lib/abuse-detection'

describe('Abuse Detection', () => {
  it('should detect rate limit violations', async () => {
    // レート制限違反をシミュレート
    const result = await detectAbuse(
      '192.168.1.1',
      '/api/test',
      'Mozilla/5.0',
      'https://example.com'
    )
    
    expect(result.isAbuse).toBe(true)
    expect(result.reason).toContain('rate_limit_violations')
  })
  
  it('should detect spam content', async () => {
    const result = await detectSpam('Buy cheap viagra now!')
    expect(result.isSpam).toBe(true)
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })
})
```

### 統合テスト

```typescript
// tests/integration/ip-block.test.ts
import { describe, it, expect } from 'bun:test'
import { blockIpAddress, unblockIpAddress } from '@/lib/ip-block'

describe('IP Block', () => {
  it('should block IP address', async () => {
    await blockIpAddress('192.168.1.1', ['test'], 3600)
    
    const ipBlock = await prisma.ipBlock.findUnique({
      where: { ipAddress: '192.168.1.1' },
    })
    
    expect(ipBlock).not.toBeNull()
  })
  
  it('should unblock IP address', async () => {
    await unblockIpAddress('192.168.1.1')
    
    const ipBlock = await prisma.ipBlock.findUnique({
      where: { ipAddress: '192.168.1.1' },
    })
    
    expect(ipBlock).toBeNull()
  })
})
```

---

## 運用要件

### 定期的な監視

**監視頻度**:
- **日次**: IPブロックリストの確認
- **週次**: ログのレビューと異常パターンの検出
- **月次**: スパムキーワードリストの見直し

### スパムキーワードリストの管理

**初期キーワード**:
- URLパターン（`http://`, `https://`, `www.`など）
- メールアドレスパターン（`@example.com`など）
- 一般的なスパムキーワード（`viagra`, `casino`, `loan`など）

**管理方法**:
- 管理画面（`/admin/security/spam-keywords`）から追加・削除
- 定期的な見直しと更新

### IPブロック解除の判断基準

**自動解除**:
- 期限切れのブロックは自動的に解除

**手動解除**:
- 誤検出の可能性がある場合
- ブロック理由が解決された場合
- 管理者の判断で解除

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書（技術スタック詳細）
- [`SECURITY.md`](../security/SECURITY.md) - セキュリティポリシーとベストプラクティス
- [`DDOS_PROTECTION_REQUIREMENTS.md`](./DDOS_PROTECTION_REQUIREMENTS.md) - DDoS対策要件定義
- [`TURNSTILE_REQUIREMENTS.md`](./TURNSTILE_REQUIREMENTS.md) - Cloudflare Turnstile要件定義

### 外部リソース

- [Upstash Rate Limit](https://upstash.com/docs/redis/features/ratelimiting) - Upstash Rate Limitの詳細
- [Prisma Documentation](https://www.prisma.io/docs) - Prisma ORMの詳細

---

## 更新履歴

- **2026-01-08**: ドキュメント相互参照パスを修正（SECURITY.mdへのパスを正しいディレクトリに変更）
- **2026-01-06**: 初版作成、商用無料プランで利用可能な荒らし対策の要件定義を完了
