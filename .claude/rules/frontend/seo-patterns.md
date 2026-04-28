---
paths:
  - src/app/(public*)/_shared/lib/seo/**
  - src/app/(public*)/_shared/components/seo/**
  - src/app/(public*)/_shared/lib/page-metadata*
  - src/app/(public*)/*/page.tsx
  - src/app/(public*)/[*]/page.tsx
---

# SEO / 構造化データパターンルール

> JSON-LD @graph / microdata / NAP一貫性 / MEO対応

## 構造化データ配置

### JSON-LD（`application/ld+json`）

**@graph パターン**（現在の実装）: `Organization + WebSite` を1つの `<script>` タグにまとめ、`@id` で相互参照。`LocalBusiness` は per-location ページに委譲する:

| 型               | @id                                      | 配置場所                                               | 備考                                    |
| ---------------- | ---------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| `Organization`   | `{BASE_URL}/#organization`               | `(public)/layout.tsx`                                  | 全公開ページ共通（サイト代表情報）      |
| `WebSite`        | `{BASE_URL}/#website`                    | `(public)/layout.tsx`                                  | `publisher` で `/#organization` 参照    |
| `LocalBusiness`  | `{BASE_URL}/access/{slug}#localbusiness` | `/access/page.tsx` / `/access/[locationSlug]/page.tsx` | 拠点ごとに出力（`branchOf` で組織参照） |
| `BreadcrumbList` | —                                        | 各ページの `page.tsx`                                  | ページ固有                              |
| `Product`        | —                                        | `/spaces/[slug]/page.tsx`                              | AggregateRating + Offer 付き            |
| `Article`        | —                                        | `/posts/[slug]/page.tsx`                               | ブログ記事詳細                          |
| `NewsArticle`    | —                                        | `/news/[slug]/page.tsx`                                | ニュース詳細                            |

```typescript
// layout.tsx — @graph パターン（実際の実装）
async function StructuredDataContent(): Promise<ReactElement> {
  const graphData = await getGraphJsonLdData()
  return <GraphJsonLd {...graphData} />
}

// body 内の Suspense でラップ
<Suspense fallback={null}>
  <StructuredDataContent />
</Suspense>
```

### 原則

- **@graph で Organization + WebSite を layout.tsx に1つだけ配置**。`LocalBusiness` は layout.tsx に含めない
- **LocalBusiness は per-location 出力**。`/access` および `/access/[locationSlug]` ページで拠点ごとに出力する
- JSON-LDコンポーネントは `@/public/components/seo/JsonLd.tsx` に集約
- XSS対策: JSON文字列は Unicodeエスケープ（`<`, `>`, `&`, U+2028, U+2029）
- `@id` 相互参照でGoogleのナレッジグラフ理解を向上

### microdata（HTML属性）

`BusinessInfo` の NAP 情報に schema.org microdata を付与（`Footer` も同様のパターン）:

```tsx
// BusinessInfo.tsx — 実際の実装パターン
<div className="..." itemScope itemType="https://schema.org/LocalBusiness">
  <meta itemProp="name" content={info.name} />

  <div itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
    {info.postalCode && (
      <meta itemProp="postalCode" content={info.postalCode} />
    )}
    {info.prefecture && (
      <meta itemProp="addressRegion" content={info.prefecture} />
    )}
    {info.city && <meta itemProp="addressLocality" content={info.city} />}
    {info.streetAddress && (
      <meta itemProp="streetAddress" content={info.streetAddress} />
    )}
    {info.address}
  </div>

  <a itemProp="telephone" href={`tel:${info.phone}`}>
    {info.phone}
  </a>
  <a itemProp="email" href={`mailto:${info.email}`}>
    {info.email}
  </a>

  {/* 営業時間 microdata */}
  <time itemProp="openingHours" content={h.microdataContent}>
    {h.time}
  </time>
</div>
```

**注意**: microdata のルート要素は `<address>` ではなく `<div>` に `itemScope itemType` を付与するパターンを採用。

## NAP一貫性（Name・Address・Phone）

