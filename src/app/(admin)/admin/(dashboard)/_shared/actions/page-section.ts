'use server'

/**
 * ページセクション Server Actions
 *
 * 統一 Section モデル（pageId 指定でページセクション判別）
 */

import type { Prisma } from '@/shared/generated/prisma/client'
import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import {
  SectionType,
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  validateSectionConfig,
  defaultSectionConfigs,
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

export type PageSectionData = {
  id: string
  pageId: string
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

export type PageWithSections = {
  id: string
  slug: string
  title: string
  sections: PageSectionData[]
}

/**
 * ページ編集画面用の統合型
 * PageData + sections を1クエリで取得した結果
 */
export type PageForEdit = {
  id: string
  slug: string
  title: string
  isPublished: boolean
  isSystem: boolean
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
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
  updateTag(CACHE_TAGS.SECTIONS)
  updateTag(CACHE_TAGS.PAGE_SECTIONS)
  updateTag(CACHE_TAGS.PAGES)
  if (pageId) {
    updateTag(getCacheTag.pages.detail(pageId))
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

  const sections = await prisma.section.findMany({
    where: { pageId },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    pageId: section.pageId!,
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
      pageId: section.pageId!,
      config: parseSectionConfig(section.type, section.config),
    })),
  }
}

/**
 * ページ編集画面用: ページ + セクションを1クエリで取得
 *
 * getPageWithSections + getPageBySlug の統合版。
 * 編集画面で2回クエリを発行する冗長性を解消。
 */
export async function getPageForEdit(slug: string): Promise<PageForEdit | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      isPublished: true,
      isSystemPage: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
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
    isPublished: page.isPublished,
    isSystem: page.isSystemPage,
    metaDescription: page.metaDescription,
    metaKeywords: page.metaKeywords,
    ogpTitle: page.ogpTitle,
    ogpDescription: page.ogpDescription,
    ogpImageUrl: page.ogpImageUrl,
    sections: page.sections.map((section) => ({
      ...section,
      pageId: section.pageId!,
      config: parseSectionConfig(section.type, section.config),
    })),
  }
}

/**
 * 公開用: ページのアクティブなセクションを取得
 */
export async function getPublicPageSections(pageId: string): Promise<PageSectionData[]> {
  const sections = await prisma.section.findMany({
    where: {
      pageId,
      isActive: true,
    },
    orderBy: { order: 'asc' },
  })

  return sections.map((section) => ({
    ...section,
    pageId: section.pageId!,
    config: parseSectionConfig(section.type, section.config),
  }))
}

/**
 * 単一セクションを取得
 */
export async function getPageSection(id: string): Promise<PageSectionData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return null

  const section = await prisma.section.findUnique({
    where: { id },
  })

  if (!section || !section.pageId) return null

  return {
    ...section,
    pageId: section.pageId,
    config: parseSectionConfig(section.type, section.config),
  }
}

// =============================================================================
// Create Actions
// =============================================================================

/**
 * セクションを作成
 */
export const createPageSection = withPermission<[CreateSectionInput], { id: string }>(
  'page',
  'update'
)(async (_user, input) => {
  const parsed = createSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
  }

  const { pageId, type, title, config, design, content, order, isActive } = parsed.data

  if (!pageId) {
    return createFailure('ページIDは必須です')
  }

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
    return createFailure(`設定エラー: ${configValidation.error.issues[0]?.message ?? 'バリデーションエラー'}`)
  }

  // 次のorder値を取得
  const maxOrder = await prisma.section.aggregate({
    where: { pageId },
    _max: { order: true },
  })
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1

  const section = await prisma.section.create({
    data: {
      pageId,
      type,
      title,
      config: configValidation.data,
      design: (design ?? {}) as Prisma.InputJsonObject,
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
export const updatePageSection = withPermission<[string, UpdateSectionInput], void>(
  'page',
  'update'
)(async (_user, id, input) => {
  const parsed = updateSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
  }

  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || !existing.pageId) {
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
  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || !existing.pageId) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.section.update({
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
    return createFailure(parsed.error.issues[0]?.message ?? 'バリデーションエラー')
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
      prisma.section.update({
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
  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || !existing.pageId) {
    return createFailure('セクションが見つかりません')
  }

  await prisma.section.delete({
    where: { id },
  })

  revalidatePages(existing.pageId)
  return createSuccess('セクションを削除しました')
})

// =============================================================================
// Duplicate Actions
// =============================================================================

/**
 * セクションを複製
 */
export const duplicatePageSection = withPermission<[string], PageSectionData>(
  'page',
  'update'
)(async (_user, id) => {
  const existing = await prisma.section.findUnique({
    where: { id },
  })

  if (!existing || !existing.pageId) {
    return createFailure('セクションが見つかりません')
  }

  // 末尾の order を取得
  const maxOrderSection = await prisma.section.findFirst({
    where: { pageId: existing.pageId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  const newOrder = (maxOrderSection?.order ?? 0) + 1

  const duplicated = await prisma.section.create({
    data: {
      pageId: existing.pageId,
      type: existing.type,
      title: existing.title ? `コピー - ${existing.title}` : null,
      config: existing.config ?? undefined,
      design: existing.design ?? undefined,
      content: existing.content,
      order: newOrder,
      isActive: existing.isActive,
    },
  })

  revalidatePages(existing.pageId)

  return createSuccess<PageSectionData>('セクションを複製しました', {
    id: duplicated.id,
    pageId: duplicated.pageId ?? '',
    type: existing.type,
    title: duplicated.title,
    config: parseSectionConfig(existing.type, duplicated.config),
    design: duplicated.design,
    content: duplicated.content,
    order: duplicated.order,
    isActive: duplicated.isActive,
    createdAt: duplicated.createdAt,
    updatedAt: duplicated.updatedAt,
  })
})
