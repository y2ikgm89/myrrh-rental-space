/**
 * 公開ページ用セクション取得
 *
 * 認証不要。'use cache' + cacheTag でキャッシュ。
 * admin の Section CRUD で CACHE_TAGS.SECTIONS が無効化される。
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
import { toPlainArray, toPlainObject } from '@/shared/lib/serialize'
import { SectionType, PostStatus } from '@/shared/generated/prisma/enums'
import { slugParamSchema, idParamSchema } from '@/shared/lib/validations/params'
import { DEFAULT_PAGE_SECTIONS } from '@/shared/lib/constants/default-page-sections'

export type PublicSection = {
  readonly id: string
  readonly type: SectionType
  readonly title: string | null
  readonly contentHtml: string | null
  readonly contentJson: unknown | null
  readonly config: unknown
  readonly design: unknown
  readonly order: number
}

/**
 * ホームページセクション取得（pageId = null）
 */
export async function getHomepageSections(): Promise<readonly PublicSection[]> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
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
      contentHtml: true,
      contentJson: true,
      config: true,
      design: true,
      order: true,
    },
    orderBy: { order: 'asc' },
  })

  return toPlainArray(sections)
}

/**
 * 公開スペースデータ取得（SpaceShowcase / SpaceList 共通）
 */
export async function getShowcaseSpaces(maxItems: number, showOnlyPublished: boolean) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
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
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.PAGE_SECTIONS)

  if (!idParamSchema.safeParse(pageId).success) return []

  const sections = await prisma.section.findMany({
    where: {
      pageId,
      isActive: true,
    },
    select: {
      id: true,
      type: true,
      title: true,
      contentHtml: true,
      contentJson: true,
      config: true,
      design: true,
      order: true,
    },
    orderBy: { order: 'asc' },
  })

  return toPlainArray(sections)
}

/**
 * ページの全セクションを取得（slug ベース、フォールバック付き）
 *
 * DB にページ / セクションが存在しない場合は
 * DEFAULT_PAGE_SECTIONS のデフォルト定義にフォールバック。
 * about, privacy, terms, spaces, faq 等のセクション駆動ページで使用。
 */
export async function getPageSectionsWithFallback(
  slug: string,
): Promise<readonly PublicSection[]> {
  const page = await getPublicPage(slug)
  if (page) {
    const sections = await getPageSections(page.id)
    if (sections.length > 0) return sections
  }

  // Fallback: DEFAULT_PAGE_SECTIONS のデフォルト定義を使用
  const defaults = DEFAULT_PAGE_SECTIONS[slug]
  if (!defaults || defaults.length === 0) return []

  return defaults.map((d, i) => ({
    id: `default-${slug}-${i}`,
    type: d.type,
    title: d.title,
    contentHtml: d.content,
    contentJson: null,
    config: d.config,
    design: d.design ?? {},
    order: d.order,
  }))
}


// =============================================================================
// DB 依存セクション用データ取得
// =============================================================================

/**
 * NewsList セクション用: 公開済みニュース取得
 */
export async function getPublishedNews(maxItems: number) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
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

  return toPlainArray(news)
}

/**
 * PostList セクション用: 公開済み記事取得
 */
export async function getPublishedPosts(maxItems: number, categoryId?: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
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

  return toPlainArray(posts)
}

/**
 * FaqList セクション用: 公開済み FAQ 取得
 */
export async function getPublishedFaqItems(maxItems: number, categoryId?: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.FAQ)

  const items = await prisma.faqItem.findMany({
    where: {
      isPublished: true,
      ...(categoryId ? { categoryId } : {}),
    },
    select: {
      id: true,
      question: true,
      answerHtml: true,
      answerJson: true,
    },
    orderBy: { order: 'asc' },
    take: maxItems,
  })

  return toPlainArray(items)
}

/**
 * [slug] ルート用: 公開ページ取得
 */
export async function getPublicPage(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.PAGES, `${CACHE_TAGS.PAGES}-${slug}`)

  if (!slugParamSchema.safeParse(slug).success) return null

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

  return toPlainObject(page)
}

