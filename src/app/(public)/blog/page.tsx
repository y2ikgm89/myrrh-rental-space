/**
 * ブログ一覧ページ
 *
 * @description nuqs を使用した URL State 管理のサンプル実装
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardFooter, Container } from '@/components/site/ui'
import { prisma } from '@/lib/prisma'
import { loadBlogSearchParams } from '@/lib/nuqs'
import { cn } from '@/lib/utils'
import {
  blogSearchParamsDefaults,
  blogSearchParamsSchema,
} from '@/lib/validations/search-params'
import { BlogFilters } from './_components/blog-filters'
import { BlogPagination } from './_components/blog-pagination'
import type { Prisma } from '@/generated/prisma/client/client'
import type { SearchParams } from 'nuqs/server'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'ブログ',
  description: '最新のレンタルスペース活用情報とお知らせをお届けします。',
}

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    subtitle: 'mt-2 text-muted-foreground',
    filtersWrapper: 'mb-8',
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
}

/**
 * 公開日を表示用に整形する
 *
 * @param value - 公開日
 * @returns 表示用日付
 */
function formatPublishedDate(value: Date | null): string {
  if (!value) return '公開準備中'
  return value.toLocaleDateString('ja-JP')
}

/**
 * JSON 形式のタグ配列から文字列配列を抽出する
 *
 * @param value - tags の JSON 値
 * @returns タグ文字列の配列
 */
function getTags(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => typeof tag === 'string')
}

function BlogCard({ post }: BlogCardProps): ReactElement {
  const tags = getTags(post.tags)

  return (
    <Link href={`/blog/${post.slug}`} aria-label={post.title}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
        <div className={styles.imageWrapper()}>
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
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

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function BlogPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
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
    isPublished: true,
    publishedAt: { not: null },
    ...(safeQuery && {
      OR: [
        { title: { contains: safeQuery, mode: 'insensitive' as const } },
        { excerpt: { contains: safeQuery, mode: 'insensitive' as const } },
        { content: { contains: safeQuery, mode: 'insensitive' as const } },
      ],
    }),
    ...(safeCategory && {
      category: { slug: safeCategory },
    }),
    ...(safeTags.length > 0 && {
      tags: { array_contains: safeTags },
    }),
  } satisfies Prisma.BlogPostWhereInput

  const [posts, totalCount, categories, tagsList] = await Promise.all([
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
    prisma.blogCategory.findMany({ orderBy: { order: 'asc' } }),
    prisma.blogTag.findMany({ orderBy: { name: 'asc' } }),
  ])

  const totalPages = Math.ceil(totalCount / safePerPage)
  const startCount = totalCount === 0 ? 0 : (safePage - 1) * safePerPage + 1
  const endCount =
    totalCount === 0 ? 0 : Math.min(safePage * safePerPage, totalCount)

  return (
    <section className={styles.section()}>
      <Container>
        <header className={styles.header()}>
          <h1 className={styles.title()}>ブログ</h1>
          <p className={styles.subtitle()}>
            レンタルスペースの活用アイデアや最新ニュースをお届けします
          </p>
        </header>

        <div className={styles.filtersWrapper()}>
          <BlogFilters categories={categories} tags={tagsList} />
        </div>

        <p className={styles.resultCount()}>
          {totalCount}件中 {startCount}-{endCount}件を表示
          {safeQuery && (
            <span className="ml-2">（検索: &quot;{safeQuery}&quot;）</span>
          )}
        </p>

        {posts.length > 0 ? (
          <div className={styles.grid()}>
            {posts.map((post) => (
              <BlogCard key={post.id} post={post} />
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
      </Container>
    </section>
  )
}
