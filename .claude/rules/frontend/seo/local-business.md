---
description: NAP 一貫性 + データソース + MEO（per-location LocalBusiness）+ OpeningHoursSpecification + amenityFeature + 営業時間表示パターン
paths:
  - src/app/(public*)/_shared/lib/seo/json-ld-config.ts
  - src/app/(public*)/_shared/lib/seo/location-json-ld.ts
  - src/app/(public*)/access/**
  - src/app/(public*)/_components/BusinessInfo*.tsx
  - src/app/(public*)/_components/Footer*.tsx
  - src/shared/lib/settings/public.ts
  - src/shared/domain/settings/**
---

# NAP一貫性 + MEO（ローカル検索最適化）

> NAP（Name・Address・Phone）の SSoT 化 + per-location LocalBusiness + OpeningHoursSpecification + amenityFeature + 営業時間表示パターン。

## NAP一貫性

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
| SEO 設定                                    | `getSeoSettings()`                     | `CACHE_TAGS.SEO_SETTINGS`                               | 公開      |
| ページ SEO                                  | `getPageSeo(slug)`                     | `CACHE_TAGS.PAGE_SEO`                                   | 公開      |

**注意**: `getOrganizationSettings()` と `getSocialLinkUrls()` は `json-ld-config.ts` 内部のプライベート関数。直接インポート不可。

`getOrganizationJsonLdData()` は `getGraphJsonLdData()` の内部から呼ばれる。サイト名・URL・ロゴのみを含む `Organization` データを返す。LocalBusiness 型は含まない（multi-location 対応で per-location 化）。

`getLocalBusinessJsonLdData()` は廃止。`getAllPublishedLocationsJsonLdData()` / `getLocationJsonLdDataBySlug()` を使用する。

## BusinessInfo データレイヤー

`getBusinessInfo()` は `getPublicBusinessSettings()` をラップし、コンポーネント向けの形状にマッピング:

- `name`: ビジネス名（`businessName`）
- `address`: 結合済み住所文字列（`〒postalCode + prefecture + city + streetAddress + buildingName`）
- `postalCode`, `prefecture`, `city`, `streetAddress`, `buildingName`: microdata 用の個別フィールド
- `phone`: 電話番号
- `email`: メールアドレス
- `businessHours`: 生 JSON（コンポーネント側でパース）
- `holidayNotice`: 休業日テキスト
- `googleMapsUrl`: Place ID から自動生成（`https://www.google.com/maps/search/?api=1&query=Google&query_place_id={placeId}`）
- `googleReviewUrl`: Google クチコミ URL
- `businessAttributes`: 型安全パース済み `Record<string, boolean>`

## LocalBusiness プロパティ一覧（per-location）

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

## OpeningHoursSpecification

`businessHours` JSON → schema.org `OpeningHoursSpecification` 変換。同じ時間帯の曜日をグループ化して出力:

```json
{
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["Monday", "Tuesday", "Wednesday"],
  "opens": "09:00",
  "closes": "21:00"
}
```

## specialOpeningHoursSpecification

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

## amenityFeature

`businessAttributes` JSON → `LocationFeatureSpecification` 変換:

```json
{
  "@type": "LocationFeatureSpecification",
  "name": "Wi-Fi",
  "value": true
}
```

## 共有定数（json-ld-config.ts）

フロントエンド表示でも再利用:

| 定数                                 | 用途                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `DAY_MAP`                            | 曜日キー → 英語名（JSON-LD 用）例: `monday → 'Monday'`    |
| `DAY_LABELS`                         | 曜日キー → 日本語ラベル（表示用）例: `monday → '月'`      |
| `ATTR_LABELS`                        | 施設属性キー → 日本語ラベル（表示用）例: `wifi → 'Wi-Fi'` |
| `convertToOpeningHoursSpecification` | businessHours JSON → OpeningHoursSpec[] 変換              |

```typescript
// Footer / BusinessInfo での import
import { DAY_LABELS, ATTR_LABELS } from "@/public/lib/seo/json-ld-config";
```

## 営業時間フロントエンド表示パターン

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