- **ビジネス名・住所・電話番号は DB（Settings テーブル）から一元取得**
- Footer、JSON-LD、Contact ページすべて同一データソース
- ハードコード禁止

## データソース

| データ                                      | 取得関数                               | キャッシュタグ                                          | 公開/内部 |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------- | --------- |
| ビジネス情報（コンポーネント用）            | `getBusinessInfo()`                    | `CACHE_TAGS.BUSINESS_SETTINGS`                          | 公開      |
| ビジネス設定（生データ）                    | `getPublicBusinessSettings()`          | `CACHE_TAGS.BUSINESS_SETTINGS`                          | 公開      |
| @graph 統合データ（Organization + WebSite） | `getGraphJsonLdData()`                 | `ORGANIZATION_SETTINGS`, `SOCIAL_LINKS`（サブ関数経由） | 公開      |
| Organization データ                         | `getOrganizationJsonLdData()`          | `CACHE_TAGS.ORGANIZATION_SETTINGS`                      | 公開      |
| WebSite データ                              | `getWebSiteJsonLdData()`               | `CACHE_TAGS.ORGANIZATION_SETTINGS`                      | 公開      |
| 全拠点 LocalBusiness データ（/access 用）   | `getAllPublishedLocationsJsonLdData()` | `CACHE_TAGS.LOCATIONS`                                  | 公開      |
| 拠点単体 LocalBusiness データ               | `getLocationJsonLdDataBySlug(slug)`    | `CACHE_TAGS.LOCATIONS`                                  | 公開      |
| SEO設定                                     | `getSeoSettings()`                     | `CACHE_TAGS.SEO_SETTINGS`                               | 公開      |
| ページSEO                                   | `getPageSeo(slug)`                     | `CACHE_TAGS.PAGE_SEO`                                   | 公開      |

**注意**: `getOrganizationSettings()` と `getSocialLinkUrls()` は `json-ld-config.ts` 内部のプライベート関数。直接インポート不可。

**`getOrganizationJsonLdData()` の用途**:

- `getGraphJsonLdData()` の内部から呼ばれる。サイト名・URL・ロゴのみを含む `Organization` データを返す。LocalBusiness 型は含まない（過去は `LocalBusiness` を返していたが multi-location 対応で per-location 化のため廃止）。

**`getLocalBusinessJsonLdData()` は廃止**。`getAllPublishedLocationsJsonLdData()` / `getLocationJsonLdDataBySlug()` を使用する。

### BusinessInfo データレイヤー

`getBusinessInfo()` は `getPublicBusinessSettings()` をラップし、コンポーネント向けの形状にマッピング:

- `name`: ビジネス名（`businessName`）
- `address`: 結合済み住所文字列（`〒postalCode + prefecture + city + streetAddress + buildingName`）
- `postalCode`, `prefecture`, `city`, `streetAddress`, `buildingName`: microdata用の個別フィールド
- `phone`: 電話番号
- `email`: メールアドレス
- `businessHours`: 生JSON（コンポーネント側でパース）
- `holidayNotice`: 休業日テキスト
- `googleMapsUrl`: Place IDから自動生成（`https://www.google.com/maps/search/?api=1&query=Google&query_place_id={placeId}`）
- `googleReviewUrl`: Googleクチコミ URL
- `businessAttributes`: 型安全パース済み `Record<string, boolean>`

## MEO（ローカル検索最適化）

### LocalBusiness プロパティ一覧（per-location）

各プロパティのソースは `Location` モデルのフィールド。`buildLocationLocalBusinessJsonLdData()` で生成:

