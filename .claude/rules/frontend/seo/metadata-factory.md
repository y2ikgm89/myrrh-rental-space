---
description: メタデータ生成パターン（generatePageMetadata / generateArticleMetadata + ArticleMetadata 型）
paths:
  - src/app/(public*)/**/page.tsx
  - src/app/(public*)/**/layout.tsx
  - src/app/(public*)/_shared/lib/seo/metadata-factory.ts
  - src/app/(public*)/_shared/lib/page-metadata.ts
---

# メタデータ生成パターン

> 一覧・固定ページは `generatePageMetadata(slug)`、詳細ページは `generateArticleMetadata(article, options)` の使い分け。

## 一覧・固定ページ: `generatePageMetadata(slug)`

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

**注意**: `generatePageMetadata` の第 2 引数（fallback）は存在しない。

## 詳細ページ: `generateArticleMetadata(article, options)`

記事データから直接生成する純粋関数:

```typescript
// posts/[slug]/page.tsx および news/[slug]/page.tsx
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

## 使い分け

| 関数                                         | 用途             | 引数                       |
| -------------------------------------------- | ---------------- | -------------------------- |
| `generatePageMetadata(slug)`                 | 一覧・固定ページ | slug のみ                  |
| `generateArticleMetadata(article, options?)` | 記事詳細ページ   | ArticleMetadata + optional |

## ArticleMetadata 型

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

## 禁止: `generatePageMetadata(slug, fallback)` 形式

第 2 引数は存在しない。記事詳細ページは `generateArticleMetadata` を使用する:

```typescript
// NG: 記事詳細ページで generatePageMetadata を使用（DB の Page テーブルに記事はない）
export async function generateMetadata({ params }: Props) {
  return generatePageMetadata(params.slug); // NG: 記事詳細ページには不適切
}

// OK: 記事詳細ページは generateArticleMetadata
export async function generateMetadata({ params }: Props) {
  const post = await getPublishedPost(params.slug);
  return generateArticleMetadata(
    { title: post.title, description: post.metaDescription },
    { canonicalUrl: `${getBaseUrl()}/posts/${params.slug}` },
  );
}

// OK: カスタムページ（DB Page テーブル）は generatePageMetadata
export async function generateMetadata({ params }: Props) {
  return generatePageMetadata(params.slug);
}
```
