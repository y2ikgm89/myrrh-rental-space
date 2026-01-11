# 保護対策

DDoS対策・レート制限・Bot保護の統合ガイド。

## 多層防御アーキテクチャ

```
[攻撃者]
    ↓
[Cloudflare] ─── L3/L4 DDoS保護（自動）
    ↓
[Cloud Run] ─── タイムアウト（60秒）、スケーリング制限
    ↓
[Middleware] ─── グローバルレート制限
    ↓
[Server Action] ─── エンドポイント別レート制限 + Turnstile
    ↓
[データベース]
```

## 1. Cloudflare DDoS保護

### 無料プランで利用可能

- L3/L4 DDoS自動保護
- HTTP Flood対策
- Slowloris攻撃対策

### 設定

1. ドメインをCloudflareに追加
2. DNS設定でプロキシ有効化（オレンジ雲）
3. SSL/TLS: Full (Strict)

## 2. レート制限

### @upstash/ratelimit

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
})
```

### エンドポイント別設定

| エンドポイント | 制限 |
|--------------|------|
| ログイン | 10回/10秒 |
| 予約フォーム | 5回/分 |
| お問い合わせ | 3回/分 |
| API一般 | 100回/分 |

### 実装例

```typescript
export async function createReservation(data: Input) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'

  const { success, remaining } = await ratelimit.limit(ip)

  if (!success) {
    return createFailure('リクエストが多すぎます。しばらくお待ちください。')
  }

  // 処理続行
}
```

## 3. Cloudflare Turnstile

### 概要

Cloudflareの無料Bot保護サービス。reCAPTCHAの代替。

### 導入

```bash
bun add @marsidev/react-turnstile
```

### クライアント

```tsx
'use client'
import { Turnstile } from '@marsidev/react-turnstile'

<Turnstile
  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
  onSuccess={(token) => setTurnstileToken(token)}
/>
```

### サーバー検証

```typescript
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function handleSubmit(data: Input) {
  const isValid = await verifyTurnstileToken(data.turnstileToken)

  if (!isValid) {
    return createFailure('Bot検証に失敗しました')
  }

  // 処理続行
}
```

### 検証API

```typescript
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  )

  const data = await response.json()
  return data.success === true
}
```

## 4. 荒らし対策

### IPブロック

```typescript
const BLOCKED_IPS = new Set([
  // 悪意のあるIPを追加
])

export function isBlocked(ip: string): boolean {
  return BLOCKED_IPS.has(ip)
}
```

### スパム検出

- 同一内容の連続投稿検出
- 禁止ワードフィルタ
- URL過多検出

## 5. Cloud Run設定

### タイムアウト

```yaml
annotations:
  run.googleapis.com/timeout: "60s"
```

### スケーリング制限

```yaml
annotations:
  autoscaling.knative.dev/maxScale: "10"
  autoscaling.knative.dev/minScale: "0"
```

### リソース制限

```yaml
resources:
  limits:
    cpu: "1"
    memory: 512Mi
```

## 監視・アラート

### 監視項目

- レート制限違反数
- Turnstile失敗率
- 異常なトラフィックパターン
- エラー率

### アラート設定

- エラー率 > 5%: 警告
- レート制限違反 > 100/分: 警告
- DDoS検出: Cloudflareダッシュボード

## インシデント対応

1. **検出**: Cloudflare Analytics / Cloud Run監視
2. **確認**: ログで攻撃パターン特定
3. **対応**:
   - Cloudflare: Under Attack Mode有効化
   - アプリ: IPブロック追加
4. **収束確認**: トラフィック正常化を確認
5. **記録**: インシデントレポート作成
