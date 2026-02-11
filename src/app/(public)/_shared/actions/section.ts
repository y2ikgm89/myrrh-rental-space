/**
 * 公開ページ用セクション取得
 *
 * 認証不要。'use cache' + cacheTag でキャッシュ。
 * admin の Section CRUD で CACHE_TAGS.SECTIONS が無効化される。
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { toPlainArray } from '@/shared/lib/serialize'
import type { SectionType } from '@/shared/generated/prisma/enums'
import { PostStatus } from '@/shared/generated/prisma/enums'

export type PublicSection = {
  readonly id: string
  readonly type: SectionType
  readonly title: string | null
  readonly content: string | null
  readonly config: unknown
  readonly design: unknown
  readonly order: number
}

/**
 * ホームページセクション取得（pageId = null）
 */
export async function getHomepageSections(): Promise<readonly PublicSection[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.HOMEPAGE_SECTIONS)

  const sections = await prisma.section.findMany({
    where: {
      pageId: null,
      isActive: true,
    },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      config: true,
      design: true,
      order: true,
    },
    orderBy: { order: 'asc' },
  })

  return sections
}

/**
 * SpaceShowcase 用のスペースデータ取得
 */
export async function getShowcaseSpaces(maxItems: number, showOnlyPublished: boolean) {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SPACES)

  const spaces = await prisma.space.findMany({
    where: {
      isActive: true,
      ...(showOnlyPublished ? { isPublished: true } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      capacity: true,
      hourlyPrice: true,
      area: true,
      mainImageUrl: true,
    },
    orderBy: { createdAt: 'desc' },
    take: maxItems,
  })

  return toPlainArray(spaces)
}

/**
 * ページセクション取得（pageId 指定）
 */
export async function getPageSections(pageId: string): Promise<readonly PublicSection[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.PAGE_SECTIONS)

  const sections = await prisma.section.findMany({
    where: {
      pageId,
      isActive: true,
    },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      config: true,
      design: true,
      order: true,
    },
    orderBy: { order: 'asc' },
  })

  return sections
}

// =============================================================================
// DB 依存セクション用データ取得
// =============================================================================

/**
 * SpaceList セクション用: スペース一覧取得
 */
export async function getListSpaces(maxItems: number, showOnlyPublished: boolean) {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SPACES)

  const spaces = await prisma.space.findMany({
    where: {
      isActive: true,
      ...(showOnlyPublished ? { isPublished: true } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      capacity: true,
      hourlyPrice: true,
      area: true,
      mainImageUrl: true,
    },
    orderBy: { createdAt: 'desc' },
    take: maxItems,
  })

  return toPlainArray(spaces)
}

/**
 * NewsList セクション用: 公開済みニュース取得
 */
export async function getPublishedNews(maxItems: number) {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.NEWS)

  const news = await prisma.news.findMany({
    where: {
      isPublished: true,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: maxItems,
  })

  return news
}

/**
 * PostList セクション用: 公開済み記事取得
 */
export async function getPublishedPosts(maxItems: number, categoryId?: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.POSTS)

  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      ...(categoryId ? { categoryId } : {}),
    },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      thumbnailUrl: true,
      publishedAt: true,
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { publishedAt: 'desc' },
    take: maxItems,
  })

  return posts
}

/**
 * FaqList セクション用: 公開済み FAQ 取得
 */
export async function getPublishedFaqItems(maxItems: number, categoryId?: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.FAQ)

  const items = await prisma.faqItem.findMany({
    where: {
      isPublished: true,
      ...(categoryId ? { categoryId } : {}),
    },
    select: {
      id: true,
      question: true,
      answer: true,
    },
    orderBy: { order: 'asc' },
    take: maxItems,
  })

  return items
}

/**
 * [slug] ルート用: 公開ページ取得
 */
export async function getPublicPage(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.PAGES, `${CACHE_TAGS.PAGES}-${slug}`)

  const page = await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
    },
  })

  return page
}

/**
 * generateStaticParams 用: 全公開ページのスラッグ取得
 */
export async function getAllPublishedPageSlugs() {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.PAGES)

  const pages = await prisma.page.findMany({
    where: {
      isPublished: true,
      isActive: true,
    },
    select: {
      slug: true,
    },
  })

  return pages.map((p) => p.slug)
}
