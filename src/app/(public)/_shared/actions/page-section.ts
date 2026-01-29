'use server'

/**
 * 公開ページ用 PageSection Server Actions
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { toPlainObject } from '@/shared/lib/serialize'
import { criticalFetch, ErrorCategory } from '@/shared/lib/errors'
import { CACHE_LIFE, CACHE_TAGS } from '@/shared/lib/constants'
import type { PageSectionType } from '@/shared/lib/validations/page-section'

/**
 * 公開用セクションデータ型
 */
export interface PublicPageSectionData {
  id: string
  pageId: string
  type: PageSectionType
  title: string | null
  config: unknown
  content: string | null
  order: number
}

/**
 * 公開用: ページのアクティブなセクションを取得
 */
export async function getPublicPageSections(pageId: string): Promise<PublicPageSectionData[]> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.PAGES, `${CACHE_TAGS.PAGES}-sections-${pageId}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.pageSection.findMany({
        where: {
          pageId,
          isActive: true,
        },
        select: {
          id: true,
          pageId: true,
          type: true,
          title: true,
          config: true,
          content: true,
          order: true,
        },
        orderBy: { order: 'asc' },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getPublicPageSections',
    context: { pageId },
  })

  return toPlainObject(result || [])
}

/**
 * ページをセクション付きで取得（公開用）
 */
export async function getPublicPageWithSections(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.PAGES, `${CACHE_TAGS.PAGES}-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: {
          slug,
          isPublished: true,
          isActive: true,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          metaDescription: true,
          metaKeywords: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
          showSidebar: true,
          contentWidth: true,
          contentWidthCustom: true,
          sections: {
            where: { isActive: true },
            select: {
              id: true,
              pageId: true,
              type: true,
              title: true,
              config: true,
              content: true,
              order: true,
            },
            orderBy: { order: 'asc' },
          },
        },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getPublicPageWithSections',
    context: { slug },
  })

  return toPlainObject(result)
}