| プロパティ                         | ソース（Location モデル）                                     | 備考                                                          |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `@id`                              | `{BASE_URL}/access/{slug}#localbusiness`                      | slug ベースの安定 URI                                         |
| `name`                             | `location.name`                                               |                                                               |
| `description`                      | `location.description`                                        |                                                               |
| `url`                              | `{BASE_URL}/access/{slug}`                                    |                                                               |
| `image`                            | `location.imageUrl`                                           | 配列形式                                                      |
| `telephone`                        | `location.phoneNumber`                                        |                                                               |
| `email`                            | `location.email`                                              |                                                               |
| `address`                          | postalCode / prefecture / city / streetAddress + buildingName | PostalAddress 型・addressCountry: JP                          |
| `openingHoursSpecification`        | `location.businessHours` JSON                                 | 曜日グループ化                                                |
| `specialOpeningHoursSpecification` | `location.specialHolidays` JSON                               | 休業日 `opens/closes: "00:00"`                                |
| `priceRange`                       | `location.priceRange`                                         |                                                               |
| `geo`                              | `location.latitude` + `longitude`                             | 両方設定時のみ。`GeoCoordinates` 型                           |
| `hasMap`                           | lat/lng から生成                                              | `https://www.google.com/maps?q={lat},{lng}`                   |
| `currenciesAccepted`               | 固定 `"JPY"`                                                  |                                                               |
| `paymentAccepted`                  | `location.paymentAccepted`                                    |                                                               |
| `amenityFeature`                   | `location.amenities` JSON                                     | `LocationFeatureSpecification` 型（ATTR_LABELS でラベル変換） |
| `branchOf`                         | `{BASE_URL}/#organization`                                    | 複数拠点時のみ。`includeBranchOf` フラグで制御                |

**注意**: `hasMap`（JSON-LD 内、緯度経度から生成）と `googleMapsUrl`（コンポーネント表示用、Place ID から生成）は別物。

### OpeningHoursSpecification

`businessHours` JSON → schema.org `OpeningHoursSpecification` 変換。
同じ時間帯の曜日をグループ化して出力:

```json
{
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["Monday", "Tuesday", "Wednesday"],
  "opens": "09:00",
  "closes": "21:00"
}
```

### specialOpeningHoursSpecification

`specialHolidays` 日付配列 → 休業日として出力（schema.org 公式パターン）:

```json
{
  "@type": "OpeningHoursSpecification",
  "validFrom": "2026-01-01",
  "validThrough": "2026-01-01",
  "opens": "00:00",
  "closes": "00:00"
}
```

### amenityFeature

`businessAttributes` JSON → `LocationFeatureSpecification` 変換:

```json
{
  "@type": "LocationFeatureSpecification",
  "name": "Wi-Fi",
  "value": true
}
```

### 共有定数（json-ld-config.ts）

フロントエンド表示でも再利用:

| 定数                                 | 用途                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `DAY_MAP`                            | 曜日キー → 英語名（JSON-LD用）例: `monday → 'Monday'`     |
| `DAY_LABELS`                         | 曜日キー → 日本語ラベル（表示用）例: `monday → '月'`      |
| `ATTR_LABELS`                        | 施設属性キー → 日本語ラベル（表示用）例: `wifi → 'Wi-Fi'` |
| `convertToOpeningHoursSpecification` | businessHours JSON → OpeningHoursSpec[] 変換              |

```typescript
// Footer / BusinessInfo での import
import { DAY_LABELS, ATTR_LABELS } from "@/public/lib/seo/json-ld-config";
```

### 営業時間フロントエンド表示パターン

Footer・BusinessInfo で共通のパースロジック:

1. `businessHours` JSON を曜日順にイテレート
2. 同じ時間帯の曜日をグループ化（「月〜金」形式）
3. microdata 用の `content` 属性を生成（`Mo-Fr 09:00-21:00`）
4. `<time itemProp="openingHours" content="...">` で出力

```tsx
{
  hoursDisplay.map((h) => (
    <div key={h.microdataContent}>
      <span>{h.label}</span>
      <time itemProp="openingHours" content={h.microdataContent}>
        {h.time}
      </time>
    </div>
  ));
}
```

## スペース詳細ページの構造化データ

### Product + AggregateRating JSON-LD

スペース詳細ページでは `ProductJsonLd` + `BreadcrumbJsonLd` を使用。レビューが1件以上ある場合のみ `aggregateRating` を出力:

