# Cloudflare CDN統合ガイド

> **Note**: このドキュメントには、Next.js 16.1.1 + Cloud Run + Cloudflare CDNの統合について、各技術スタックの公式ベストプラクティスに基づいた実装ガイドが記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。

---

## 概要

このシステムは、Google Cloud Runで実行されるNext.jsアプリケーションの前にCloudflare CDNを配置することで、以下の効果を実現します：

- **帯域幅コスト削減**: Cloud Runの帯域幅コストを70-90%削減
- **パフォーマンス向上**: グローバルCDNによる配信速度向上（TTFB 50%以上改善、LCP 30%以上改善）
- **セキュリティ強化**: DDoS保護、WAF（有料プラン）、Bot管理
- **コスト最適化**: Cloudflare無料プランで十分な機能を提供

---

## 技術スタック確認と最新推奨事項

### Next.js 16.1.1 公式推奨事項

#### 静的アセット
- `/_next/static/*` は自動的に `Cache-Control: public, max-age=31536000, immutable` が設定される
- 追加設定は不要（Next.jsが自動的に最適化）

#### 動的コンテンツ
- `Cache-Control` ヘッダーを明示的に設定（SSR/ISR/SSGに応じて）
- `s-maxage` と `stale-while-revalidate` を活用してCDNキャッシュを最適化

#### CDN統合
- `assetPrefix` は使用しない（Cloudflareプロキシモードで自動処理）
- Next.jsのデフォルト動作を尊重し、CDNがoriginのヘッダーを尊重する設定

### Cloudflare CDN 公式推奨事項

#### キャッシュモード
- **`respect_origin` モード**: Next.jsのCache-Controlヘッダーを尊重
- Edge TTLはoriginのヘッダーに従う（デフォルト設定）

#### Edge TTL設定
- **200-299**: originのCache-Controlヘッダーを尊重
- **400-499**: TTL 0（キャッシュしない）
- **500-599**: TTL -1（no-store）

#### Cache Rules
- パスベースでキャッシュルールを設定
- 静的アセット、SSG/ISRページ、SSRページを適切に分類

### Cloud Run + Cloudflare 統合推奨事項

#### CDN Interconnect
- CloudflareとGoogle Cloudの直接接続を利用可能
- コスト削減効果あり（最大75%の帯域幅コスト削減）

#### Cloudflare Tunnel（オプション）
- セキュリティ向上（パブリックIPアドレス不要）
- 本ガイドでは標準的なプロキシモードを推奨

---

## キャッシュ戦略設計

### 静的アセット（`/_next/static/*`）

**Next.js設定**:
- 自動設定済み（`Cache-Control: public, max-age=31536000, immutable`）
- 追加設定不要

**Cloudflare設定**:
- Cache Rules: 追加設定不要（originのヘッダーを尊重）
- Edge TTL: originを尊重

**TTL**: 1年（immutable）

### 公開ファイル（`/public/*`）

**Next.js設定**:
```javascript
// next.config.js
{
  source: '/public/:path*',
  headers: [
    {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    },
  ],
}
```

**Cloudflare設定**:
- Cache Rules: 追加設定不要（originのヘッダーを尊重）
- Edge TTL: originを尊重

**TTL**: 1年（immutable）

### SSGページ（`/contact`, `/privacy`）

**Next.js設定**:
```javascript
// next.config.js
{
  source: '/contact',
  headers: [
    {
      key: 'Cache-Control',
      value: 'public, s-maxage=31536000, stale-while-revalidate=86400',
    },
  ],
},
{
  source: '/privacy',
  headers: [
    {
      key: 'Cache-Control',
      value: 'public, s-maxage=31536000, stale-while-revalidate=86400',
    },
  ],
}
```

**Cloudflare設定**:
- Cache Rules: キャッシュ有効、Edge TTL: originを尊重

**TTL**: 1年（再検証可能）

### ISRページ

#### `/` (ホームページ)
- **Next.js設定**: `revalidate: 3600`
- **Cache-Control**: `public, s-maxage=3600, stale-while-revalidate=3600`
- **Cloudflare設定**: キャッシュ有効、Edge TTL: originを尊重

#### `/spaces/[id]` (スペース詳細)
- **Next.js設定**: `revalidate: 60`
- **Cache-Control**: `public, s-maxage=60, stale-while-revalidate=300`
- **Cloudflare設定**: キャッシュ有効、Edge TTL: originを尊重

