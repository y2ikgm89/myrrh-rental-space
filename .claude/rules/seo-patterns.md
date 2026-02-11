# SEO / 構造化データパターンルール

> JSON-LD @graph / microdata / NAP一貫性 / MEO対応

## 構造化データ配置

### JSON-LD（`application/ld+json`）

**@graph パターン**（現在の実装）: `LocalBusiness` + `WebSite` を1つの `<script>` タグにまとめ、`@id` で相互参照:

| 型 | @id | 配置場所 | 備考 |
|-----|-----|---------|------|
| `LocalBusiness` | `{BASE_URL}/#organization` | `(public)/layout.tsx` | 全公開ページ共通 |
| `WebSite` | `{BASE_URL}/#website` | `(public)/layout.tsx` | `publisher` で `/#organization` 参照 |
| `BreadcrumbList` | — | 各ページの `page.tsx` | ページ固有 |

```typescript
// layout.tsx — @graph パターン
async function StructuredDataContent(): Promise<ReactElement> {
  const graphData = await getGraphJsonLdData()
  return <GraphJsonLd {...graphData} />
}

<Suspense fallback={null}>
  <StructuredDataContent />
</Suspense>
```

### 原則

- **@graph で LocalBusiness + WebSite を layout.tsx に1つだけ配置**。個別ページに重複しない
- JSON-LDコンポーネントは `@/public/components/seo/JsonLd.tsx` に集約（`GraphJsonLd`）
- XSS対策: JSON文字列はUnicodeエスケープ（`<`, `>`, `&`）
- `@id` 相互参照でGoogleのナレッジグラフ理解を向上

### microdata（HTML属性）

Footer・BusinessInfo の NAP 情報に schema.org microdata を付与:

```tsx
<address itemScope itemType="https://schema.org/LocalBusiness" className="not-italic">
  <meta itemProp="name" content={info.name} />
  <div itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
    <meta itemProp="postalCode" content={postalCode} />
    <meta itemProp="addressRegion" content={prefecture} />
    <meta itemProp="addressLocality" content={city} />
    <meta itemProp="streetAddress" content={streetAddress} />
  </div>
  <a itemProp="telephone" href={`tel:${phone}`}>{phone}</a>
  <a itemProp="email" href={`mailto:${email}`}>{email}</a>
  {/* 営業時間 microdata */}
  <time itemProp="openingHours" content="Mo-Fr 09:00-21:00">09:00 - 21:00</time>
</address>
```

## NAP一貫性（Name・Address・Phone）

- **ビジネス名・住所・電話番号は DB（Settings テーブル）から一元取得**
- Footer、JSON-LD、Contact ページすべて同一データソース
- ハードコード禁止

## データソース

| データ | 取得関数 | キャッシュタグ |
|--------|---------|--------------|
| ビジネス情報（公開表示用） | `getBusinessInfo()` | `CACHE_TAGS.BUSINESS_SETTINGS` |
| ビジネス設定（生データ） | `getPublicBusinessSettings()` | `CACHE_TAGS.BUSINESS_SETTINGS` |
| 組織設定（JSON-LD用） | `getOrganizationSettings()` | `CACHE_TAGS.ORGANIZATION_SETTINGS` |
| @graph 統合データ | `getGraphJsonLdData()` | 上記を並列取得 |
| ソーシャルリンク | `getSocialLinkUrls()` | `CACHE_TAGS.SOCIAL_LINKS` |
| SEO設定 | `getSeoSettings()` | `CACHE_TAGS.SEO_SETTINGS` |
| ページSEO | `getPageSeo(slug)` | `CACHE_TAGS.PAGE_SEO` |

### BusinessInfo データレイヤー

`getBusinessInfo()` は `getPublicBusinessSettings()` をラップし、コンポーネント向けの形状にマッピング:

- `address`: 結合済み住所文字列
- `googleMapsUrl`: Place IDから自動生成（`https://www.google.com/maps/search/?api=1&query=Google&query_place_id={placeId}`）
- `businessAttributes`: 型安全パース済み `Record<string, boolean>`
- `businessHours`: 生JSON（コンポーネント側でパース）

## MEO（ローカル検索最適化）

### LocalBusiness プロパティ一覧

| プロパティ | ソース | 備考 |
|-----------|--------|------|
| `name` | `businessName` / `siteName` | |
| `description` | `businessDescription` / `siteDescription` | |
| `url` | `BASE_URL` | |
| `logo` / `image` | `headerLogoUrl` | 配列形式 |
| `telephone` | `phoneNumber` | |
| `email` | `email` | |
| `address` | postal/prefecture/city/street/building | PostalAddress 型 |
| `openingHoursSpecification` | `businessHours` JSON | 曜日グループ化 |
| `specialOpeningHoursSpecification` | `specialHolidays` JSON | 休業日 `opens/closes: "00:00"` |
| `priceRange` | `priceRange` | |
| `geo` | `latitude` + `longitude` | 両方設定時のみ |
| `hasMap` | lat/lng から生成 | Google Maps URL |
| `currenciesAccepted` | 固定 `"JPY"` | |
| `paymentAccepted` | `paymentAccepted` | |
| `foundingDate` | `establishedDate` | ISO 8601 |
| `additionalType` | 固定 Wikipedia URL | |
| `sameAs` | `SocialLink` テーブル | アクティブなもののみ |
| `amenityFeature` | `businessAttributes` JSON | `true` の項目のみ |

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

| 定数 | 用途 |
|------|------|
| `DAY_MAP` | 曜日キー → 英語名（JSON-LD用） |
| `DAY_LABELS` | 曜日キー → 日本語ラベル（表示用） |
| `ATTR_LABELS` | 施設属性キー → 日本語ラベル（表示用） |

### Google Maps URL 自動生成

Place ID が設定されていれば URL を自動生成（管理画面での手入力不要）:

```typescript
googleMapsUrl: placeId
  ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeId}`
  : null
```

### 営業時間フロントエンド表示パターン

Footer・BusinessInfo で共通のパースロジック:

1. `businessHours` JSON を曜日順にイテレート
2. 同じ時間帯の曜日をグループ化（「月〜金」形式）
3. microdata 用の content 属性を生成（`Mo-Fr 09:00-21:00`）
4. `<time itemProp="openingHours" content="...">` で出力

## 禁止事項

1. **NAP情報のハードコード禁止**
   - Footer・JSON-LD・Contact すべて DB から取得

2. **LocalBusiness JSON-LD の重複配置禁止**
   - layout.tsx の `@graph` のみ。個別ページに追加しない

3. **JSON-LD内のユーザー入力エスケープ漏れ禁止**
   - `JsonLd.tsx` のサニタイズ関数を使用

4. **@graph 外での WebSite/LocalBusiness 個別出力禁止**
   - `GraphJsonLd` を使用し、`@graph` 配列で統合出力

5. **AggregateRating の使用禁止**
   - Googleポリシー（2019年9月〜）により自社レビューの LocalBusiness 星評価はリッチリザルト非対象

## ファイル配置

| パス | 内容 |
|------|------|
| `@/public/components/seo/JsonLd.tsx` | `GraphJsonLd` コンポーネント（@graph パターン） |
| `@/public/lib/seo/json-ld-config.ts` | JSON-LDデータ生成、共有定数（DAY_MAP, ATTR_LABELS等） |
| `@/public/lib/seo/metadata-factory.ts` | Next.js Metadata生成 |
| `@/public/lib/seo/index.ts` | SEOユーティリティ barrel |
| `@/public/lib/page-metadata.ts` | ページSEO取得 |
| `@/public/data/business.ts` | ビジネス情報データレイヤー（`getBusinessInfo()`） |
| `@/shared/lib/settings/public.ts` | 公開設定取得（NAP含む） |