```tsx
// /spaces/[slug]/page.tsx（実際の実装）
const reviewStats = await getSpaceReviewStats(space.id);
const baseUrl = getBaseUrl();
const spaceUrl = `${baseUrl}/spaces/${slug}`;

<BreadcrumbJsonLd
  items={[
    { name: "ホーム", url: "/" },
    { name: "スペース一覧", url: "/spaces" },
    { name: space.name, url: spaceUrl },
  ]}
/>
<ProductJsonLd
  name={space.name}
  description={space.description ?? space.name}
  image={space.mainImageUrl ?? `${baseUrl}/og-image.png`}
  url={spaceUrl}
  offers={{ price: space.hourlyPrice, priceCurrency: "JPY" }}
  {...(reviewStats.totalCount > 0 && {
    aggregateRating: {
      ratingValue: reviewStats.averageRating,
      reviewCount: reviewStats.totalCount,
    },
  })}
/>
```

**注意**:

- `offers` は Google 必須フィールド（price + priceCurrency）
- `aggregateRating` はレビュー0件時に出力すると Google Search Console でエラー
- `bestRating` / `worstRating` は省略時デフォルト 5/1（コンポーネント内部で設定）

## 記事詳細ページの構造化データ

### Article / NewsArticle JSON-LD

ブログ記事・ニュース詳細ページでは `ArticleJsonLd` / `NewsArticleJsonLd` + `BreadcrumbJsonLd` を使用:

```tsx
// /posts/[slug]/page.tsx — ブログ記事（実際の実装）
<BreadcrumbJsonLd
  items={[
    { name: 'ホーム', url: '/' },
    { name: 'ブログ', url: '/posts' },
    { name: post.title, url: `/posts/${slug}` },
  ]}
/>

<ArticleJsonLd
  headline={post.title}
  description={post.metaDescription ?? post.excerpt}
  image={post.thumbnailUrl}
  url={`${baseUrl}/posts/${slug}`}
  datePublished={datePublished}
  author={post.author ? { name: post.author.name } : undefined}
/>

// /news/[slug]/page.tsx — ニュース（実際の実装）
<BreadcrumbJsonLd
  items={[
    { name: 'ホーム', url: '/' },
    { name: 'お知らせ', url: '/news' },
    { name: newsItem.title, url: `/news/${slug}` },
  ]}
/>

<NewsArticleJsonLd
  headline={newsItem.title}
  description={newsItem.metaDescription ?? newsItem.title}
  image={newsItem.ogpImageUrl ?? undefined}
  url={`${baseUrl}/news/${slug}`}
  datePublished={datePublished}
/>
```

### メタデータ生成パターン

#### 一覧・固定ページ: `generatePageMetadata(slug)`

DB Page テーブルの SEO 設定を参照。優先順位: DB PageSEO > Settings フォールバック > システムデフォルト:

```typescript
// page.tsx（一覧・固定ページ）
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return generatePageMetadata(slug); // 引数は slug のみ
}
```

**注意**: `generatePageMetadata` の第2引数（fallback）は存在しない。

#### 詳細ページ: `generateArticleMetadata(article, options)`

記事データから直接生成する純粋関数:

```typescript
// posts/[slug]/page.tsx および news/[slug]/page.tsx（実際の実装）
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const [post, settings] = await Promise.all([
    getPublishedPost(slug),
    getSeoSettings(),
  ]);

  if (!post) {
    return { title: "記事が見つかりません" };
  }

  return generateArticleMetadata(
    {
      title: post.title,
      description: post.metaDescription ?? post.excerpt,
      image: post.ogpImageUrl ?? post.thumbnailUrl,
      ogpTitle: post.ogpTitle,
      ogpDescription: post.ogpDescription,
      metaKeywords: post.metaKeywords,
    },
    {
      canonicalUrl: `${getBaseUrl()}/posts/${slug}`,
      siteName: settings?.siteName ?? undefined,
    },
  );
}
```

**使い分け**:

