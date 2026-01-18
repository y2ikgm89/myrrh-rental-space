/**
 * ブログ一覧ページ
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
import Image from 'next/image'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardFooter, Container } from '@/public/components/ui'
import { BlogSidebar } from '@/public/components/sidebar'
import { getSidebarSettings, getSidebarData } from '@/public/actions/sidebar'
import { prisma } from '@/shared/lib/prisma'
import { loadBlogSearchParams } from '@/shared/lib/nuqs'
import { cn } from '@/shared/lib/utils'
import {
  blogSearchParamsDefaults,
  blogSearchParamsSchema,
} from '@/shared/lib/validations/search-params'
import { BlogFilters } from './_components/BlogFilters'
import { BlogPagination } from './_components/BlogPagination'
import { parseStringArray } from '@/shared/lib/json-validators'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { BlogPostStatus } from '@/shared/generated/prisma/enums'
import type { Prisma } from '@/shared/generated/prisma/client'
import type { SearchParams } from 'nuqs/server'
import type { ReactElement } from 'react'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('blog', {
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
    imageWrapper: 'relative aspect-[4/3] overflow-hidden rounded-t-lg',
    image: 'object-cover transition-transform duration-300 hover:scale-105',
    cardTitle: 'text-lg font-semibold text-foreground line-clamp-2',
    excerpt: 'mt-2 text-sm text-muted-foreground line-clamp-3',
    meta: 'flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
    tag: 'rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground',
    emptyState: 'text-center py-16 text-muted-foreground',
    resultCount: 'text-sm text-muted-foreground mb-4',
  },
})()

type BlogPostListItem = Prisma.BlogPostGetPayload<{
  select: {
    id: true
    title: true
    slug: true
    excerpt: true
    thumbnailUrl: true
    publishedAt: true
    tags: true
    category: {
      select: {
        name: true
        slug: true
      }
    }
  }
}>

interface BlogCardProps {
  post: BlogPostListItem
  index: number
}

/**
 * 公開日を表示用に整形する
 */
function formatPublishedDate(value: Date | null): string {
  if (!value) return '公開準備中'
  return value.toLocaleDateString('ja-JP')
}

function BlogCard({ post, index }: BlogCardProps): ReactElement {
  const tags = parseStringArray(post.tags)

  return (
    <Link href={`/blog/${post.slug}`} aria-label={post.title}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
        <div className={styles.imageWrapper()}>
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            priority={index < 2}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={styles.image()}
          />
        </div>
        <CardContent className="p-4">
          <div className={styles.meta()}>
            <span>{post.category.name}</span>
            <span aria-hidden="true">•</span>
            <span>{formatPublishedDate(post.publishedAt)}</span>
          </div>
          <h3 className={styles.cardTitle()}>{post.title}</h3>
          <p className={styles.excerpt()}>{post.excerpt}</p>
        </CardContent>
        <CardFooter className={cn('p-4 pt-0', styles.meta())}>
          {tags.length > 0 ? (
            tags.slice(0, 3).map((tag) => (
              <span key={tag} className={styles.tag()}>
                #{tag}
              </span>
            ))
          ) : (
            <span className={styles.tag()}>タグ未設定</span>
          )}
        </CardFooter>
      </Card>
    </Link>
  )
}

/**
 * フィルター用データを取得（キャッシュ付き）
 */
async function getFilterData() {
  'use cache'
  cacheLife('hours')
  cacheTag('blog')

  const [categories, tagsList] = await Promise.all([
    prisma.blogCategory.findMany({ orderBy: { order: 'asc' } }),
    prisma.blogTag.findMany({ orderBy: { name: 'asc' } }),
  ])

  return { categories, tagsList }
}

/**
 * 動的コンテンツ: ブログ一覧
 */
async function BlogResults({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
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
    status: BlogPostStatus.PUBLISHED,
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
  } satisfies Prisma.BlogPostWhereInput

  const [posts, totalCount] = await Promise.all([
    prisma.blogPost.findMany({
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
    prisma.blogPost.count({ where }),
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
            <BlogCard key={post.id} post={post} index={index} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState()}>
          <p>条件に一致するブログ記事が見つかりませんでした。</p>
        </div>
      )}

      {totalPages > 1 && (
        <BlogPagination currentPage={safePage} totalPages={totalPages} />
      )}
    </>
  )
}

/**
 * ローディングUI
 */
function BlogResultsLoading(): ReactElement {
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

export default async function BlogPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  // フィルター用データは静的シェルに含める
  const [{ categories, tagsList }, sidebarSettings, sidebarData] = await Promise.all([
    getFilterData(),
    getSidebarSettings(),
    getSidebarData(),
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
          <BlogFilters categories={categories} tags={tagsList} />
        </div>

        {/* 2カラムレイアウト: メイン + サイドバー */}
        <div className={sidebarSettings.enabled ? styles.layout() : ''}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            {/* 動的コンテンツ: ブログ一覧 */}
            <Suspense fallback={<BlogResultsLoading />}>
              <BlogResults searchParams={searchParams} />
            </Suspense>
          </main>

          {/* サイドバー */}
          {sidebarSettings.enabled && (
            <aside className={styles.sidebar()}>
              <BlogSidebar settings={sidebarSettings.widgets} data={sidebarData} />
            </aside>
          )}
        </div>
      </Container>
    </section>
  )
}
