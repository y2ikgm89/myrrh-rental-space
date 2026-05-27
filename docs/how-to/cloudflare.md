# Cloudflare CDN 統合ガイド

Next.js PPR + Cloud Run + Cloudflare CDN による 2 層キャッシュ戦略の設定・運用手順。設計の「なぜ」は [`../explanation/caching.md`](../explanation/caching.md) を参照。

## 概要

公開ページは `'use cache'` + `cacheLife()` + `cacheTag()` をサーバーサイドキャッシュ層、Cloudflare CDN を補助層に重ねる。コンテンツ更新時は Server Action の `afterSuccess` で `updateTag()`（read-your-own-writes）と `fireAndForget(purgeXxxCache(...))`（CDN パージ）を同時実行する。

### 2 層キャッシュ構造

| 層               | 技術                                        | 役割                |
| ---------------- | ------------------------------------------- | ------------------- |
| サーバーサイド   | `'use cache'` + `cacheLife` + `cacheTag`    | 高速化の主役        |
| CDN (Cloudflare) | `Cache-Control` ヘッダー + 自動 cache purge | 帯域幅削減 + 補助層 |

積極的キャッシュ戦略下の実測目安: Cloud Run 帯域幅約 95% 削減、無料枠内 PV 目安〜50 万 PV/月、TTFB 50% 以上改善、LCP 30% 以上改善。

## キャッシュ戦略

公開ページは `public, s-maxage=3600, stale-while-revalidate=3600` を設定し、コンテンツ更新時に Cloudflare API でパージする。

### ページ分類

| 分類             | ページ                                                   | サーバーキャッシュ   | CDN キャッシュ |
| ---------------- | -------------------------------------------------------- | -------------------- | -------------- |
| PPR ベース       | `/spaces/[slug]`, `/news/[slug]`, `/posts/[...segments]` | `cacheLife('hours')` | 1 時間         |
| PPR ハイブリッド | `/posts`, `/faq`, `/terms`                               | `cacheLife('hours')` | 1 時間         |
| 動的             | `/`, `/spaces`, `/news`, `/contact`                      | なし                 | 1 時間         |
| 認証必須         | `/admin/*`, `/reservation/*`                             | なし                 | キャッシュ禁止 |
| API              | `/api/*`                                                 | なし                 | キャッシュ禁止 |

### Next.js 設定

`Cache-Control` ヘッダーの SSoT は [`next.config.ts`](../../next.config.ts) の `headers()` 関数。route group ごとに `public, s-maxage=3600, stale-while-revalidate=3600`（公開ページ）/ `private, no-cache, no-store, must-revalidate`（管理 / 予約）/ `private, no-cache`（API）が割り当てられる。`'use cache'` + `cacheLife` 等の実装パターン詳細は [`../explanation/caching.md`](../explanation/caching.md) と Claude Code 用 path-scoped rule `.claude/rules/server-actions/use-cache.md` を参照。

## Cloudflare 設定

### API トークン作成

1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token → Custom token
3. Permissions: `Zone > Cache Purge > Purge`
4. Zone Resources: `Include > Specific zone > <対象ドメイン>`
5. Create Token

### 管理画面での登録

1. 管理画面 → 設定 → 外部サービス連携 → Cloudflare
2. Zone ID と API Token を入力
3. 接続テストで確認
4. 保存

Site / Zone Key は DB の `Settings` テーブルに AES-256-GCM で暗号化保存される（環境変数には置かない）。

## 自動キャッシュパージ

### 仕組み

コンテンツ更新時に Server Action の `afterSuccess` が以下を同時実行する。

1. `updateTag(CACHE_TAGS.XXX)` でサーバーキャッシュを即時無効化（Server Actions では `updateTag` が canonical、Route Handler / cron / webhook は `revalidateTag(tag, CACHE_LIFE.MAX)` を使う）
2. `fireAndForget(purgeXxxCache(...))` で Cloudflare CDN キャッシュをパージ（非ブロッキング、`@/shared/lib/async-utils`）

### パージ関数

