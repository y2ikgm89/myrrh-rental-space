'use server'

/**
 * ホームページセクション 公開用Server Actions
 *
 * 認証不要の読み取り専用アクション
 */

import { prisma } from '@/shared/lib/prisma'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { HomepageSectionType } from '@/shared/lib/validations/enums'
import {
  getSafeConfig,
  type SectionConfig,
} from '@/shared/lib/validations/homepage-section'

// =============================================================================
// Types
// =============================================================================

export type HomepageSectionData = {
  id: string
  type: HomepageSectionType
  title: string | null
  config: SectionConfig
  content: string | null
  order: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}


// =============================================================================
// Read Actions
// =============================================================================

/**
 * 公開用: アクティブなセクションを取得（キャッシュ付き）
 */
export async function getPublicHomepageSections(): Promise<HomepageSectionData[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CACHE_TAGS.HOMEPAGE_SECTIONS)

  const sections = await prisma.homepageSection.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    config: getSafeConfig(section.type, section.config),
  }))
}
