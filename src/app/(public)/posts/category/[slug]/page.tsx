/**
 * 投稿カテゴリーページ
 *
 * 特定カテゴリーの記事一覧を表示
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
 * カテゴリー情報を取得（キャッシュ付き）
 */
async function getCategoryBySlug(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  return prisma.postCategory.findUnique({
    where: { slug },
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
 * カテゴリー別記事を取得（キャッシュ付き）
 */
async function getPostsByCategory(categoryId: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  return prisma.post.findMany({
    where: {
      categoryId,
      status: PostStatus.PUBLISHED,
      publishedAt: { not: null },
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
    const categories = await prisma.postCategory.findMany({
      select: { slug: true },
    })

    if (categories.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return categories.map((category) => ({
      slug: category.slug,
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
  const category = await getCategoryBySlug(slug)

  if (!category) {
    return {
      title: 'カテゴリーが見つかりません',
    }
  }

  // SEOフィールドを優先、なければフォールバック
  const title = category.metaTitle || `${category.name} - ブログ`
  const description = category.metaDescription || category.description || `${category.name}カテゴリーの記事一覧`

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  }

  // OGP画像が設定されている場合
  if (category.ogpImageUrl) {
    metadata.openGraph = {
      ...metadata.openGraph,
      images: [{ url: category.ogpImageUrl }],
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
async function CategoryContent({ categoryId, postPrefix }: { categoryId: string; postPrefix: string }): Promise<ReactElement> {
  const posts = await getPostsByCategory(categoryId)

  return (
    <>
      <p className={styles.resultCount()}>{posts.length}件の記事</p>

      {posts.length > 0 ? (
        <div className={styles.grid()}>
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index} postPrefix={postPrefix} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState()}>
          <p>このカテゴリーの記事はまだありません。</p>
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

export default async function PostCategoryPage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const category = await getCategoryBySlug(slug)

  if (!category) {
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
          <span>{category.name}</span>
        </nav>

        {/* ヘッダー */}
        <header className={styles.header()}>
          <h1 className={styles.title()}>{category.name}</h1>
          {category.description && (
            <p className={styles.subtitle()}>{category.description}</p>
          )}
        </header>

        {/* 2カラムレイアウト */}
        <div className={sidebar.enabled ? styles.layout() : ''}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            <Suspense fallback={<ContentLoading />}>
              <CategoryContent categoryId={category.id} postPrefix={postPrefix} />
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
