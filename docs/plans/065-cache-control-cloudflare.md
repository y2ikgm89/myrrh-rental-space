# Cache-Control ヘッダー実装計画

## 概要

Next.js 16 PPR + Cloudflare CDN 連携のための Cache-Control ヘッダーを実装する。
**積極的戦略**を採用し、Cloud Run無料枠を最大限活用する。

## 採用戦略: 積極的

| 項目               | 内容                             |
| ------------------ | -------------------------------- |
| **帯域幅削減効果** | 約95%                            |
| **無料枠内PV目安** | 〜50万PV/月                      |
| **追加実装**       | Cloudflareキャッシュパージ       |
| **更新反映**       | revalidateTag + Cloudflareパージ |

## 現状分析

### プロジェクトのキャッシュ戦略（2層構造）

| 層                    | 技術                                       | 現状        |
| --------------------- | ------------------------------------------ | ----------- |
| **サーバーサイド**    | `use cache` + `cacheLife()` + `cacheTag()` | ✅ 実装済み |
| **CDN（Cloudflare）** | Cache-Control ヘッダー                     | ✅ 実装済み |

### ページ分類（調査結果）

| 分類                | ページ                                                    | サーバーキャッシュ   |
| ------------------- | --------------------------------------------------------- | -------------------- |
| **PPRベース**       | `/spaces/[id]`, `/news/[id]`, `/blog/[slug]`, `/p/[slug]` | `cacheLife('hours')` |
| **PPRハイブリッド** | `/blog`, `/faq`, `/terms`                                 | `cacheLife('hours')` |
| **動的**            | `/`, `/spaces`, `/news`, `/contact`, `/about`             | なし                 |
| **認証必須**        | `/admin/*`, `/reservation`                                | キャッシュ禁止       |

## 設計方針

### Next.js 16 PPR + Cloudflare の推奨設定

PPRでは静的シェルと動的コンテンツが混在するため、CDNキャッシュは**保守的に設定**する。

```
サーバーキャッシュ（use cache）→ 高速化の主役
CDNキャッシュ（Cache-Control）→ 補助的役割
```

### Cache-Control 設計

| パス                  | Cache-Control                                        | 理由             |
| --------------------- | ---------------------------------------------------- | ---------------- |
| `/_next/static/*`     | 自動（immutable）                                    | Next.js自動設定  |
| `/admin/:path*`       | `private, no-cache, no-store, must-revalidate`       | 認証必須         |
| `/reservation/:path*` | `private, no-cache, no-store, must-revalidate`       | リアルタイム性   |
| `/api/:path*`         | `private, no-cache`                                  | API Routes       |
| 公開ページ            | `public, s-maxage=3600, stale-while-revalidate=3600` | 積極的キャッシュ |

**公開ページの設計意図:**

- `s-maxage=3600`: CDNで1時間キャッシュ
- `stale-while-revalidate=3600`: バックグラウンド再検証中は古いコンテンツを返す
- 更新時はCloudflare APIでキャッシュパージ

## 実装計画

### Step 1: next.config.ts 修正 ✅

`headers()` 関数に Cache-Control 設定を追加。

```typescript
// 追加するヘッダー設定
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
```

### Step 2: Cloudflare設定を管理画面に追加 ✅

既存のAPIキー管理パターン（Resend, Turnstile等）に従って実装。

#### 2-1. Prismaスキーマ更新 ✅

`prisma/schema.prisma` の Settings モデルに追加:

```prisma
cloudflareZoneId          String?
cloudflareApiToken        String?  // 暗号化保存
cloudflareLastTestedAt    DateTime?
cloudflareConnectionStatus String?
```

#### 2-2. Server Actions追加 ✅

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/api-keys.ts` に追加:

- `getCloudflareConfig()` - 設定取得
- `updateCloudflareSettings()` - 設定更新
- `testCloudflareConnectionAction()` - 接続テスト
- `clearCloudflareKeys()` - キークリア

#### 2-3. 管理画面UI追加 ✅

`src/app/(admin)/admin/(dashboard)/settings/_components/sections/CloudflareSection.tsx` を新規作成

#### 2-4. キャッシュパージ実装 ✅

`src/shared/lib/cloudflare.ts` を新規作成:

```typescript
// DBからCloudflare設定を取得してキャッシュパージ
export async function purgeCloudflareCache(
  urls: string[],
): Promise<PurgeResult>;
export async function purgeAllCloudflareCache(): Promise<PurgeResult>;
export async function purgeSpaceCache(id?: string): Promise<PurgeResult>;
export async function purgeBlogCache(slug?: string): Promise<PurgeResult>;
export async function purgeNewsCache(id?: string): Promise<PurgeResult>;
export async function purgePageCache(slug: string): Promise<PurgeResult>;
export async function purgeHomeCache(): Promise<PurgeResult>;
export async function purgeFaqCache(): Promise<PurgeResult>;
export async function purgeTermsCache(): Promise<PurgeResult>;
```

### Step 3: Server Actionsにパージ呼び出し追加 ✅

`revalidateTag()` を呼び出している箇所に `void purgeXxxCache()` を追加。

対象ファイル:

- `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/blog.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/faq.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/navigation.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/announcement-bar.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts`

### Step 4: ドキュメント更新 ✅

`docs/operations/cloudflare.md` を PPR + 積極的戦略に更新:

- ISR前提の記述をPPR対応に修正
- `use cache` + `cacheLife()` の説明を追加
- 積極的Cache-Control設計の説明を追加
- Cloudflare Cache Rules の推奨設定を更新
- キャッシュパージの運用方法を追加

## 修正対象ファイル

1. `next.config.ts` - Cache-Control ヘッダー追加 ✅
2. `prisma/schema.prisma` - Cloudflare設定フィールド追加 ✅
3. `src/app/(admin)/.../_shared/actions/settings/api-keys.ts` - Cloudflare Server Actions追加 ✅
4. `src/app/(admin)/.../settings/_components/sections/CloudflareSection.tsx` - **新規作成** ✅
5. `src/app/(admin)/.../settings/_components/sections/index.ts` - エクスポート追加 ✅
6. `src/shared/lib/cloudflare.ts` - **新規作成**（キャッシュパージ実装） ✅
7. `src/app/(admin)/.../_shared/actions/*.ts` - パージ呼び出し追加 ✅
8. `docs/operations/cloudflare.md` - PPR + 積極的戦略に更新 ✅

## 検証方法

```bash
# 1. ビルド確認
bun run type-check && bun run lint && bun run build

# 2. 開発サーバーでヘッダー確認
bun dev
curl -I http://localhost:3000/admin/
curl -I http://localhost:3000/reservation
curl -I http://localhost:3000/api/health
curl -I http://localhost:3000/

# 3. 期待するヘッダー
# /admin/* → Cache-Control: private, no-cache, no-store, must-revalidate
# /reservation → Cache-Control: private, no-cache, no-store, must-revalidate
# /api/* → Cache-Control: private, no-cache
# / → Cache-Control: public, s-maxage=3600, stale-while-revalidate=3600

# 4. Cloudflareパージのテスト（本番環境）
# 管理画面でコンテンツ更新 → 公開ページで即時反映を確認
```

## 管理画面での設定手順

1. 管理画面 → 設定 → 外部サービス連携 → Cloudflare
2. Zone ID と API Token を入力
3. 「接続テスト」で確認
4. 保存

**Cloudflare側のAPIトークン作成手順**:

1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token → Custom token
3. Permissions: Zone > Cache Purge > Purge
4. Zone Resources: Include > Specific zone > your-domain.com

## 完了日

2026-01-23
