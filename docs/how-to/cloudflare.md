# Cloudflare CDN統合ガイド

> **Note**: このドキュメントには、Next.js 16 PPR + Cloud Run + Cloudflare CDNの統合について記載されています。

---

## 概要

このシステムは、Next.js 16 PPR（Partial Pre-Rendering）とCloudflare CDNを組み合わせた2層キャッシュ戦略を採用しています。

### 2層キャッシュ構造

| 層                    | 技術                                       | 役割                    |
| --------------------- | ------------------------------------------ | ----------------------- |
| **サーバーサイド**    | `use cache` + `cacheLife()` + `cacheTag()` | 高速化の主役            |
| **CDN（Cloudflare）** | Cache-Control ヘッダー                     | 補助的役割 + 帯域幅削減 |

### 期待される効果

| 項目               | 効果        |
| ------------------ | ----------- |
| **帯域幅削減**     | 約95%       |
| **無料枠内PV目安** | 〜50万PV/月 |
| **TTFB改善**       | 50%以上     |
| **LCP改善**        | 30%以上     |

---

## キャッシュ戦略

### 積極的戦略（採用）

公開ページに `public, s-maxage=3600, stale-while-revalidate=3600` を設定し、コンテンツ更新時にCloudflare APIでキャッシュをパージします。

### ページ分類

| 分類                | ページ                                                     | サーバーキャッシュ   | CDNキャッシュ  |
| ------------------- | ---------------------------------------------------------- | -------------------- | -------------- |
| **PPRベース**       | `/spaces/[id]`, `/news/[id]`, `/posts/[slug]`, `/p/[slug]` | `cacheLife('hours')` | 1時間          |
| **PPRハイブリッド** | `/posts`, `/faq`, `/terms`                                 | `cacheLife('hours')` | 1時間          |
| **動的**            | `/`, `/spaces`, `/news`, `/contact`, `/about`              | なし                 | 1時間          |
| **認証必須**        | `/admin/*`, `/reservation/*`                               | なし                 | キャッシュ禁止 |
| **API**             | `/api/*`                                                   | なし                 | キャッシュ禁止 |

---

## Next.js設定

### Cache-Control ヘッダー（next.config.ts）

```typescript
async headers() {
  return [
    // 管理画面（キャッシュ禁止）
    {
      source: '/admin/:path*',
      headers: [
        { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
      ],
    },
    // 予約ページ（キャッシュ禁止）
    {
      source: '/reservation/:path*',
      headers: [
        { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
      ],
    },
    // API Routes（キャッシュ禁止）
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'private, no-cache' },
      ],
    },
    // 公開ページ（積極的キャッシュ）
    {
      source: '/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=3600' },
      ],
    },
  ]
}
```

### サーバーサイドキャッシュ（use cache）

PPRページでは `use cache` ディレクティブと `cacheLife()` を使用：

```typescript
// src/app/(public)/spaces/[id]/page.tsx
import { cacheLife, cacheTag } from "next/cache";

export default async function SpacePage({ params }: Props) {
  "use cache";
  cacheLife("hours");
  cacheTag("space", `space:${params.id}`);

  // ... コンポーネントの実装
}
```

---

## Cloudflare設定（管理画面）

### 設定手順

1. **管理画面** → **設定** → **外部サービス連携** → **Cloudflare**
2. **Zone ID** と **API Token** を入力
3. **接続テスト** で確認
4. **保存**

### Cloudflare APIトークン作成手順

1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token → Custom token
3. **Permissions**: Zone > Cache Purge > Purge
4. **Zone Resources**: Include > Specific zone > your-domain.com
5. Create Token

### 必要な権限

| 項目               | 設定                                     |
| ------------------ | ---------------------------------------- |
| **Permissions**    | Zone > Cache Purge > Purge               |
| **Zone Resources** | Include > Specific zone > (対象ドメイン) |

---

## 自動キャッシュパージ

### 仕組み

コンテンツを更新すると、Server Actionsが自動的に以下を実行：

1. `revalidateTag()` でサーバーキャッシュを無効化
2. `purgeXxxCache()` でCloudflare CDNキャッシュをパージ

### パージ関数

| 関数                        | 対象パス                       |
| --------------------------- | ------------------------------ |
| `purgeSpaceCache(id?)`      | `/spaces`, `/spaces/[id]`, `/` |
| `purgePostCache(slug?)`     | `/posts`, `/posts/[slug]`, `/` |
| `purgeNewsCache(id?)`       | `/news`, `/news/[id]`, `/`     |
| `purgePageCache(slug)`      | `/p/[slug]`                    |
| `purgeFaqCache()`           | `/faq`                         |
| `purgeTermsCache()`         | `/terms`                       |
| `purgeHomeCache()`          | `/`                            |
| `purgeAllCloudflareCache()` | 全キャッシュ                   |

### 実装例

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts
import { revalidateTag } from "next/cache";
import { purgeSpaceCache } from "@/shared/lib/cloudflare";