| 関数                                         | 用途             | 引数                       |
| -------------------------------------------- | ---------------- | -------------------------- |
| `generatePageMetadata(slug)`                 | 一覧・固定ページ | slug のみ                  |
| `generateArticleMetadata(article, options?)` | 記事詳細ページ   | ArticleMetadata + optional |

### ArticleMetadata 型

```typescript
interface ArticleMetadata {
  title: string;
  description?: string | null;
  image?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  metaKeywords?: string | null;
}
```

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

1. **NAP情報のハードコード禁止**
   - Footer・JSON-LD・Contact すべて DB から取得

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

```tsx
// NG: layout.tsx で LocalBusiness を出力（per-location に移行済み）
// app/(public)/layout.tsx
async function StructuredDataContent() {
  const graphData = await getGraphJsonLdData(); // 旧実装: LocalBusiness を含む
  return <GraphJsonLd {...graphData} />;
}

// OK: layout.tsx は Organization + WebSite のみ（LocalBusiness を含まない）
// /access/page.tsx で per-location LocalBusiness を出力
const locationsJsonLd = await getAllPublishedLocationsJsonLdData();
<LocalBusinessJsonLd items={locationsJsonLd} />;

// OK: /access/[locationSlug]/page.tsx で単一拠点の LocalBusiness を出力
const locationJsonLd = await getLocationJsonLdDataBySlug(slug);
<LocalBusinessJsonLd items={locationJsonLd ? [locationJsonLd] : []} />;
```

3. **JSON-LD内のエスケープ漏れ禁止**
   - `JsonLd.tsx` の内部 `JsonLd` コンポーネントを使用（Unicodeエスケープ実装済み）

```typescript
// NG: ユーザー入力を直接 JSON-LD に埋め込む（XSS リスク）
const jsonLd = `{"name": "${businessName}"}` // businessName に <script> が含まれると危険

// OK: GraphJsonLd コンポーネント経由（内部で自動エスケープ済み）
<GraphJsonLd {...graphData} />
```

4. **@graph 外での WebSite/LocalBusiness 個別出力禁止**
   - `GraphJsonLd` を使用し、`@graph` 配列で統合出力

5. **LocalBusiness への AggregateRating 禁止**
   - Googleポリシー（2019年9月〜）により自社レビューの LocalBusiness 星評価はリッチリザルト非対象
   - **Product 型への AggregateRating は許可**（スペース詳細ページで使用。レビュー1件以上で出力）

6. **`generatePageMetadata(slug, fallback)` 形式の呼び出し禁止**
   - 第2引数は存在しない。`generatePageMetadata(slug)` のみ

```typescript
// NG: 記事詳細ページで generatePageMetadata を使用（DB の Page テーブルに記事はない）
export async function generateMetadata({ params }: Props) {
  return generatePageMetadata(params.slug); // NG: 記事詳細ページには不適切
}

// OK: 記事詳細ページは generateArticleMetadata を使用
export async function generateMetadata({ params }: Props) {
  const post = await getPublishedPost(params.slug);
  return generateArticleMetadata(
    { title: post.title, description: post.metaDescription },
    { canonicalUrl: `${getBaseUrl()}/posts/${params.slug}` },
  );
}

// OK: カスタムページ（DB Page テーブル）は generatePageMetadata を使用
export async function generateMetadata({ params }: Props) {
  return generatePageMetadata(params.slug);
}
```

7. **`hasMap` と `googleMapsUrl` の混同禁止**
   - `hasMap`（JSON-LD内）: 緯度経度 URL (`maps?q=lat,lng`)
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
| `@/public/lib/seo/index.ts`            | SEOライブラリ barrel export                                                                                                                                                    |
| `@/public/lib/page-metadata.ts`        | `generatePageMetadata(slug)`, `getPageSeo(slug)`, `getDefaultPageSeo(slug)`                                                                                                    |
| `@/public/data/business.ts`            | `getBusinessInfo()` — コンポーネント向けビジネス情報                                                                                                                           |
| `@/shared/lib/settings/public.ts`      | `getPublicBusinessSettings()` — 公開設定取得（NAP含む）                                                                                                                        |
