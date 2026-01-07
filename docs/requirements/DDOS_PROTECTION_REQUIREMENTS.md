# DDoS対策要件定義

> **Note**: このドキュメントにはDDoS対策の詳細な要件定義が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。セキュリティポリシーについては、[`SECURITY.md`](./SECURITY.md)を参照してください。Cloudflare CDN統合については、[`CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md)を参照してください。

---

## 概要

### DDoS攻撃の種類と対策の概要

このシステムでは、以下のDDoS攻撃に対して多層防御を実装します：

1. **レイヤー3/4 DDoS攻撃（ネットワーク層）**
   - SYN Flood、UDP Flood、ICMP Floodなど
   - Cloudflareの自動DDoS保護で防御

2. **レイヤー7 DDoS攻撃（アプリケーション層）**
   - HTTP Flood、Slowloris攻撃、Slow POST攻撃など
   - Cloudflareの基本機能 + アプリケーション側のレート制限で防御

### 多層防御のアプローチ

以下の3層でDDoS攻撃を防御します：

1. **Cloudflare CDN層**: レイヤー3/4 DDoS保護（自動有効、無料プラン）
2. **Cloud Run層**: タイムアウト設定、自動スケーリング（無料枠内）
3. **アプリケーション層**: レート制限（`@upstash/ratelimit`無料プラン）

### 商用無料プランでの実現

**重要**: この要件定義は、商用無料で利用可能な機能のみに限定しています。

- ✅ Cloudflare無料プラン: DDoS保護（自動有効）、基本統計
- ✅ Cloud Run無料枠: タイムアウト設定、自動スケーリング、ログ監視
- ✅ アプリケーション側: レート制限（`@upstash/ratelimit`無料プラン）
- ❌ 有料プランが必要な機能（Rate Limiting Rules、WAF、高度な監視ツール）は除外

---

## 機能要件

### Cloudflare DDoS保護（無料プラン）

#### 自動DDoS保護

- **有効化**: 無料プランで自動有効
- **保護範囲**: レイヤー3/4 DDoS攻撃（SYN Flood、UDP Flood、ICMP Floodなど）
- **設定確認**: Cloudflareダッシュボードの「Security」→「DDoS」で確認
- **追加設定**: 無料プランでは追加設定不要（自動で最適化）

#### レイヤー7 DDoS対策（基本機能）

- **HTTP Flood対策**: Cloudflareの基本機能で自動検出・ブロック
- **Slowloris攻撃対策**: Cloudflareの基本機能で自動検出・ブロック
- **制限事項**: 無料プランでは高度なカスタマイズは不可（有料プランのRate Limiting Rulesが必要）

#### DDoS保護の確認方法

1. Cloudflareダッシュボードにログイン
2. 「Security」→「DDoS」に移動
3. 保護状況を確認（自動有効になっていることを確認）

---

## 非機能要件

### Cloud Run側の対策（無料枠内）

#### タイムアウト設定

**リクエストタイムアウト**:
- **設定値**: 60秒（デフォルト）
- **設定方法**: Cloud Runのサービス設定で指定
- **目的**: 長時間接続を維持する攻撃（Slowloris攻撃など）を防止

```yaml
# cloud-run-service.yaml（例）
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: myrrh-rental-space
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/timeout: "60s"
```

**接続タイムアウト**:
- Cloud Runでは自動管理（設定不要）
- Cloudflare経由の接続は自動的に最適化される

#### 自動スケーリング設定（無料枠内）

**最大インスタンス数**:
- **推奨値**: 10インスタンス（無料枠内）
- **設定方法**: Cloud Runのサービス設定で指定
- **目的**: DDoS攻撃時のリソース消費を制限

```yaml
# cloud-run-service.yaml（例）
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: myrrh-rental-space
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        autoscaling.knative.dev/minScale: "0"
```

**最小インスタンス数**:
- **推奨値**: 0インスタンス（コスト削減）
- **注意**: コールドスタートが発生する可能性がある

#### CPU/メモリ制限（無料枠内）

**CPU制限**:
- **設定値**: 1 vCPU（無料枠内）
- **設定方法**: Cloud Runのサービス設定で指定

**メモリ制限**:
- **設定値**: 512 MiB（無料枠内）
- **設定方法**: Cloud Runのサービス設定で指定

```yaml
# cloud-run-service.yaml（例）
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: myrrh-rental-space
spec:
  template:
    spec:
      containerConcurrency: 80
      containers:
        - image: gcr.io/my-project/myrrh-rental-space
          resources:
            limits:
              cpu: "1"
              memory: 512Mi
```

---

## 技術要件

### アプリケーション側の対策

#### レート制限（`@upstash/ratelimit`無料プラン）

既存のレート制限実装を活用します。

**詳細**: [`SECURITY.md`](./SECURITY.md)の「レート制限」セクションを参照してください。

**グローバルレート制限**:
- **設定値**: IPアドレスベースで15分間に100リクエスト（[`SECURITY.md`](./SECURITY.md)参照）
- **目的**: DDoS攻撃の緩和

**エンドポイント別レート制限**:
- 予約フォーム、お問い合わせフォーム、ログインフォームに個別のレート制限を設定（[`SECURITY.md`](./SECURITY.md)参照）

#### リクエストサイズ制限

**Next.js設定**:
```javascript
// next.config.js
module.exports = {
  // リクエストボディサイズ制限（10MB）
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}
```

**目的**: 大きなリクエストボディによるDDoS攻撃を防止

#### タイムアウト処理

**Server Actions**:
```typescript
// src/actions/reservation.ts
'use server'

import { headers } from 'next/headers'

export async function createReservation(formData: FormData) {
  // タイムアウト設定（30秒）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  
  try {
    // 処理を実行
    // ...
  } finally {
    clearTimeout(timeoutId)
  }
}
```

**目的**: 長時間実行される処理を防止

---

## 実装要件

### Middlewareでのグローバルレート制限

```typescript
// src/proxy.ts (Next.js 16)
import { NextRequest, NextResponse } from 'next/server'
import { checkGlobalRateLimit } from '@/lib/rate-limit'

export default async function proxy(request: NextRequest) {
  // IPアドレスを取得
  const ipAddress = 
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  
  // グローバルレート制限チェック
  const isAllowed = await checkGlobalRateLimit(ipAddress)
  
  if (!isAllowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * すべてのリクエストパスにマッチ（静的ファイルを除く）
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

### Cloud Run設定ファイル

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: myrrh-rental-space
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        # タイムアウト設定（60秒）
        run.googleapis.com/timeout: "60s"
        # 自動スケーリング設定
        autoscaling.knative.dev/maxScale: "10"
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/target: "80"
    spec:
      containerConcurrency: 80
      containers:
        - image: gcr.io/my-project/myrrh-rental-space:latest
          ports:
            - containerPort: 3000
          resources:
            limits:
              cpu: "1"
              memory: 512Mi
          env:
            - name: PORT
              value: "3000"
```

---

## 監視とアラート（無料プラン）

### Cloudflare Analyticsの活用

**利用可能な統計情報**:
- リクエスト数、帯域幅使用量
- エラー率、レスポンス時間
- DDoS攻撃の検出状況（基本統計）

**確認方法**:
1. Cloudflareダッシュボードにログイン
2. 「Analytics」→「Web Traffic」で確認
3. 異常なトラフィックパターンを監視

### Cloud Runのメトリクス監視（無料枠内）

**利用可能なメトリクス**:
- リクエスト数、エラー率
- レスポンス時間、CPU使用率
- メモリ使用率、インスタンス数

**確認方法**:
1. Google Cloud Consoleにログイン
2. 「Cloud Run」→「サービス」→「メトリクス」で確認
3. 異常なリソース消費を監視

### ログ監視（無料枠内）

**ログ項目**:
- レート制限違反（429エラー）
- タイムアウトエラー
- 異常なリクエストパターン

**ログ形式**:
```typescript
// src/lib/logger.ts
export function logRateLimitViolation(ipAddress: string, path: string) {
  console.log(JSON.stringify({
    level: 'warn',
    type: 'rate_limit_violation',
    ipAddress,
    path,
    timestamp: new Date().toISOString(),
  }))
}
```

### アラート設定（無料プランで利用可能な範囲）

**推奨設定**:
- Cloud Runのメトリクスアラート（無料枠内）
- エラー率が閾値を超えた場合にメール通知（Resend無料プラン）

**制限事項**:
- 高度なアラート機能（例: Datadog、New Relic）は有料のため除外
- 基本的なメール通知のみ実装

---

## テスト要件

### 単体テスト

```typescript
// tests/unit/rate-limit.test.ts
import { describe, it, expect } from 'bun:test'
import { checkGlobalRateLimit } from '@/lib/rate-limit'

describe('Global Rate Limit', () => {
  it('should allow requests within limit', async () => {
    const result = await checkGlobalRateLimit('192.168.1.1')
    expect(result).toBe(true)
  })
  
  it('should reject requests exceeding limit', async () => {
    // 100回リクエストを送信
    for (let i = 0; i < 100; i++) {
      await checkGlobalRateLimit('192.168.1.1')
    }
    
    // 101回目は拒否される
    const result = await checkGlobalRateLimit('192.168.1.1')
    expect(result).toBe(false)
  })
})
```

### 統合テスト

```typescript
// tests/integration/ddos-protection.test.ts
import { describe, it, expect } from 'bun:test'

describe('DDoS Protection', () => {
  it('should block excessive requests', async () => {
    // 大量のリクエストを送信
    const requests = Array(150).fill(null).map(() =>
      fetch('http://localhost:3000/api/test')
    )
    
    const responses = await Promise.all(requests)
    const rateLimitedResponses = responses.filter(r => r.status === 429)
    
    // 一部のリクエストがレート制限でブロックされることを確認
    expect(rateLimitedResponses.length).toBeGreaterThan(0)
  })
})
```

---

## 運用要件

### 定期的な監視

**監視頻度**:
- **日次**: Cloudflare AnalyticsとCloud Runメトリクスの確認
- **週次**: ログのレビューと異常パターンの検出

### DDoS攻撃発生時の対応手順

1. **検出**: Cloudflare AnalyticsまたはCloud Runメトリクスで異常を検出
2. **確認**: ログを確認して攻撃の種類を特定
3. **対応**: 
   - Cloudflareの自動保護が機能していることを確認
   - 必要に応じてIPブロックリストを更新（[`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md)参照）
4. **監視**: 攻撃が収束するまで継続的に監視

### パフォーマンス最適化

**推奨設定**:
- Cloud Runの自動スケーリング設定を最適化
- レート制限の閾値を調整（必要に応じて）

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書（技術スタック詳細）
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシーとベストプラクティス
- [`CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md) - Cloudflare CDN統合ガイド
- [`ABUSE_PROTECTION_REQUIREMENTS.md`](./ABUSE_PROTECTION_REQUIREMENTS.md) - 荒らし対策要件定義

### 外部リソース

- [Cloudflare DDoS Protection](https://www.cloudflare.com/ddos/) - Cloudflare DDoS保護の詳細
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs) - Cloud Runの設定方法
- [Upstash Rate Limit](https://upstash.com/docs/redis/features/ratelimiting) - Upstash Rate Limitの詳細

---

## 更新履歴

- **2026-01-06**: 初版作成、商用無料プランで利用可能なDDoS対策の要件定義を完了