#### `/news`, `/news/[id]` (お知らせ)
- **Next.js設定**: `revalidate: 300`
- **Cache-Control**: `public, s-maxage=300, stale-while-revalidate=600`
- **Cloudflare設定**: キャッシュ有効、Edge TTL: originを尊重

### SSRページ（`/reservation`, `/admin/*`）

**Next.js設定**:
```javascript
// next.config.js
{
  source: '/reservation',
  headers: [
    {
      key: 'Cache-Control',
      value: 'private, no-cache, no-store, must-revalidate',
    },
  ],
},
{
  source: '/admin/:path*',
  headers: [
    {
      key: 'Cache-Control',
      value: 'private, no-cache, no-store, must-revalidate',
    },
  ],
}
```

**Cloudflare設定**:
- Cache Rules: キャッシュ無効

**理由**: リアルタイム性が重要、認証情報を含む可能性

### API Routes

#### 動的API
- **Cache-Control**: `private, no-cache`
- **Cloudflare設定**: キャッシュ無効

#### 静的API（ISR）
- **Cache-Control**: `public, s-maxage=<revalidate>, stale-while-revalidate=<revalidate*2>`
- **Cloudflare設定**: キャッシュ有効、Edge TTL: originを尊重

---

## Next.js設定実装

### `next.config.js` への追加設定

既存のセキュリティヘッダー設定（`docs/SECURITY.md`参照）に加えて、キャッシュヘッダーを追加します。

```javascript
// next.config.js
const securityHeaders = [
  // ... 既存のセキュリティヘッダー設定
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Cloud Run用（既存設定）
  
  async headers() {
    return [
      // セキュリティヘッダー（全パスに適用）
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // 公開ファイル（静的アセット）
      {
        source: '/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // SSGページ
      {
        source: '/contact',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=31536000, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/privacy',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=31536000, stale-while-revalidate=86400',
          },
        ],
      },
      // SSRページ（キャッシュしない）
      {
        source: '/reservation',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
      // API Routes（キャッシュしない）
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

### ISRページのCache-Control設定

ISRページは、各ページコンポーネントで `revalidate` を設定し、Route HandlerまたはMiddlewareでCache-Controlヘッダーを設定します。

```typescript
// src/app/page.tsx (ホームページ)
export const revalidate = 3600

// src/app/spaces/[id]/page.tsx (スペース詳細)
export const revalidate = 60

// src/app/news/page.tsx (お知らせ一覧)
export const revalidate = 300
```

Route HandlerでCache-Controlヘッダーを設定する場合：

```typescript
// src/app/route.ts (例)
import { NextResponse } from 'next/server'