| 関数                        | 対象パス                       |
| --------------------------- | ------------------------------ |
| `purgeSpaceCache(spaceId?)` | `/spaces`, `/spaces/<spaceId>` |
| `purgePostCache(slug?)`     | `/posts`, `/posts/<slug>`      |
| `purgeNewsCache(newsId?)`   | `/news`, `/news/<newsId>`      |
| `purgePageCache(slug)`      | `/<slug>` (custom page)        |
| `purgeHomeCache()`          | `/`                            |
| `purgeFaqCache()`           | `/faq`                         |
| `purgeTermsCache()`         | `/terms`                       |
| `purgeAllCloudflareCache()` | 全キャッシュ                   |

### 実装例

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts
"use server";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { purgeSpaceCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";

export async function updateSpace(id: string, input: UpdateSpaceInput) {
  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: id,
    execute: async () => updateSpaceCommand(id, input),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
      fireAndForget(purgeSpaceCache(id), { operation: "purgeSpaceCache" });
    },
  });
}
```

実行順序契約は [`.claude/rules/server-actions/implementation.md`](../../.claude/rules/server-actions/implementation.md) §`executeAdminMutationResult` 実行順序契約を参照。`void purgeXxxCache()` の直接利用は禁止（`fireAndForget` 経由が SSoT、`unhandled rejection` 対策のため）。

## Cloudflare Dashboard 設定

### DNS

1. Cloudflare ダッシュボードで「Add a Site」をクリック
2. ドメイン名を入力
3. Cloud Run のエンドポイントへ A / CNAME レコードを追加（Cloud Run の正本 URL を CNAME 推奨）
4. プロキシモードを有効化（オレンジ雲アイコン）

### SSL/TLS

| 設定                | 推奨値        |
| ------------------- | ------------- |
| SSL/TLS モード      | Full (Strict) |
| Always Use HTTPS    | 有効          |
| Minimum TLS Version | TLS 1.2 以上  |

### Cache Rules

Cloudflare Dashboard → Caching → Configuration → Cache Rules で以下を設定する（先頭が高優先）。

| 優先 | URL               | Cache Status           | 補足                                      |
| ---- | ----------------- | ---------------------- | ----------------------------------------- |
| 1    | `/admin/*`        | Bypass                 | 管理画面（CDN キャッシュ禁止）            |
| 2    | `/reservation/*`  | Bypass                 | 予約ページ（CDN キャッシュ禁止）          |
| 3    | `/api/*`          | Bypass                 | API Routes（CDN キャッシュ禁止）          |
| 4    | `/_next/static/*` | Cache + Respect origin | 静的アセット（Next.js が長期 TTL を発行） |
| 5    | `/*`              | Cache + Respect origin | 公開ページ                                |

## トラブルシューティング

### キャッシュが更新されない

1. 管理画面で Cloudflare 接続テストを実行
2. Zone ID と API Token を確認
3. ログで `Cloudflare cache purge failed` を検索

### パージ API がエラー

1. Cloudflare Dashboard で API トークン権限を確認
2. `Zone > Cache Purge > Purge` 権限の有無を確認
3. Zone Resources が対象ドメインを指しているか確認

### コンテンツ更新が反映遅延

`stale-while-revalidate` の挙動（最大 1 時間まで古いコンテンツが配信される）。即時反映が必要な場合は Cloudflare Dashboard → Caching → Configuration → Purge Cache で手動パージする。

### Cloudflare 未設定環境での挙動

管理画面で Cloudflare 設定が未登録の場合、CDN パージ処理はスキップされる。サーバーサイドキャッシュ（Server Action の `updateTag` / Route Handler の `revalidateTag`）は正常に動作する。

## モニタリング

| 確認項目           | 場所                                                          |
| ------------------ | ------------------------------------------------------------- |
| キャッシュヒット率 | Cloudflare Dashboard → Analytics                              |
| パージログ         | アプリケーションログで `Cloudflare cache purged` を検索       |
| パージエラー       | アプリケーションログで `Cloudflare cache purge failed` を検索 |

## 関連

- [`../explanation/caching.md`](../explanation/caching.md) — キャッシュ戦略の設計判断
- [`./deploy.md`](./deploy.md) — Cloud Run デプロイ手順
- [`./harden-protection.md`](./harden-protection.md) — Cloudflare DDoS / Turnstile / WAF
- [Cloudflare Cache Purge API](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-url/)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
