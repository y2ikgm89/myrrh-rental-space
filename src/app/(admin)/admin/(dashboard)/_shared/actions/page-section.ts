'use server'

/**
 * ページセクション Server Actions
 *
 * PageSectionモデルを使用したSlice-based CMS
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import {
  PageSectionType,
  createPageSectionSchema,
  updatePageSectionSchema,
  updateSectionOrderSchema,
  validateSectionConfig,
  defaultSectionConfigs,
  type CreatePageSectionInput,
  type UpdatePageSectionInput,
  type UpdateSectionOrderInput,
  type PageSectionConfig,
} from '@/shared/lib/validations/page-section'

/**
 * PrismaのJson型をPageSectionConfigに変換（ランタイムバリデーション付き）
 */
function parseSectionConfig(type: PageSectionType, config: unknown): PageSectionConfig {
  const result = validateSectionConfig(type, config)
  if (result.success) {
    return result.data as PageSectionConfig
  }
  // バリデーション失敗時はデフォルト設定にフォールバック
  return defaultSectionConfigs[type] as PageSectionConfig
}

// =============================================================================
// Types
// =============================================================================

export type PageSectionData = {
  id: string
  pageId: string
  type: PageSectionType
  title: string | null
  config: PageSectionConfig
  content: string | null
  order: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type PageWithSections = {
  id: string
  slug: string
  title: string
  sections: PageSectionData[]
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
  if (!hasPermission(role, 'page', 'read')) {
    void logPermissionDenied(session.user.id, 'page', 'read')
    return false
  }
  return true
}

function revalidatePages(pageId?: string) {
  updateTag(CACHE_TAGS.PAGES)
  if (pageId) {
    updateTag(`page:${pageId}`)
  }
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * ページのセクション一覧を取得（管理画面用）
 */
export async function getPageSections(pageId: string): Promise<PageSectionData[] | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const sections = await prisma.pageSection.findMany({
    where: { pageId },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    config: parseSectionConfig(section.type, section.config),
  }))
}

/**
 * ページをセクション付きで取得（管理画面用）
 */
export async function getPageWithSections(slug: string): Promise<PageWithSections | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      sections: {
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!page) return null

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    sections: page.sections.map((section) => ({
      ...section,
      config: parseSectionConfig(section.type, section.config),
    })),
  }
}

/**
 * 公開用: ページのアクティブなセクションを取得
 */
export async function getPublicPageSections(pageId: string): Promise<PageSectionData[]> {
  const sections = await prisma.pageSection.findMany({
    where: {
      pageId,
      isActive: true,
    },
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
export async function getPageSection(id: string): Promise<PageSectionData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const section = await prisma.pageSection.findUnique({
    where: { id },
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
export const createPageSection = withPermission<[CreatePageSectionInput], { id: string }>(
  'page',
  'update'
)(async (_user, input) => {
  const parsed = createPageSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const { pageId, type, title, config, content, order, isActive } = parsed.data

  // ページ存在確認
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true },
  })

  if (!page) {
    return createFailure('ページが見つかりません')
  }

  // 設定を検証
  const configValidation = validateSectionConfig(type, config)
  if (!configValidation.success) {
    return createFailure(`設定エラー: ${configValidation.error.issues[0].message}`)
  }

  // 次のorder値を取得
  const maxOrder = await prisma.pageSection.aggregate({
    where: { pageId },
    _max: { order: true },
  })
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1

  const section = await prisma.pageSection.create({
    data: {
      pageId,
      type,
      title,
      config: configValidation.data,
      content,
      order: nextOrder,
      isActive,
    },
  })

  revalidatePages(pageId)
  return createSuccess('セクションを作成しました', { id: section.id })
})

// =============================================================================
// Update Actions
// =============================================================================

/**
 * セクションを更新
 */
export const updatePageSection = withPermission<[string, UpdatePageSectionInput], void>(
  'page',
  'update'
)(async (_user, id, input) => {
  const parsed = updatePageSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.pageSection.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('セクションが見つかりません')
  }

  // 設定を検証（configが更新される場合）
  let validatedConfig: object | undefined
  if (parsed.data.config) {
    const configValidation = validateSectionConfig(existing.type, parsed.data.config)
    if (!configValidation.success) {
      return createFailure(`設定エラー: ${configValidation.error.issues[0].message}`)
    }
    validatedConfig = configValidation.data
  }

  await prisma.pageSection.update({
    where: { id },
    data: {
      title: parsed.data.title,
      config: validatedConfig,
      content: parsed.data.content,
      isActive: parsed.data.isActive,
    },
  })

  revalidatePages(existing.pageId)
  return createSuccess('セクションを更新しました')
})

/**
 * セクションの有効/無効を切り替え
 */
export const togglePageSection = withPermission<[string, boolean], void>(
  'page',
  'update'
)(async (_user, id, isActive) => {
  const existing = await prisma.pageSection.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.pageSection.update({
    where: { id },
    data: { isActive },
  })

  revalidatePages(existing.pageId)
  return createSuccess(isActive ? 'セクションを有効にしました' : 'セクションを無効にしました')
})

/**
 * セクションの順序を更新（DnD用）
 */
export const updatePageSectionOrder = withPermission<[string, UpdateSectionOrderInput], void>(
  'page',
  'update'
)(async (_user, pageId, input) => {
  const parsed = updateSectionOrderSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // ページ存在確認
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true },
  })

  if (!page) {
    return createFailure('ページが見つかりません')
  }

  await prisma.$transaction(
    parsed.data.sections.map((item) =>
      prisma.pageSection.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  )

  revalidatePages(pageId)
  return createSuccess('順序を更新しました')
})

// =============================================================================
// Delete Actions
// =============================================================================

/**
 * セクションを削除
 */
export const deletePageSection = withPermission<[string], void>(
  'page',
  'update'
)(async (_user, id) => {
  const existing = await prisma.pageSection.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.pageSection.delete({
    where: { id },
  })

  revalidatePages(existing.pageId)
  return createSuccess('セクションを削除しました')
})

