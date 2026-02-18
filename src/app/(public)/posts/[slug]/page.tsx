/**
 * /posts/[slug] — ブログ記事詳細ページ
 *
 * SEO: generateArticleMetadata + ArticleJsonLd + BreadcrumbList JSON-LD
 * コンテンツ幅: DB設定に従う（getPostLayoutSettings → resolveWidthStyles）
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
} from '@/public/components/seo/JsonLd'
import {
  generateArticleMetadata,
  getSeoSettings,
} from '@/public/lib/seo/metadata-factory'
import { getPostLayoutSettings } from '@/public/lib/layout-settings'
import { resolveWidthStyles } from '@/shared/lib/styles/layout-mapper'
import { getBaseUrl } from '@/shared/lib/constants'
import { toISOString } from '@/shared/lib/serialize'
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'
import {
  getPublishedPost,
} from '@/public/actions/post'
import { ArticleDetailHero } from '@/public/components/ArticleDetailHero'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection()

  const { slug } = await params
  const [post, settings] = await Promise.all([
    getPublishedPost(slug),
    getSeoSettings(),
  ])

  if (!post) {
    return { title: '記事が見つかりません' }
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
    }
  )
}

export default async function PostDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection()

  const { slug } = await params
  const post = await getPublishedPost(slug)

  if (!post) {
    notFound()
  }

  const layoutConfig = await getPostLayoutSettings(post.id)
  const { className: contentClassName, style: contentStyle } =
    resolveWidthStyles({
      width: layoutConfig.contentWidth,
      customPx: layoutConfig.contentWidthCustom,
    })

  const baseUrl = getBaseUrl()
  const datePublished = toISOString(post.publishedAt) ?? ''

  return (
    <>
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
        author={
          post.author ? { name: post.author.name } : undefined
        }
      />

      <ArticleDetailHero
        title={post.title}
        categoryName={post.category.name}
        publishedAt={post.publishedAt}
        authorName={post.author?.name ?? null}
      />

      <article className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className={contentClassName} style={contentStyle}>
          <SanitizedHtml
            html={post.contentHtml}
            className="prose prose-lg max-w-none"
          />
        </div>

        {post.postTags.length > 0 && (
          <div className="mt-12 border-t border-border pt-6">
            <div className="flex flex-wrap gap-2">
              {post.postTags.map((pt) => (
                <span
                  key={pt.tag.slug}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {pt.tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  )
}
