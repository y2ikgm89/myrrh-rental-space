'use server'

/**
 * ホームページセクション Server Actions
 *
 * 統一 Section モデル（pageId = null でホームページ判別）
 */

import type { Prisma } from '@/shared/generated/prisma/client'
import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { purgeHomeCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import {
  SectionType,
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  validateSectionConfig,
  defaultSectionConfigs,
  defaultHomepageSectionOrder,
  type CreateSectionInput,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
  type SectionConfig,
} from '@/shared/lib/validations/section'

/**
 * PrismaのJson型をSectionConfigに変換（ランタイムバリデーション付き）
 */
function parseSectionConfig(type: SectionType, config: unknown): SectionConfig {
  const result = validateSectionConfig(type, config)
  if (result.success) {
    // Safe widening: validated individual config type → SectionConfig union
    return result.data as SectionConfig
  }
  return defaultSectionConfigs[type]
}

// =============================================================================
// Types
// =============================================================================

export type HomepageSectionData = {
  id: string
  type: SectionType
  title: string | null
  config: SectionConfig
  design: unknown
  content: string | null
  order: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// Helper Functions
// =============================================================================

async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'settings', 'read')) {
    void logPermissionDenied(session.user.id, 'settings', 'read')
    return false
  }
  return true
}

function revalidateHomepage() {
  updateTag(CACHE_TAGS.SECTIONS)
  updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS)
  updateTag(CACHE_TAGS.PAGES)
  updateTag(CACHE_TAGS.SETTINGS)

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeHomeCache(), { operation: 'purgeHomeCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * 全ホームページセクションを取得（管理画面用）
 */
export async function getHomepageSections(): Promise<HomepageSectionData[] | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const sections = await prisma.section.findMany({
    where: { pageId: null },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }))
}

/**
 * 公開用: アクティブなホームページセクションを取得
 */
export async function getPublicHomepageSections(): Promise<HomepageSectionData[]> {
  const sections = await prisma.section.findMany({
    where: { pageId: null, isActive: true },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }))
}

/**
 * 単一セクションを取得
 */
export async function getHomepageSection(id: string): Promise<HomepageSectionData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const section = await prisma.section.findUnique({
    where: { id },
  })

  if (!section || section.pageId !== null) return null

  return {
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }
}

/**
 * タイプでホームページセクションを取得
 */
export async function getHomepageSectionByType(
  type: SectionType
): Promise<HomepageSectionData | null> {
  const section = await prisma.section.findFirst({
    where: { type, pageId: null },
    orderBy: { order: 'asc' },
  })

  if (!section) return null

  return {
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }
}

// =============================================================================
// Create Actions
// =============================================================================

/**
 * ホームページセクションを作成
 */
export const createHomepageSection = withPermission<[CreateSectionInput], { id: string }>(
  'settings',
  'update'
)(async (_user, input) => {
  const parsed = createSectionSchema.safeParse({ ...input, pageId: undefined })
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
  }

  const { type, title, config, design, content, order, isActive } = parsed.data

  // 設定を検証
  const configValidation = validateSectionConfig(type, config)
  if (!configValidation.success) {
    return createFailure(`設定エラー: ${configValidation.error.issues[0]?.message ?? 'バリデーションエラー'}`)
  }

  // 次のorder値を取得
  const maxOrder = await prisma.section.aggregate({
    where: { pageId: null },
    _max: { order: true },
  })
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1

  const section = await prisma.section.create({
    data: {
      pageId: null,
      type,
      title,
      config: configValidation.data,
      design: (design ?? {}) as Prisma.InputJsonObject,
      content,
      order: nextOrder,
      isActive,
    },
  })

  revalidateHomepage()
  return createSuccess('セクションを作成しました', { id: section.id })
})

// =============================================================================
// Update Actions
// =============================================================================

/**
 * ホームページセクションを更新
 */
export const updateHomepageSection = withPermission<[string, UpdateSectionInput], void>(
  'settings',
  'update'
)(async (_user, id, input) => {
  const parsed = updateSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
  }

  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || existing.pageId !== null) {
    return createFailure('セクションが見つかりません')
  }

  // 設定を検証（configが更新される場合）
  if (parsed.data.config) {
    const configValidation = validateSectionConfig(existing.type, parsed.data.config)
    if (!configValidation.success) {
      return createFailure(`設定エラー: ${configValidation.error.issues[0]?.message ?? 'バリデーションエラー'}`)
    }
    parsed.data.config = configValidation.data
  }

  await prisma.section.update({
    where: { id },
    data: {
      title: parsed.data.title,
      config: parsed.data.config as object | undefined,
      design: parsed.data.design as object | undefined,
      content: parsed.data.content,
      isActive: parsed.data.isActive,
    },
  })

  revalidateHomepage()
  return createSuccess('セクションを更新しました')
})

/**
 * セクションの有効/無効を切り替え
 */
export const toggleHomepageSection = withPermission<[string, boolean], void>(
  'settings',
  'update'
)(async (_user, id, isActive) => {
  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || existing.pageId !== null) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.section.update({
    where: { id },
    data: { isActive },
  })

  revalidateHomepage()
  return createSuccess(isActive ? 'セクションを有効にしました' : 'セクションを無効にしました')
})

/**
 * ホームページセクションの順序を更新（DnD用）
 */
export const updateSectionOrder = withPermission<[UpdateSectionOrderInput], void>(
  'settings',
  'update'
)(async (_user, input) => {
  const parsed = updateSectionOrderSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
  }

  await prisma.$transaction(
    parsed.data.sections.map((item) =>
      prisma.section.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  )

  revalidateHomepage()
  return createSuccess('順序を更新しました')
})

// =============================================================================
// Delete Actions
// =============================================================================

/**
 * ホームページセクションを削除
 */
export const deleteHomepageSection = withPermission<[string], void>(
  'settings',
  'update'
)(async (_user, id) => {
  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || existing.pageId !== null) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.section.delete({
    where: { id },
  })

  revalidateHomepage()
  return createSuccess('セクションを削除しました')
})

// =============================================================================
// Initialization
// =============================================================================

/**
 * デフォルトホームページセクションを初期化
 */
export const initializeDefaultSections = withPermission<[], void>(
  'settings',
  'update'
)(async () => {
  const existingCount = await prisma.section.count({
    where: { pageId: null },
  })
  if (existingCount > 0) {
    return createSuccess('既にセクションが存在します')
  }

  await prisma.$transaction(
    defaultHomepageSectionOrder.map((type, index) =>
      prisma.section.create({
        data: {
          pageId: null,
          type,
          config: defaultSectionConfigs[type],
          design: {},
          order: index,
          isActive: true,
        },
      })
    )
  )

  revalidateHomepage()
  return createSuccess('デフォルトセクションを作成しました')
})
