/**
 * ブログ記事詳細ページ
 *
 * ContentRendererコンポーネントでリッチテキストを安全に表示
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでデータ取得をキャッシュ
 * - generateStaticParams でビルド時に事前生成
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { tv } from 'tailwind-variants'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { ArticleJsonLd } from '@/public/components/seo/JsonLd'
import { BlogSidebar } from '@/public/components/sidebar'
import { getSidebarSettings, getSidebarData } from '@/public/actions/sidebar'
import { prisma } from '@/shared/lib/prisma'
import { parseStringArray } from '@/shared/lib/json-validators'
import { getBlogLayoutSettings } from '@/public/lib/layout-settings'
import { getContainerStyles, getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { BlogPostStatus } from '@/shared/generated/prisma/enums'
import { CommentSection } from './_components'
import type { ReactElement } from 'react'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    container: 'mx-auto w-full px-4 sm:px-6 lg:px-8',
    layout: 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-8',
    mainContent: '',
    sidebar: 'mt-8 lg:mt-0',
    article: '', // 幅はgetContentStylesで動的に設定
    breadcrumb: 'mb-8 flex items-center gap-2 text-sm text-muted-foreground',
    breadcrumbLink: 'hover:text-foreground transition-colors',
    header: 'mb-8',
    meta: 'flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4',
    category: 'rounded-full bg-primary/10 px-3 py-1 text-primary text-xs font-medium',
    title: 'text-3xl sm:text-4xl font-bold tracking-tight text-foreground',
    excerpt: 'mt-4 text-lg text-muted-foreground',
    imageWrapper: 'relative aspect-video overflow-hidden rounded-xl mb-8',
    image: 'object-cover',
    content: 'mb-12',
    tagsWrapper: 'border-t pt-6 mt-12',
    tagsTitle: 'text-sm font-medium text-muted-foreground mb-3',
    tagsList: 'flex flex-wrap gap-2',
    tag: 'rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground hover:bg-muted/80 transition-colors',
    navigation: 'border-t pt-8 mt-8',
    navLinks: 'flex justify-between gap-4',
    navLink: 'flex-1 p-4 border rounded-lg hover:bg-muted/50 transition-colors',
    navLabel: 'text-xs text-muted-foreground mb-1',
    navTitle: 'font-medium line-clamp-1',
  },
})()

// =============================================================================
// Helpers
// =============================================================================

function formatDate(value: Date | null): string {
  if (!value) return '公開準備中'
  return value.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// =============================================================================
// Data Fetching with Cache
// =============================================================================

interface PageProps {
  params: Promise<{ slug: string }>
}

/**
 * ブログ記事詳細を取得（キャッシュ付き）
 */
async function getBlogPostBySlug(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('blog', `blog-${slug}`)

  return await prisma.blogPost.findUnique({
    where: {
      slug,
      status: BlogPostStatus.PUBLISHED,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      thumbnailUrl: true,
      ogpImageUrl: true,
      publishedAt: true,
      updatedAt: true,
      tags: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      categoryId: true,
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  })
}

/**
 * メタデータ用ブログ記事情報を取得（キャッシュ付き）
 */
async function getBlogPostForMetadata(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('blog', `blog-${slug}`)

  return await prisma.blogPost.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      thumbnailUrl: true,
      ogpImageUrl: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
    },
  })
}

/**
 * 前後の記事を取得（キャッシュ付き）
 */
