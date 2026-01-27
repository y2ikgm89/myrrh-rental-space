/**
 * 投稿詳細ページ
 *
 * 投稿記事の詳細を表示するServer Component。
 * ContentRendererコンポーネントでリッチテキストを安全に表示します。
 *
 * ## 機能
 * - 投稿記事の詳細表示
 * - サイドバー（設定による表示切替）
 * - 前後の記事ナビゲーション
 * - コメントセクション
 * - 構造化データ（Article JSON-LD）の出力
 *
 * ## Next.js 16 PPR対応
 * - `use cache` ディレクティブでデータ取得をキャッシュ
 * - `generateStaticParams` でビルド時に事前生成
 *
 * @module posts/[slug]/page
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
import { getSidebarFullData } from '@/public/actions/sidebar'
import { prisma } from '@/shared/lib/prisma'
import { criticalFetch, ErrorCategory } from '@/shared/lib/errors'
import { toPlainObject, toISOString, formatSerializedDate } from '@/shared/lib/serialize'
import { parseStringArray } from '@/shared/lib/json-validators'
import { getPostLayoutSettings } from '@/public/lib/layout-settings'
import { getContainerStyles, getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { CommentSection, PostPreviewWrapper } from './_components'
import { getBaseUrl, SITE_DEFAULTS, CACHE_LIFE, CACHE_TAGS } from '@/shared/lib/constants'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import { generatePostUrl, generatePostListUrl } from '@/shared/lib/url'
import type { ReactElement } from 'react'

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl()

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
// Types
// =============================================================================

/** ページコンポーネントのProps */
interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * 日付を表示用にフォーマット
 *
 * @param value - 日付値（Date | string | null）
 * @returns フォーマット済み日付文字列、値がない場合は「公開準備中」
 */
