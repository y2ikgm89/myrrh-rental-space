/**
 * 公開ページ用セクション取得
 *
 * 認証不要。'use cache' + cacheTag でキャッシュ。
 * admin の Section CRUD で CACHE_TAGS.SECTIONS が無効化される。
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS } from '@/shared/lib/constants'
import type { SectionType } from '@/shared/generated/prisma/enums'

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

  return spaces
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
