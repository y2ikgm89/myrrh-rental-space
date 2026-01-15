'use server'

/**
 * ホームページセクション Server Actions
 *
 * HomepageSectionモデルを使用した統一セクション管理
 */

import { prisma } from '@/lib/prisma'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createSuccess, createFailure, withPermission } from '@/types'
import { getSession, getRoleFromSession } from '@/lib/auth'
import { HomepageSectionType } from '@/lib/validations/enums'
import { hasPermission, canAccessAdmin } from '@/lib/permissions'
import { logPermissionDenied } from '@/lib/audit'
import {
  createHomepageSectionSchema,
  updateHomepageSectionSchema,
  updateSectionOrderSchema,
  validateSectionConfig,
  defaultSectionConfigs,
  defaultSectionOrder,
  type CreateHomepageSectionInput,
  type UpdateHomepageSectionInput,
  type UpdateSectionOrderInput,
  type SectionConfig,
} from '@/lib/validations/homepage-section'

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
  revalidatePath('/')
  revalidatePath('/admin/pages')
  revalidatePath('/admin/pages/homepage/edit')
  revalidateTag('homepage', { expire: 0 })
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * 全セクションを取得（管理画面用）
 */
export async function getHomepageSections(): Promise<HomepageSectionData[] | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const sections = await prisma.homepageSection.findMany({
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }))
}

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

/**
 * 単一セクションを取得
 */
export async function getHomepageSection(id: string): Promise<HomepageSectionData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const section = await prisma.homepageSection.findUnique({
    where: { id },
  })

  if (!section) return null

  return {
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }
}

/**
 * タイプでセクションを取得
 */
export async function getHomepageSectionByType(
  type: HomepageSectionType
): Promise<HomepageSectionData | null> {
  const section = await prisma.homepageSection.findFirst({
    where: { type },
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
 * セクションを作成
 */
export const createHomepageSection = withPermission<[CreateHomepageSectionInput], { id: string }>(
  'settings',
  'update'
)(async (_user, input) => {
  const parsed = createHomepageSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const { type, title, config, content, order, isActive } = parsed.data

  // 設定を検証
  const configValidation = validateSectionConfig(type, config)
  if (!configValidation.success) {
    return createFailure(`設定エラー: ${configValidation.error.issues[0].message}`)
  }

  // 次のorder値を取得
  const maxOrder = await prisma.homepageSection.aggregate({
    _max: { order: true },
  })
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1

  const section = await prisma.homepageSection.create({
    data: {
      type,
      title,
      config: configValidation.data,
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
 * セクションを更新
 */
export const updateHomepageSection = withPermission<[string, UpdateHomepageSectionInput], void>(
  'settings',
  'update'
)(async (_user, id, input) => {
  const parsed = updateHomepageSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.homepageSection.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('セクションが見つかりません')
  }

  // 設定を検証（configが更新される場合）
  if (parsed.data.config) {
    const configValidation = validateSectionConfig(existing.type, parsed.data.config)
    if (!configValidation.success) {
      return createFailure(`設定エラー: ${configValidation.error.issues[0].message}`)
    }
    parsed.data.config = configValidation.data
  }

  await prisma.homepageSection.update({
    where: { id },
    data: {
      title: parsed.data.title,
      config: parsed.data.config as object | undefined,
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
  const existing = await prisma.homepageSection.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.homepageSection.update({
    where: { id },
    data: { isActive },
  })

  revalidateHomepage()
  return createSuccess(isActive ? 'セクションを有効にしました' : 'セクションを無効にしました')
})

/**
 * セクションの順序を更新（DnD用）
 */
export const updateSectionOrder = withPermission<[UpdateSectionOrderInput], void>(
  'settings',
  'update'
)(async (_user, input) => {
  const parsed = updateSectionOrderSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.$transaction(
    parsed.data.sections.map((item) =>
      prisma.homepageSection.update({
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
 * セクションを削除
 */
export const deleteHomepageSection = withPermission<[string], void>(
  'settings',
  'update'
)(async (_user, id) => {
  const existing = await prisma.homepageSection.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.homepageSection.delete({
    where: { id },
  })

  revalidateHomepage()
  return createSuccess('セクションを削除しました')
})

// =============================================================================
// Initialization
// =============================================================================

/**
 * デフォルトセクションを初期化
 * マイグレーション後に一度だけ実行
 */
export const initializeDefaultSections = withPermission<[], void>(
  'settings',
  'update'
)(async () => {
  // 既存セクションがある場合はスキップ
  const existingCount = await prisma.homepageSection.count()
  if (existingCount > 0) {
    return createSuccess('既にセクションが存在します')
  }

  // デフォルトセクションを作成
  await prisma.$transaction(
    defaultSectionOrder.map((type, index) =>
      prisma.homepageSection.create({
        data: {
          type,
          config: defaultSectionConfigs[type],
          order: index,
          isActive: true,
        },
      })
    )
  )

  revalidateHomepage()
  return createSuccess('デフォルトセクションを作成しました')
})