export async function GET() {
  const response = NextResponse.json({ data: '...' })
  response.headers.set(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=3600'
  )
  return response
}
```

---

## Cloudflare設定実装

### DNS設定

1. **Cloudflareアカウント作成**
   - [Cloudflare](https://www.cloudflare.com/)でアカウントを作成

2. **ドメイン追加**
   - Cloudflareダッシュボードで「Add a Site」をクリック
   - ドメイン名を入力

3. **DNS設定**
   - Cloud RunのカスタムドメインのIPアドレスを取得
   - AレコードまたはCNAMEレコードを追加
   - **重要**: プロキシモードを有効にする（オレンジの雲アイコン）

### SSL/TLS設定

1. **SSL/TLSモード**
   - 「SSL/TLS」→「Overview」に移動
   - **モード**: 「Full (strict)」を選択
   - これにより、CloudflareとCloud Run間の通信が暗号化される

2. **自動HTTPSリライト**
   - 「SSL/TLS」→「Edge Certificates」に移動
   - 「Always Use HTTPS」を有効化

### Cache Rules設定

Cloudflareダッシュボードで「Caching」→「Configuration」→「Cache Rules」に移動し、以下のルールを設定します。

#### 1. 静的アセット（`/_next/static/*`）

**設定名**: `Static Assets`
- **URL**: `/_next/static/*`
- **Cache Status**: Cache
- **Edge TTL**: Respect origin headers

#### 2. 公開ファイル（`/public/*`）

**設定名**: `Public Files`
- **URL**: `/public/*`
- **Cache Status**: Cache
- **Edge TTL**: Respect origin headers

#### 3. SSGページ

**設定名**: `SSG Pages`
- **URL**: `/contact` OR `/privacy`
- **Cache Status**: Cache
- **Edge TTL**: Respect origin headers

#### 4. ISRページ

**設定名**: `ISR Pages`
- **URL**: `/` OR `/spaces/*` OR `/news/*`
- **Cache Status**: Cache
- **Edge TTL**: Respect origin headers

#### 5. SSRページ（キャッシュしない）

**設定名**: `SSR Pages - No Cache`
- **URL**: `/reservation` OR `/admin/*`
- **Cache Status**: Bypass

#### 6. API Routes（キャッシュしない）

**設定名**: `API Routes - No Cache`
- **URL**: `/api/*`
- **Cache Status**: Bypass

### セキュリティ設定

#### DDoS保護（無料プラン）

**自動有効**: 無料プランでも基本機能あり

**保護範囲**:
- レイヤー3/4 DDoS攻撃（SYN Flood、UDP Flood、ICMP Floodなど）
- レイヤー7 DDoS攻撃（HTTP Flood、Slowloris攻撃など）の基本機能

**設定確認**:
1. Cloudflareダッシュボードにログイン
2. 「Security」→「DDoS」に移動
3. 保護状況を確認（自動有効になっていることを確認）

**詳細**: [`../requirements/DDOS_PROTECTION_REQUIREMENTS.md`](../requirements/DDOS_PROTECTION_REQUIREMENTS.md)を参照してください。

#### Bot Fight Mode（無料プラン）

**利用可能**: 無料プランで利用可能

**設定手順**:
1. Cloudflareダッシュボードにログイン
2. 「Security」→「Bots」に移動
3. 「Bot Fight Mode」を有効化

**機能**:
- 既知のBotトラフィックの自動検出とブロック
- レガシーBotの検出とブロック
- 検索エンジンのBotは自動的に許可

**注意**: 無料プランでは高度なカスタマイズは不可（有料プランのBot Managementが必要）

**詳細**: [`../requirements/TURNSTILE_REQUIREMENTS.md`](../requirements/TURNSTILE_REQUIREMENTS.md)を参照してください。

#### WAF（Web Application Firewall）

**有料プラン**: Proプラン以上で利用可能

**注意**: このプロジェクトでは商用無料プランでの実現を優先するため、WAFは使用しません。代わりに、アプリケーション側のレート制限とIPブロック機能を活用します。

**詳細**: [`../requirements/ABUSE_PROTECTION_REQUIREMENTS.md`](../requirements/ABUSE_PROTECTION_REQUIREMENTS.md)を参照してください。

---

## セキュリティヘッダーとの統合

### 既存設定の維持

`docs/SECURITY.md` に記載されているセキュリティヘッダー設定は、Cloudflare経由でも正しく設定されます。

### CSP（Content Security Policy）の調整

既存のCSP設定（`docs/SECURITY.md`参照）は、Cloudflare CDN経由のリソースも許可するように設定されています：

```javascript
"img-src 'self' data: https:",
"font-src 'self' data:",
```

これにより、Supabase Storageの画像URL（`https://`）も許可されています。

---

## パフォーマンス最適化

### 画像最適化

- **Next.js Image Component**: 継続使用
- **Supabase Storage**: 継続使用（CDN経由で配信）
- **Cloudflare Image Resizing**: オプション（有料プラン）

### 帯域幅削減効果

- **静的アセット**: 100% CDN経由（Cloud Runの帯域幅0）
- **HTML（SSG/ISR）**: キャッシュヒット時はCDN経由
- **予想削減率**: 70-90%（トラフィック構成による）

### パフォーマンス指標

- **TTFB（Time to First Byte）**: 50%以上改善
- **LCP（Largest Contentful Paint）**: 30%以上改善
- **帯域幅使用量**: 70%以上削減

---

## 実装手順

### フェーズ1: 準備

1. **Cloudflareアカウント作成**
   - [Cloudflare](https://www.cloudflare.com/)でアカウントを作成

2. **ドメイン追加**
   - Cloudflareダッシュボードで「Add a Site」をクリック
   - ドメイン名を入力

3. **DNS設定**
   - Cloud RunのカスタムドメインのIPアドレスを取得
   - AレコードまたはCNAMEレコードを追加
   - **プロキシモードを有効にする**（オレンジの雲アイコン）

### フェーズ2: Next.js設定

1. **`next.config.js` にキャッシュヘッダー設定を追加**
   - 上記の「Next.js設定実装」セクションを参照

2. **各ページ/API Routeに適切なCache-Controlヘッダーを設定**
   - ISRページ: `revalidate` を設定
   - Route Handler: Cache-Controlヘッダーを設定

3. **動作確認（開発環境）**
   ```bash
   bun run dev
   ```
   - 開発サーバーでキャッシュヘッダーが正しく設定されているか確認

### フェーズ3: Cloudflare設定

1. **Cache Rules設定**
   - 上記の「Cache Rules設定」セクションを参照

2. **SSL/TLS設定**
   - 「Full (strict)」モードを選択
   - 「Always Use HTTPS」を有効化

3. **セキュリティ設定**
   - DDoS保護: 自動有効
   - Bot Fight Mode: 有効化（無料プラン）

### フェーズ4: 検証

1. **キャッシュ動作確認**
   ```bash
   # 静的アセットのキャッシュ確認
   curl -I https://your-domain.com/_next/static/chunks/main.js
   
   # SSGページのキャッシュ確認
   curl -I https://your-domain.com/contact
   
   # SSRページがキャッシュされていないことを確認
   curl -I https://your-domain.com/reservation
   ```

2. **パフォーマンス測定**
   - [PageSpeed Insights](https://pagespeed.web.dev/)で測定
   - Cloudflare Analyticsでキャッシュヒット率を確認

3. **セキュリティヘッダー確認**
   ```bash
   curl -I https://your-domain.com/
   ```
   - セキュリティヘッダーが正しく設定されているか確認

---

## キャッシュ無効化

### デプロイ時

Cloudflareのキャッシュパージは通常不要です。Next.jsの `revalidatePath()` を使用してNext.jsキャッシュを無効化すると、Cloudflareは自動的に再検証します。

### 管理画面更新時

管理画面での更新時は、`revalidatePath()` を使用してNext.jsキャッシュを無効化します：

```typescript
// src/actions/admin/spaces.ts
import { revalidatePath } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  // ... 更新処理
  
  // キャッシュを無効化
  revalidatePath('/spaces/[id]', 'page')
  revalidatePath('/')
}
```

Cloudflareは、Next.jsが新しいコンテンツを返すと自動的に再検証します。

### 手動キャッシュパージ（オプション）

必要に応じて、Cloudflareダッシュボードで手動でキャッシュをパージできます：

1. 「Caching」→「Configuration」→「Purge Cache」に移動
2. 「Purge Everything」をクリック（全キャッシュを削除）
3. または、特定のURLを指定してパージ

---

## トラブルシューティング

### キャッシュが効かない

**問題**: 静的アセットがキャッシュされない

**解決策**:
1. Cloudflareのプロキシモードが有効になっているか確認
2. Cache Rulesが正しく設定されているか確認
3. Next.jsのCache-Controlヘッダーが正しく設定されているか確認

### 動的コンテンツがキャッシュされる

**問題**: SSRページやAPI Routesがキャッシュされる

**解決策**:
1. `next.config.js` で `Cache-Control: private, no-cache` が設定されているか確認
2. CloudflareのCache Rulesで「Bypass」が設定されているか確認

### セキュリティヘッダーが設定されない

**問題**: Cloudflare経由でセキュリティヘッダーが設定されない

**解決策**:
1. `next.config.js` のセキュリティヘッダー設定を確認
2. Cloudflareの「Transform Rules」でヘッダーを追加（オプション）

### SSL/TLSエラー

**問題**: CloudflareとCloud Run間でSSL/TLSエラーが発生

**解決策**:
1. SSL/TLSモードを「Full (strict)」に設定
2. Cloud RunのSSL証明書が正しく設定されているか確認

---

## コスト最適化

### Cloudflare無料プラン

- **帯域幅**: 無制限
- **DDoS保護**: 基本機能あり
- **Bot Fight Mode**: 利用可能
- **Cache Rules**: 利用可能

### Cloud Run帯域幅コスト削減

- **削減率**: 70-90%（トラフィック構成による）
- **計算例**: 
  - 100GB/月のトラフィック → 10-30GB/月に削減
  - コスト削減: 約$5.60-7.20/月（$0.08/GiBの場合）

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - デプロイメント手順
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシー
- [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) - プロジェクト構造

### 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Cloudflare CDN Documentation](https://developers.cloudflare.com/cache/)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloudflare + Google Cloud Integration](https://www.cloudflare.com/learning/cloud/what-is-cloudflare-google-cloud-integration/)

---

## 更新履歴

- **2026-01-05**: 初版作成
  - Next.js 16.1.1 + Cloud Run + Cloudflare CDN統合ガイド
  - キャッシュ戦略設計
  - 実装手順