export const updateSpace = withPermission(
  "space",
  "update",
)(async (user, id, data) => {
  // ... 更新処理

  // サーバーキャッシュ無効化
  revalidateTag(CACHE_TAGS.SPACES, "default");

  // Cloudflare CDN キャッシュパージ
  void purgeSpaceCache(id);

  return createSuccess("スペースを更新しました");
});
```

### Fire-and-Forget パターン

`void purgeXxxCache()` を使用して非同期でパージを実行します。これにより：

- ユーザーへのレスポンスがブロックされない
- パージ失敗時もメイン処理に影響しない
- ログにパージ結果が記録される

---

## Cloudflare Dashboard設定

### DNS設定

1. Cloudflareダッシュボードで「Add a Site」をクリック
2. ドメイン名を入力
3. Cloud RunのIPアドレスでAレコードまたはCNAMEレコードを追加
4. **プロキシモードを有効にする**（オレンジの雲アイコン）

### SSL/TLS設定

| 設定                    | 推奨値        |
| ----------------------- | ------------- |
| **SSL/TLSモード**       | Full (strict) |
| **Always Use HTTPS**    | 有効          |
| **Minimum TLS Version** | TLS 1.2       |

### Cache Rules設定（推奨）

Cloudflare Dashboard → Caching → Configuration → Cache Rules

#### 1. 管理画面・予約ページ（キャッシュ禁止）

- **URL**: `/admin/*` OR `/reservation/*`
- **Cache Status**: Bypass

#### 2. API Routes（キャッシュ禁止）

- **URL**: `/api/*`
- **Cache Status**: Bypass

#### 3. 静的アセット

- **URL**: `/_next/static/*`
- **Cache Status**: Cache
- **Edge TTL**: Respect origin headers

#### 4. 公開ページ

- **URL**: `/*`
- **Cache Status**: Cache
- **Edge TTL**: Respect origin headers

---

## トラブルシューティング

### キャッシュが更新されない

**原因**: Cloudflare APIの接続問題

**解決策**:

1. 管理画面でCloudflare接続テストを実行
2. Zone IDとAPI Tokenが正しいか確認
3. ログで `Cloudflare cache purge failed` を確認

### パージAPIがエラーを返す

**原因**: APIトークンの権限不足

**解決策**:

1. Cloudflare DashboardでAPIトークンの権限を確認
2. `Zone > Cache Purge > Purge` 権限があるか確認
3. Zone Resourcesが正しいドメインを指しているか確認

### コンテンツ更新が遅延する

**原因**: stale-while-revalidateによる遅延

**解決策**:

- これは正常な動作です
- 更新後、最大で `stale-while-revalidate` の時間（1時間）だけ古いコンテンツが表示される可能性があります
- 即座に反映が必要な場合は、Cloudflare Dashboardで手動パージを実行

### 手動キャッシュパージ

1. Cloudflare Dashboard → Caching → Configuration → Purge Cache
2. **Purge Everything**: 全キャッシュを削除
3. **Custom Purge**: 特定のURLを指定してパージ

---

## 運用ガイド

### 通常運用

- コンテンツ更新時は自動的にキャッシュがパージされます
- 特別な操作は不要です

### 緊急時の対応

1. **Cloudflare Dashboardで手動パージ**
   - Caching → Configuration → Purge Cache → Purge Everything

2. **Cloudflare設定が未設定の場合**
   - 管理画面でCloudflare設定が未設定の場合、パージ処理はスキップされます
   - サーバーサイドキャッシュ（`revalidateTag`）は正常に動作します

### モニタリング

| 確認項目               | 場所                                                          |
| ---------------------- | ------------------------------------------------------------- |
| **キャッシュヒット率** | Cloudflare Dashboard → Analytics                              |
| **パージログ**         | アプリケーションログで `Cloudflare cache purged` を検索       |
| **パージエラー**       | アプリケーションログで `Cloudflare cache purge failed` を検索 |

---

## コスト最適化

### Cloudflare無料プラン

| 機能                | 利用可否                       |
| ------------------- | ------------------------------ |
| **帯域幅**          | 無制限                         |
| **Cache Purge API** | 利用可能（1,000リクエスト/月） |
| **DDoS保護**        | 基本機能あり                   |
| **Bot Fight Mode**  | 利用可能                       |
| **Cache Rules**     | 10ルールまで                   |

### Cloud Run帯域幅削減

- **削減率**: 約95%（積極的キャッシュ戦略）
- **無料枠内PV目安**: 〜50万PV/月

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../../AGENTS.md) - Codex 向けプロジェクト概要
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - デプロイメント手順
- [`docs/architecture/`](../architecture/) - システムアーキテクチャ

### 外部リソース

- [Next.js Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
- [Cloudflare Cache Purge API](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-url/)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)

---

## 更新履歴

- **2026-01-23**: PPR + 積極的キャッシュ戦略に更新
  - `use cache` + `cacheLife()` 対応
  - Cloudflare API自動パージ機能追加
  - 管理画面でのCloudflare設定機能追加
- **2026-01-05**: 初版作成
  - Next.js 16 + Cloud Run + Cloudflare CDN統合ガイド
