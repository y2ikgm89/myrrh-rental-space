/**
 * 投稿一覧ページ
 *
 * @description nuqs を使用した URL State 管理のサンプル実装
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ページヘッダー
 * - 動的コンテンツ: 検索結果（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { tv } from 'tailwind-variants'
import { Container } from '@/public/components/ui'
import { BlogSidebar } from '@/public/components/sidebar'
import { getSidebarFullData } from '@/public/actions/sidebar'
import { prisma } from '@/shared/lib/prisma'
import { loadBlogSearchParams } from '@/shared/lib/nuqs'
import {
  blogSearchParamsDefaults,
  blogSearchParamsSchema,
} from '@/shared/lib/validations/search-params'
import { PostCard } from './_components/PostCard'
import { PostFilters } from './_components/PostFilters'
import { PostPagination } from './_components/PostPagination'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import { PostStatus } from '@/shared/generated/prisma/enums'
import type { Prisma } from '@/shared/generated/prisma/client'
import type { SearchParams } from 'nuqs/server'
import type { ReactElement } from 'react'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('posts', {
    title: 'ブログ',
    description: '最新のレンタルスペース活用情報とお知らせをお届けします。',
  })
}

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    subtitle: 'mt-2 text-muted-foreground',
    filtersWrapper: 'mb-8',
    layout: 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-8',
    mainContent: '',
    sidebar: 'mt-8 lg:mt-0',
    grid: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    emptyState: 'text-center py-16 text-muted-foreground',
    resultCount: 'text-sm text-muted-foreground mb-4',
  },
})()

/**
 * フィルター用データを取得（キャッシュ付き）
 */
async function getFilterData() {
  'use cache'
  cacheLife('hours')
  cacheTag('posts')

  const [categories, tagsList] = await Promise.all([
    prisma.postCategory.findMany({ orderBy: { order: 'asc' } }),
    prisma.postTag.findMany({ orderBy: { name: 'asc' } }),
  ])

  return { categories, tagsList }
}

/**
 * 動的コンテンツ: 投稿一覧
 */
async function PostResults({
  searchParams,
  postPrefix,
}: {
  searchParams: Promise<SearchParams>
  postPrefix: string
}): Promise<ReactElement> {
  const { q, page, perPage, category, tags, sort } =
    await loadBlogSearchParams(searchParams)

  const normalizedQuery = q.trim()
  const normalizedCategory = category.trim()
  const normalizedTags = Array.isArray(tags)
    ? tags.filter((tag) => tag.length > 0)
    : []

  const parsedParams = blogSearchParamsSchema.safeParse({
    q: normalizedQuery,
    page,
    perPage,
    category: normalizedCategory,
    tags: normalizedTags,
    sort,
  })
  const {
    q: safeQuery,
    page: safePage,
    perPage: safePerPage,
    category: safeCategory,
    tags: safeTags,
    sort: safeSort,
  } = parsedParams.success ? parsedParams.data : blogSearchParamsDefaults

  const where = {
    status: PostStatus.PUBLISHED,
    publishedAt: { not: null },
    ...(safeQuery && {
      OR: [
        { title: { contains: safeQuery, mode: 'insensitive' } },
        { excerpt: { contains: safeQuery, mode: 'insensitive' } },
        { content: { contains: safeQuery, mode: 'insensitive' } },
      ],
    }),
    ...(safeCategory && {
      category: { slug: safeCategory },
    }),
    ...(safeTags.length > 0 && {
      tags: { array_contains: safeTags },
    }),
  } satisfies Prisma.PostWhereInput

  const [posts, totalCount] = await Promise.all([
    prisma.post.findMany({
      where,
      skip: (safePage - 1) * safePerPage,
      take: safePerPage,
      orderBy: [{ publishedAt: safeSort }, { createdAt: safeSort }],
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
    }),
    prisma.post.count({ where }),
  ])

  const totalPages = Math.ceil(totalCount / safePerPage)
  const startCount = totalCount === 0 ? 0 : (safePage - 1) * safePerPage + 1
  const endCount =
    totalCount === 0 ? 0 : Math.min(safePage * safePerPage, totalCount)

  return (
    <>
      <p className={styles.resultCount()}>
        {totalCount}件中 {startCount}-{endCount}件を表示
        {safeQuery && (
          <span className="ml-2">（検索: &quot;{safeQuery}&quot;）</span>
        )}
      </p>

      {posts.length > 0 ? (
        <div className={styles.grid()}>
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index} postPrefix={postPrefix} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState()}>
          <p>条件に一致する投稿が見つかりませんでした。</p>
        </div>
      )}

      {totalPages > 1 && (
        <PostPagination currentPage={safePage} totalPages={totalPages} />
      )}
    </>
  )
}

/**
 * ローディングUI
 */
function PostResultsLoading(): ReactElement {
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

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function PostsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  // フィルター用データは静的シェルに含める
  const [{ categories, tagsList }, sidebar, postPrefix] = await Promise.all([
    getFilterData(),
    getSidebarFullData(),
    getPostUrlPrefix(),
  ])

  return (
    <section className={styles.section()}>
      <Container>
        {/* 静的シェル: ヘッダー */}
        <header className={styles.header()}>
          <h1 className={styles.title()}>ブログ</h1>
          <p className={styles.subtitle()}>
            レンタルスペースの活用アイデアや最新ニュースをお届けします
          </p>
        </header>

        {/* フィルター（キャッシュされたデータ） */}
        <div className={styles.filtersWrapper()}>
          <PostFilters categories={categories} tags={tagsList} />
        </div>

        {/* 2カラムレイアウト: メイン + サイドバー */}
        <div className={sidebar.enabled ? styles.layout() : ''}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            {/* 動的コンテンツ: 投稿一覧 */}
            <Suspense fallback={<PostResultsLoading />}>
              <PostResults searchParams={searchParams} postPrefix={postPrefix} />
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