async function getAdjacentPosts(postId: string, publishedAt: Date | null) {
  'use cache'
  cacheLife('hours')
  cacheTag('blog')

  const [prevPost, nextPost] = await Promise.all([
    prisma.blogPost.findFirst({
      where: {
        status: BlogPostStatus.PUBLISHED,
        AND: [
          { publishedAt: { not: null } },
          publishedAt
            ? { publishedAt: { lt: publishedAt } }
            : { id: { lt: postId } },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { slug: true, title: true },
    }),
    prisma.blogPost.findFirst({
      where: {
        status: BlogPostStatus.PUBLISHED,
        AND: [
          { publishedAt: { not: null } },
          publishedAt
            ? { publishedAt: { gt: publishedAt } }
            : { id: { gt: postId } },
        ],
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      select: { slug: true, title: true },
    }),
  ])

  return { prevPost, nextPost }
}

// =============================================================================
// Metadata
// =============================================================================

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params

  const post = await getBlogPostForMetadata(slug)

  if (!post) {
    return {
      title: '記事が見つかりません',
    }
  }

  const title = post.ogpTitle || post.title
  const description = post.ogpDescription || post.metaDescription || post.excerpt
  const image = post.ogpImageUrl || post.thumbnailUrl

  return {
    title: post.title,
    description,
    keywords: post.metaKeywords || undefined,
    openGraph: {
      title,
      description,
      images: [image],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

/**
 * 静的パラメータ生成
 * 公開中のブログ記事をビルド時に事前生成
 */
export async function generateStaticParams() {
  'use cache'
  cacheLife('hours')
  cacheTag('blog')

  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: BlogPostStatus.PUBLISHED },
      select: { slug: true },
      take: 100,
    })

    if (posts.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return posts.map((post) => ({
      slug: post.slug,
    }))
  } catch {
    return [{ slug: '__placeholder__' }]
  }
}

// =============================================================================
// Page Component
// =============================================================================

export default async function BlogDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const post = await getBlogPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const tags = parseStringArray(post.tags)

  // サイドバーデータと前後記事を並列取得
  const [{ prevPost, nextPost }, sidebarSettings, sidebarData] = await Promise.all([
    getAdjacentPosts(post.id, post.publishedAt),
    getSidebarSettings(),
    getSidebarData(),
  ])

  // レイアウト設定を取得
  const layoutConfig = await getBlogLayoutSettings(post.id)
  const containerStyles = getContainerStyles(layoutConfig)
  const contentStyles = getContentStyles(layoutConfig)

  return (
    <section className={styles.section()}>
      {/* 構造化データ: Article */}
      <ArticleJsonLd
        headline={post.title}
        description={post.excerpt || post.metaDescription || ''}
        image={post.thumbnailUrl}
        url={`${BASE_URL}/blog/${post.slug}`}
        datePublished={post.publishedAt?.toISOString() || post.updatedAt.toISOString()}
        dateModified={post.updatedAt.toISOString()}
        author={{ name: 'Myrrh Rental Space' }}
      />

      <div className={`${styles.container()} ${containerStyles.className}`} style={containerStyles.style}>
        <div className={sidebarSettings.enabled ? styles.layout() : ''}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            <article className={`${styles.article()} ${contentStyles.className}`} style={contentStyles.style}>
              {/* パンくずリスト */}
              <nav className={styles.breadcrumb()} aria-label="パンくずリスト">
                <Link href="/" className={styles.breadcrumbLink()}>
                  ホーム
                </Link>
                <span aria-hidden="true">/</span>
                <Link href="/blog" className={styles.breadcrumbLink()}>
                  ブログ
                </Link>
                <span aria-hidden="true">/</span>
                <span className="truncate max-w-[200px]">{post.title}</span>
              </nav>

              {/* ヘッダー */}
              <header className={styles.header()}>
                <div className={styles.meta()}>
                  <Link
                    href={`/blog?category=${post.category.slug}`}
                    className={styles.category()}
                  >
                    {post.category.name}
                  </Link>
                  <span aria-hidden="true">•</span>
                  <time dateTime={post.publishedAt?.toISOString()}>
                    {formatDate(post.publishedAt)}
                  </time>
                </div>
                <h1 className={styles.title()}>{post.title}</h1>
                {post.excerpt && (
                  <p className={styles.excerpt()}>{post.excerpt}</p>
                )}
              </header>

              {/* サムネイル */}
              <div className={styles.imageWrapper()}>
                <Image
                  src={post.thumbnailUrl}
                  alt={post.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className={styles.image()}
                  priority
                />
              </div>

              {/* 本文（HTMLコンテンツ + PostListWidget） */}
              <ContentRenderer
                html={post.content}
                className={styles.content()}
                widgetContext={{
                  categoryId: post.categoryId,
                  excludePostId: post.id,
                }}
              />

              {/* タグ */}
              {tags.length > 0 && (
                <div className={styles.tagsWrapper()}>
                  <h2 className={styles.tagsTitle()}>タグ</h2>
                  <ul className={styles.tagsList()}>
                    {tags.map((tag) => (
                      <li key={tag}>
                        <Link
                          href={`/blog?tags=${encodeURIComponent(tag)}`}
                          className={styles.tag()}
                        >
                          #{tag}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 前後の記事ナビゲーション */}
              {(prevPost || nextPost) && (
                <nav className={styles.navigation()} aria-label="記事ナビゲーション">
                  <div className={styles.navLinks()}>
                    {prevPost ? (
                      <Link href={`/blog/${prevPost.slug}`} className={styles.navLink()}>
                        <div className={styles.navLabel()}>← 前の記事</div>
                        <div className={styles.navTitle()}>{prevPost.title}</div>
                      </Link>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {nextPost ? (
                      <Link
                        href={`/blog/${nextPost.slug}`}
                        className={`${styles.navLink()} text-right`}
                      >
                        <div className={styles.navLabel()}>次の記事 →</div>
                        <div className={styles.navTitle()}>{nextPost.title}</div>
                      </Link>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>
                </nav>
              )}

              {/* コメントセクション */}
              <Suspense
                fallback={
                  <div className="mt-12 border-t pt-8">
                    <div className="animate-pulse space-y-4">
                      <div className="h-8 bg-muted rounded w-32" />
                      <div className="h-32 bg-muted rounded" />
                    </div>
                  </div>
                }
              >
                <CommentSection postId={post.id} postSlug={post.slug} />
              </Suspense>
            </article>
          </main>

          {/* サイドバー */}
          {sidebarSettings.enabled && (
            <aside className={styles.sidebar()}>
              <BlogSidebar settings={sidebarSettings.widgets} data={sidebarData} />
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}
