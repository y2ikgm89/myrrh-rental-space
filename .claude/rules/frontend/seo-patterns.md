---
paths:
  - src/app/(public*)/_shared/lib/seo/**
  - src/app/(public*)/_shared/components/seo/**
  - src/app/(public*)/_shared/lib/page-metadata*
  - src/app/(public*)/*/page.tsx
  - src/app/(public*)/[*]/page.tsx
---

# SEO / 構造化データパターンルール

> JSON-LD @graph / microdata / NAP 一貫性 / MEO 対応

## JsonLd コンポーネント一覧

`@/public/components/seo/JsonLd.tsx` で提供:

| コンポーネント        | 型                             | 用途                     |
| --------------------- | ------------------------------ | ------------------------ |
| `GraphJsonLd`         | LocalBusiness + WebSite @graph | layout.tsx 共通（主要）  |
| `ArticleJsonLd`       | Article                        | `/posts/[slug]/page.tsx` |
| `NewsArticleJsonLd`   | NewsArticle                    | `/news/[slug]/page.tsx`  |
| `BreadcrumbJsonLd`    | BreadcrumbList                 | 各詳細ページ             |
| `FAQPageJsonLd`       | FAQPage                        | FAQ ページ               |
| `ProductJsonLd`       | Product                        | スペース詳細ページ向け   |
| `LocalBusinessJsonLd` | LocalBusiness（単独）          | @graph を使わない場合    |
| `OrganizationJsonLd`  | Organization                   | 組織情報単独出力         |
| `WebSiteJsonLd`       | WebSite（単独）                | @graph を使わない場合    |

## 禁止事項

1. **NAP 情報のハードコード禁止**
   - Footer・JSON-LD・Contact すべて DB から取得（→ `frontend/seo/local-business.md`）

   ```tsx
   // NG: NAP情報をハードコード
   <address>東京都渋谷区〇〇 1-2-3</address>

   // OK: DBから取得
   const info = await getBusinessInfo()
   <address>{info.address}</address>
   ```

2. **site-wide layout.tsx に LocalBusiness を配置禁止**
   - layout.tsx の `@graph` は `Organization + WebSite` のみ。`LocalBusiness` は `/access` および `/access/[slug]` ページに委譲する
   - `getLocalBusinessJsonLdData()` は廃止済み。`getAllPublishedLocationsJsonLdData()` / `getLocationJsonLdDataBySlug()` を使用

3. **JSON-LD 内のエスケープ漏れ禁止**
   - `JsonLd.tsx` の内部 `JsonLd` コンポーネントを使用（Unicode エスケープ実装済み）

   ```typescript
   // NG: ユーザー入力を直接 JSON-LD に埋め込む（XSS リスク）
   const jsonLd = `{"name": "${businessName}"}` // businessName に <script> が含まれると危険

   // OK: GraphJsonLd コンポーネント経由（内部で自動エスケープ済み）
   <GraphJsonLd {...graphData} />
   ```

4. **@graph 外での WebSite/LocalBusiness 個別出力禁止**
   - `GraphJsonLd` を使用し、`@graph` 配列で統合出力

5. **LocalBusiness への AggregateRating 禁止**
   - Google ポリシー（2019 年 9 月〜）により自社レビューの LocalBusiness 星評価はリッチリザルト非対象
   - **Product 型への AggregateRating は許可**（スペース詳細ページで使用。レビュー 1 件以上で出力）

6. **`generatePageMetadata(slug, fallback)` 形式の呼び出し禁止**
   - 第 2 引数は存在しない。`generatePageMetadata(slug)` のみ
   - 詳細 → `frontend/seo/metadata-factory.md`

7. **`hasMap` と `googleMapsUrl` の混同禁止**
   - `hasMap`（JSON-LD 内）: 緯度経度 URL (`maps?q=lat,lng`)
   - `googleMapsUrl`（コンポーネント表示用）: Place ID URL

## noindex 対象ページ

| ページ                   | ファイル                                                                                        | 方式                                |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| 404                      | `not-found.tsx`                                                                                 | static metadata                     |
| プレビュー               | `posts/preview/[slug]/page.tsx`, `news/preview/[slug]/page.tsx`                                 | static metadata                     |
| ログイン                 | `login/page.tsx`                                                                                | static metadata                     |
| 管理者パスワードリセット | `(admin)/admin/(auth)/forgot-password/page.tsx`, `(admin)/admin/(auth)/reset-password/page.tsx` | static metadata                     |
| マイページ               | `mypage/layout.tsx`                                                                             | layout metadata（全サブページ継承） |

**新規認証・プライベートページ追加時は必ず `robots: { index: false, follow: false }` を設定すること。**

## ファイル配置

| パス                                   | 内容                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@/public/components/seo/JsonLd.tsx`   | `GraphJsonLd`, `ArticleJsonLd`, `NewsArticleJsonLd`, `BreadcrumbJsonLd`, `FAQPageJsonLd`, `ProductJsonLd` 等                                                                   |
| `@/public/lib/seo/json-ld-config.ts`   | `getGraphJsonLdData()`, `getOrganizationJsonLdData()`, `getWebSiteJsonLdData()`, 共有定数（`DAY_MAP`, `DAY_LABELS`, `ATTR_LABELS`）。`getLocalBusinessJsonLdData()` は廃止済み |
| `@/public/lib/seo/location-json-ld.ts` | `buildLocationLocalBusinessJsonLdData()`, `getAllPublishedLocationsJsonLdData()`, `getLocationJsonLdDataBySlug()` — per-location LocalBusiness JSON-LD                         |
| `@/public/lib/seo/metadata-factory.ts` | `getSeoSettings()`, `generateArticleMetadata()`                                                                                                                                |
| `@/public/lib/seo/index.ts`            | SEO ライブラリ barrel export                                                                                                                                                   |
| `@/public/lib/page-metadata.ts`        | `generatePageMetadata(slug)`, `getPageSeo(slug)`, `getDefaultPageSeo(slug)`                                                                                                    |
| `@/public/data/business.ts`            | `getBusinessInfo()` — コンポーネント向けビジネス情報                                                                                                                           |
| `@/shared/lib/settings/public.ts`      | `getPublicBusinessSettings()` — 公開設定取得（NAP 含む）                                                                                                                       |
