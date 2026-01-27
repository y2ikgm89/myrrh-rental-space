/**
 * 投稿タグページ
 *
 * 特定タグの記事一覧を表示
 *
 * Next.js 16 PPR対応:
 * - generateStaticParams でビルド時に事前生成
 * - 動的コンテンツは Suspense でラップ
 */

import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { Container } from '@/public/components/ui'
import { BlogSidebar } from '@/public/components/sidebar'
import { getSidebarFullData } from '@/public/actions/sidebar'
import { prisma } from '@/shared/lib/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { CACHE_LIFE, CACHE_TAGS } from '@/shared/lib/constants'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import { PostCard } from '../../_components/PostCard'
import type { ReactElement } from 'react'

// =============================================================================
// Types
// =============================================================================

interface PageProps {
  params: Promise<{ slug: string }>
}

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    subtitle: 'mt-2 text-muted-foreground',
    breadcrumb: 'text-sm text-muted-foreground mb-4',
    breadcrumbLink: 'hover:text-foreground transition-colors',
    layout: 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-8',
    mainContent: '',
    sidebar: 'mt-8 lg:mt-0',
    grid: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    emptyState: 'text-center py-16 text-muted-foreground',
    resultCount: 'text-sm text-muted-foreground mb-4',
  },
})()

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * タグ情報を取得（キャッシュ付き）
 * slugまたはnameで検索（PostのtagsはnameまたはJSONで保存）
 */
async function getTagBySlugOrName(slugOrName: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POST_TAGS)

  return prisma.postTag.findFirst({
    where: {
      OR: [
        { slug: slugOrName },
        { name: slugOrName },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
    },
  })
}

/**
 * タグ別記事を取得（キャッシュ付き）
 * タグはJSON配列で保存されているため、array_contains で検索
 */
async function getPostsByTag(tagName: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  return prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      publishedAt: { not: null },
      tags: { array_contains: [tagName] },
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      thumbnailUrl: true,
      publishedAt: true,
      tags: true,
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  })
}

// =============================================================================
// Static Generation
// =============================================================================

/**
 * 静的パラメータ生成
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  try {
    const tags = await prisma.postTag.findMany({
      select: { slug: true },
    })

    if (tags.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return tags.map((tag) => ({
      slug: tag.slug,
    }))
  } catch {
    return [{ slug: '__placeholder__' }]
  }
}

// =============================================================================
// Metadata
// =============================================================================

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const tag = await getTagBySlugOrName(decodedSlug)

  if (!tag) {
    return {
      title: 'タグが見つかりません',
    }
  }

  // SEOフィールドを優先、なければフォールバック
  const title = tag.metaTitle || `#${tag.name} - ブログ`
  const description = tag.metaDescription || tag.description || `${tag.name}タグが付いた記事一覧`

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  }

  // OGP画像が設定されている場合
  if (tag.ogpImageUrl) {
    metadata.openGraph = {
      ...metadata.openGraph,
      images: [{ url: tag.ogpImageUrl }],
    }
  }

  return metadata
}

// =============================================================================
// Components
// =============================================================================

/**
 * 記事一覧コンテンツ
 */
async function TagContent({
  tagName,
  postPrefix,
}: {
  tagName: string
  postPrefix: string
}): Promise<ReactElement> {
  const posts = await getPostsByTag(tagName)

  return (
    <>
      <p className={styles.resultCount()}>{posts.length}件の記事</p>

      {posts.length > 0 ? (
        <div className={styles.grid()}>
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index} highlightTag={tagName} postPrefix={postPrefix} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState()}>
          <p>このタグの記事はまだありません。</p>
        </div>
      )}
    </>
  )
}

/**
 * ローディングUI
 */
function ContentLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 bg-muted rounded w-48" />
      <div className={styles.grid()}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-72 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Page Component
// =============================================================================

export default async function PostTagPage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)

  // プレースホルダーの場合は404
  if (decodedSlug === '__placeholder__') {
    notFound()
  }

  const tag = await getTagBySlugOrName(decodedSlug)

  if (!tag) {
    notFound()
  }

  const [sidebar, postPrefix] = await Promise.all([
    getSidebarFullData(),
    getPostUrlPrefix(),
  ])

  return (
    <section className={styles.section()}>
      <Container>
        {/* パンくずリスト */}
        <nav className={styles.breadcrumb()} aria-label="パンくずリスト">
          <Link href={postPrefix || '/'} className={styles.breadcrumbLink()}>
            ブログ
          </Link>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span>#{tag.name}</span>
        </nav>

        {/* ヘッダー */}
        <header className={styles.header()}>
          <h1 className={styles.title()}>#{tag.name}</h1>
          <p className={styles.subtitle()}>
            {tag.description || 'このタグが付いた記事一覧'}
          </p>
        </header>

        {/* 2カラムレイアウト */}
        <div className={sidebar.enabled ? styles.layout() : ''}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            <Suspense fallback={<ContentLoading />}>
              <TagContent tagName={tag.name} postPrefix={postPrefix} />
            </Suspense>
          </main>

          {/* サイドバー */}
          {sidebar.enabled && (
            <aside className={styles.sidebar()}>
              <BlogSidebar settings={sidebar.widgets} data={sidebar.data} postPrefix={postPrefix} />
            </aside>
          )}
        </div>
      </Container>
    </section>
  )
}
