---
description: SEO 構造化データ配置（JSON-LD @graph + microdata + 原則）
paths:
  - src/app/(public*)/_shared/components/seo/**
  - src/app/(public*)/_shared/lib/seo/**
  - src/app/(public*)/layout.tsx
  - src/app/(public*)/_components/BusinessInfo*.tsx
  - src/app/(public*)/_components/Footer*.tsx
---

# 構造化データ配置（JSON-LD @graph + microdata）

> Organization + WebSite を layout.tsx で 1 つの @graph に統合、LocalBusiness は per-location ページに委譲。

## JSON-LD（`application/ld+json`）

**@graph パターン**（現在の実装）: `Organization + WebSite` を 1 つの `<script>` タグにまとめ、`@id` で相互参照。`LocalBusiness` は per-location ページに委譲する:

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

## 原則

- **@graph で Organization + WebSite を layout.tsx に 1 つだけ配置**。`LocalBusiness` は layout.tsx に含めない
- **LocalBusiness は per-location 出力**。`/access` および `/access/[locationSlug]` ページで拠点ごとに出力する
- JSON-LD コンポーネントは `@/public/components/seo/JsonLd.tsx` に集約
- XSS 対策: JSON 文字列は Unicode エスケープ（`<`, `>`, `&`, U+2028, U+2029）
- `@id` 相互参照で Google のナレッジグラフ理解を向上

## microdata（HTML属性）

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
