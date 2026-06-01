---
description: スペース詳細（Product + AggregateRating）+ 記事詳細（Article / NewsArticle）+ Breadcrumb JSON-LD パターン
paths:
  - src/app/(public)/spaces/[slug]/page.tsx
  - src/app/(public)/posts/[slug]/page.tsx
  - src/app/(public)/news/[slug]/page.tsx
  - src/app/(public*)/_shared/components/seo/json-ld.tsx
---

# スペース・記事詳細ページの構造化データ

> Product + AggregateRating（スペース詳細）+ Article / NewsArticle（記事・ニュース詳細）+ BreadcrumbList。

## Product + AggregateRating JSON-LD（スペース詳細）

スペース詳細ページでは `ProductJsonLd` + `BreadcrumbJsonLd` を使用。レビューが 1 件以上ある場合のみ `aggregateRating` を出力:

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
- `aggregateRating` はレビュー 0 件時に出力すると Google Search Console でエラー
- `bestRating` / `worstRating` は省略時デフォルト 5/1（コンポーネント内部で設定）

## Article / NewsArticle JSON-LD（記事詳細）

ブログ記事・ニュース詳細ページでは `ArticleJsonLd` / `NewsArticleJsonLd` + `BreadcrumbJsonLd` を使用:

```tsx
// /posts/[slug]/page.tsx — ブログ記事
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

// /news/[slug]/page.tsx — ニュース
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