function formatDate(value: Date | string | null): string {
  if (!value) return '公開準備中'
  return formatSerializedDate(value)
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * 投稿詳細を取得（キャッシュ付き）
 *
 * 公開中の投稿を取得し、シリアライズして返します。
 *
 * @param slug - 記事のスラッグ
 * @returns 投稿、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getPostBySlug(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS, `${CACHE_TAGS.POSTS}-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.post.findUnique({
        where: {
          slug,
          status: PostStatus.PUBLISHED,
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
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getPostBySlug',
    context: { slug },
  })

  return toPlainObject(result)
}

/**
 * メタデータ用投稿情報を取得（キャッシュ付き）
 *
 * generateMetadata で使用する最小限の情報のみ取得します。
 *
 * @param slug - 記事のスラッグ
 * @returns メタデータ用情報、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getPostForMetadata(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.METADATA)
  cacheTag(CACHE_TAGS.POSTS, `${CACHE_TAGS.POSTS}-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.post.findUnique({
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
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getPostForMetadata',
    context: { slug },
  })

  return toPlainObject(result)
}

/**
 * 前後の記事を取得（キャッシュ付き）
 *
 * 現在の記事の前後にある公開記事を取得します。
 * 公開日時でソートし、前後の記事を特定します。
 *
 * @param postId - 現在の記事ID
 * @param publishedAt - 現在の記事の公開日時（Date | string | null）
 * @returns 前後の記事情報
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getAdjacentPosts(
  postId: string,
  publishedAt: Date | string | null
) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  // シリアライズ後の日付（string）を Date に変換
  const pubDate = publishedAt ? new Date(publishedAt) : null

  const [prevPost, nextPost] = await criticalFetch({
    fetch: () =>
      Promise.all([
        prisma.post.findFirst({
          where: {
            status: PostStatus.PUBLISHED,
            AND: [
              { publishedAt: { not: null } },
              pubDate
                ? { publishedAt: { lt: pubDate } }
                : { id: { lt: postId } },
            ],
          },
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          select: { slug: true, title: true },
        }),
        prisma.post.findFirst({
          where: {
            status: PostStatus.PUBLISHED,
            AND: [
              { publishedAt: { not: null } },
              pubDate
                ? { publishedAt: { gt: pubDate } }
                : { id: { gt: postId } },
            ],
          },
          orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
          select: { slug: true, title: true },
        }),
      ]),
    category: ErrorCategory.DATABASE,
    operationName: 'getAdjacentPosts',
    context: { postId },
  })

  return {
    prevPost: toPlainObject(prevPost),
    nextPost: toPlainObject(nextPost),
  }
}

// =============================================================================
// Metadata
// =============================================================================

/**
 * 動的メタデータ生成
 *
 * 投稿のタイトル、概要、OGP情報からメタデータを生成します。
 *
 * @param props - ページProps（params含む）
 * @returns Next.js Metadata オブジェクト
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params

  const post = await getPostForMetadata(slug)

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

// =============================================================================
// Static Generation
// =============================================================================

/**
 * 静的パラメータ生成
 *
 * ビルド時に公開中の投稿ページを事前生成します。
 * 最大100件まで事前生成し、それ以降はオンデマンドで生成されます。
 *
 * @returns 記事スラッグの配列
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  try {
    const posts = await prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
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

/**
 * 投稿詳細ページコンポーネント
 *
 * 投稿記事の詳細を表示するServer Component。
 * サイドバー、前後の記事ナビゲーション、コメントセクションも含みます。
 *
 * @param props - ページProps（params, searchParams含む）
 * @returns ページのReact要素
 */
export default async function PostDetailPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params
  const { preview } = await searchParams

  // プレビューモードの場合はクライアントコンポーネントを表示
  if (preview === 'true') {
    const postPrefix = await getPostUrlPrefix()
    return <PostPreviewWrapper slug={slug} postPrefix={postPrefix} />
  }

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const post = await getPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const tags = parseStringArray(post.tags)

  // サイドバーデータと前後記事を並列取得
  const [{ prevPost, nextPost }, sidebar] = await Promise.all([
    getAdjacentPosts(post.id, post.publishedAt),
    getSidebarFullData(),
  ])

  // レイアウト設定とパーマリンク設定を取得
  const [layoutConfig, postPrefix] = await Promise.all([
    getPostLayoutSettings(post.id),
    getPostUrlPrefix(),
  ])
  const containerStyles = getContainerStyles(layoutConfig)
  const contentStyles = getContentStyles(layoutConfig)

  return (
    <section className={styles.section()}>
      {/* 構造化データ: Article */}
      <ArticleJsonLd
        headline={post.title}
        description={post.excerpt || post.metaDescription || ''}
        image={post.thumbnailUrl}
        url={`${BASE_URL}${generatePostUrl(post, { structure: 'post-name', prefix: postPrefix })}`}
        datePublished={toISOString(post.publishedAt) || toISOString(post.updatedAt) || ''}
        dateModified={toISOString(post.updatedAt) || ''}
        author={{ name: SITE_DEFAULTS.name }}
      />

      <div className={`${styles.container()} ${containerStyles.className}`} style={containerStyles.style}>
        <div className={sidebar.enabled ? styles.layout() : ''}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            <article className={`${styles.article()} ${contentStyles.className}`} style={contentStyles.style}>
              {/* パンくずリスト */}
              <nav className={styles.breadcrumb()} aria-label="パンくずリスト">
                <Link href="/" className={styles.breadcrumbLink()}>
                  ホーム
                </Link>
                <span aria-hidden="true">/</span>
                <Link href={postPrefix || '/'} className={styles.breadcrumbLink()}>
                  ブログ
                </Link>
                <span aria-hidden="true">/</span>
                <span className="truncate max-w-[200px]">{post.title}</span>
              </nav>

              {/* ヘッダー */}
              <header className={styles.header()}>
                <div className={styles.meta()}>
                  <Link
                    href={generatePostListUrl(postPrefix, { category: post.category.slug })}
                    className={styles.category()}
                  >
                    {post.category.name}
                  </Link>
                  <span aria-hidden="true">•</span>
                  <time dateTime={toISOString(post.publishedAt)}>
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
                postPrefix={postPrefix}
              />

              {/* タグ */}
              {tags.length > 0 && (
                <div className={styles.tagsWrapper()}>
                  <h2 className={styles.tagsTitle()}>タグ</h2>
                  <ul className={styles.tagsList()}>
                    {tags.map((tag) => (
                      <li key={tag}>
                        <Link
                          href={generatePostListUrl(postPrefix, { tags: tag })}
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
                      <Link href={generatePostUrl(prevPost, { structure: 'post-name', prefix: postPrefix })} className={styles.navLink()}>
                        <div className={styles.navLabel()}>← 前の記事</div>
                        <div className={styles.navTitle()}>{prevPost.title}</div>
                      </Link>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {nextPost ? (
                      <Link
                        href={generatePostUrl(nextPost, { structure: 'post-name', prefix: postPrefix })}
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
                <CommentSection postId={post.id} />
              </Suspense>
            </article>
          </main>

          {/* サイドバー */}
          {sidebar.enabled && (
            <aside className={styles.sidebar()}>
              <BlogSidebar settings={sidebar.widgets} data={sidebar.data} postPrefix={postPrefix} />
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}
