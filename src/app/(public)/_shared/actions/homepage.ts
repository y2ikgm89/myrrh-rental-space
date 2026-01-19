'use server'

/**
 * ホームページセクション 公開用Server Actions
 *
 * 認証不要の読み取り専用アクション
 */

import { prisma } from '@/shared/lib/prisma'
import { HomepageSectionType } from '@/shared/lib/validations/enums'
import {
  validateSectionConfig,
  defaultSectionConfigs,
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
// Helper Functions
// =============================================================================

/**
 * PrismaのJson型をSectionConfigに変換（ランタイムバリデーション付き）
 */
function parseSectionConfig(type: HomepageSectionType, config: unknown): SectionConfig {
  const result = validateSectionConfig(type, config)
  if (result.success) {
    return result.data as SectionConfig
  }
  // バリデーション失敗時はデフォルト設定にフォールバック
  return defaultSectionConfigs[type]
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * 公開用: アクティブなセクションを取得
 */
export async function getPublicHomepageSections(): Promise<HomepageSectionData[]> {
  const sections = await prisma.homepageSection.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }))
}
