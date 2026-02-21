'use server'

/**
 * ページ管理 Server Actions
 *
 * 管理画面からの公開ページ（固定ページ）の作成・編集・削除を行います。
 * システムページ（利用規約、プライバシーポリシー等）のSEO設定も管理します。
 *
 * ## 主な機能
 * - ページ一覧取得
 * - ページ作成・更新・削除（論理/物理）
 * - ページ復元
 * - 公開状態の切り替え
 * - SEO/OGP設定の更新
 *
 * @module admin/actions/page
 */

import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { verifyAdminSession } from '@/shared/lib/auth'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors/server'
import { purgePageCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { checkSlugAvailability, getSlugErrorMessage } from '@/shared/lib/slug-validation'
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'
import {
  updatePageSchema,
  updatePageSeoSchema,
  createPageSchema,
  isSystemPageSlug,
  getSystemPageDefinition,
  type UpdatePageInput,
  type UpdatePageSeoInput,
  type CreatePageInput,
} from '@/shared/lib/validations/page'
import type { PageModel as PageData } from '@/shared/generated/prisma/models/Page'
import type { Prisma } from '@/shared/generated/prisma/client'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'

/**
 * 各専用管理ページで管理するページのスラッグ
 * これらはページ管理一覧には表示しない
 * - home: ホームページ専用編集ページで管理（/admin/pages/homepage/edit）
 * - posts/news: 各専用管理ページでSEO設定を管理
 * - terms: Termsテーブルで管理（/admin/terms）
 */
const PAGES_MANAGED_ELSEWHERE = ['home', 'posts', 'news', 'terms']

// ==============================================
// Read Operations (verifyAdminSession — plain return types)
// ==============================================

/**
 * ホームページセクションの最新更新日時を取得
 */
export async function getHomepageLastUpdated(): Promise<Date | null> {
  await verifyAdminSession()

  const latest = await prisma.section.findFirst({
    where: { pageId: null },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })

  return latest?.updatedAt ?? null
}

/**
 * ページ一覧取得パラメータ
 */
export type PagesListParams = {
  query?: string
  status?: string
  type?: string
  page?: number
  perPage?: number
  sortBy?: 'updatedAt' | 'title' | 'slug'
  sortOrder?: 'asc' | 'desc'
}

/**
 * ページ一覧取得結果
 */
export type PagesListResult = {
  pages: PageData[]
  total: number
  page: number
  perPage: number
}

/**
 * 管理画面用ページ一覧取得（フィルタ・ページネーション対応）
 * @throws {Error} 認証が必要な場合
 */
export async function getPagesList(params: PagesListParams = {}): Promise<PagesListResult> {
  await verifyAdminSession()

  const {
    query,
    status = 'all',
    type = 'all',
    page = 1,
    perPage = 20,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  } = params

  const where: Prisma.PageWhereInput = {
    isActive: true,
    slug: { notIn: [...PAGES_MANAGED_ELSEWHERE] },
  }

  if (query) {
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { slug: { contains: query, mode: 'insensitive' } },
    ]
  }

  if (status === 'published') {
    where.isPublished = true
  } else if (status === 'draft') {
    where.isPublished = false
  }

  if (type === 'system') {
    where.isSystemPage = true
  } else if (type === 'custom') {
    where.isSystemPage = false
  }

  const [pages, total] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.page.count({ where }),
  ])

  return { pages: toPlainArray(pages), total, page, perPage }
}

/**
 * スラッグでページ取得（管理画面用）
 * @throws {Error} 認証が必要な場合
 */
export async function getPageBySlug(slug: string): Promise<PageData | null> {
  await verifyAdminSession()

  const page = await prisma.page.findUnique({
    where: { slug },
  })

  return toPlainObject(page)
}

/**
 * 公開ページ用ページ取得（isPublishedチェック付き）
 */
export async function getPageForPublic(slug: string): Promise<PageData | null> {
  const page = await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
  })

  return toPlainObject(page)
}

/**
 * ページ作成（存在しない場合）- 内部用
 */
export async function createPageIfNotExists(
  slug: string,
  title: string,
): Promise<PageData | null> {
  try {
    await verifyAdminSession()
  } catch {
    return null
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (existingPage) {
      return toPlainObject(existingPage)
    }

    const page = await prisma.page.create({
      data: {
        slug,
        title,
        isPublished: true,
        isActive: true,
      },
    })

    return toPlainObject(page)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createPageIfNotExists', slug },
    })
    return null
  }
}

/**
 * システムページを自動作成（存在しない場合）
 */
export async function ensureSystemPage(slug: string): Promise<PageData | null> {
  try {
    await verifyAdminSession()
  } catch {
    return null
  }

  const definition = getSystemPageDefinition(slug)
  if (!definition) {
    return null
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    const page = existingPage ?? await prisma.page.create({
      data: {
        slug: definition.slug,
        title: definition.title,
        description: definition.description,
        isPublished: true,
        isActive: true,
        isSystemPage: true,
      },
    })

    const { ensurePageSections } = await import('@/shared/lib/section-defaults')
    await ensurePageSections(page.id, definition.slug)

    if (!existingPage) {
      updateTag(CACHE_TAGS.PAGES)
    }

    return toPlainObject(page)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'ensureSystemPage', slug },
    })
    return null
  }
}

/**
 * スラッグの利用可否をチェック（クライアント用）
 */
export async function checkPageSlugAvailability(
  slug: string
): Promise<{ available: boolean; message?: string }> {
  try {
    await verifyAdminSession()
  } catch {
    return { available: false, message: 'ログインが必要です' }
  }

  if (!slug || slug.length === 0) {
    return { available: false }
  }

  const slugCheck = await checkSlugAvailability(slug, { currentType: 'page' })
  if (!slugCheck.available) {
    return { available: false, message: getSlugErrorMessage(slugCheck.reason) }
  }

  return { available: true }
}

/**
 * 削除済みページ一覧取得
 */
export async function getDeletedPagesList(): Promise<PageData[]> {
  await verifyAdminSession()

  const pages = await prisma.page.findMany({
    where: { isActive: false },
    orderBy: { updatedAt: 'desc' },
  })

  return toPlainArray(pages)
}

/**
 * システムページ一覧取得（SEOのみ編集可能なページ）
 */
export async function getSystemPagesList(): Promise<PageData[]> {
  await verifyAdminSession()

  const pages = await prisma.page.findMany({
    where: {
      isActive: true,
      isSystemPage: true,
    },
    orderBy: { slug: 'asc' },
  })

  return toPlainArray(pages)
}

// ==============================================
// Write Operations (withPermission)
// ==============================================

/**
 * ページ更新
 */
export const updatePage = withPermission<[string, UpdatePageInput], void>(
  'page',
  'update'
)(async (_user, slug, input) => {
  const parsed = updatePageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    await prisma.page.update({
      where: { slug },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        metaDescription: parsed.data.metaDescription || null,
        metaKeywords: parsed.data.metaKeywords || null,
        ogpTitle: parsed.data.ogpTitle || null,
        ogpDescription: parsed.data.ogpDescription || null,
        ogpImageUrl: parsed.data.ogpImageUrl || null,
        isPublished: parsed.data.isPublished,
        publishedAt: parsed.data.publishedAt || null,
        contentWidth: parsed.data.contentWidth ?? null,
        contentWidthCustom: parsed.data.contentWidthCustom ?? null,
        showSidebar: parsed.data.showSidebar ?? null,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('ページを更新しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updatePage', slug },
    })
    return createFailure('ページの更新中にエラーが発生しました')
  }
})

/**
 * 新規ページ作成
 */
export const createPage = withPermission<[CreatePageInput], { slug: string }>(
  'page',
  'create'
)(async (_user, input) => {
  const parsed = createPageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  try {
    const slugCheck = await checkSlugAvailability(parsed.data.slug, {
      currentType: 'page',
    })
    if (!slugCheck.available) {
      const errorMessage = getSlugErrorMessage(slugCheck.reason)
      return createFailure(errorMessage)
    }

    const page = await prisma.page.create({
      data: {
        slug: parsed.data.slug,
        title: parsed.data.title,
        description: parsed.data.description || null,
        isPublished: parsed.data.isPublished,
        isActive: true,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    fireAndForget(purgePageCache(page.slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('ページを作成しました', { slug: page.slug })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createPage', slug: input.slug },
    })
    return createFailure('ページの作成中にエラーが発生しました')
  }
})

/**
 * ページ削除（論理削除）
 */
export const deletePage = withPermission<[string], void>(
  'page',
  'delete'
)(async (_user, slug) => {
  if (isSystemPageSlug(slug)) {
    return createFailure('システムページは削除できません')
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    await prisma.page.update({
      where: { slug },
      data: {
        isActive: false,
        isPublished: false,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('ページを削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deletePage', slug },
    })
    return createFailure('ページの削除中にエラーが発生しました')
  }
})

/**
 * ページ完全削除（物理削除）- 管理者のみ
 */
export const deletePagePermanently = withPermission<[string], void>(
  'page',
  'delete'
)(async (_user, slug) => {
  if (isSystemPageSlug(slug)) {
    return createFailure('システムページは削除できません')
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    await prisma.page.delete({
      where: { slug },
    })

    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('ページを完全に削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deletePagePermanently', slug },
    })
    return createFailure('ページの削除中にエラーが発生しました')
  }
})

/**
 * ページ復元（論理削除からの復元）
 */
export const restorePage = withPermission<[string], void>(
  'page',
  'update'
)(async (_user, slug) => {
  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    if (existingPage.isActive) {
      return createFailure('このページは既にアクティブです')
    }

    await prisma.page.update({
      where: { slug },
      data: {
        isActive: true,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('ページを復元しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'restorePage', slug },
    })
    return createFailure('ページの復元中にエラーが発生しました')
  }
})

/**
 * ページ公開状態の切り替え
 */
export const togglePagePublished = withPermission<[string], void>(
  'page',
  'publish'
)(async (_user, slug) => {
  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true, isPublished: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    const newPublishedState = !existingPage.isPublished

    await prisma.page.update({
      where: { slug },
      data: {
        isPublished: newPublishedState,
        publishedAt: newPublishedState ? new Date() : null,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess(newPublishedState ? 'ページを公開しました' : 'ページを非公開にしました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'togglePagePublished', slug },
    })
    return createFailure('ページの更新中にエラーが発生しました')
  }
})

/**
 * ページ一括公開/非公開切り替え
 */
export const bulkTogglePagePublished = withPermission<[string[], boolean], void>(
  'page',
  'publish'
)(async (_user, slugs, publish) => {
  if (slugs.length === 0) {
    return createFailure('対象ページが選択されていません')
  }

  try {
    await prisma.page.updateMany({
      where: {
        slug: { in: slugs },
        isActive: true,
      },
      data: {
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    for (const slug of slugs) {
      updateTag(getCacheTag.pages.detail(slug))
    }

    return createSuccess(
      publish
        ? `${slugs.length}件のページを公開しました`
        : `${slugs.length}件のページを非公開にしました`
    )
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'bulkTogglePagePublished', slugs },
    })
    return createFailure('一括操作中にエラーが発生しました')
  }
})

/**
 * ページ一括削除（論理削除）
 */
export const bulkDeletePages = withPermission<[string[]], void>(
  'page',
  'delete'
)(async (_user, slugs) => {
  if (slugs.length === 0) {
    return createFailure('対象ページが選択されていません')
  }

  const deletableSlugs = slugs.filter((slug) => !isSystemPageSlug(slug))
  if (deletableSlugs.length === 0) {
    return createFailure('システムページは削除できません')
  }

  try {
    await prisma.page.updateMany({
      where: {
        slug: { in: deletableSlugs },
        isActive: true,
      },
      data: {
        isActive: false,
        isPublished: false,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    for (const slug of deletableSlugs) {
      updateTag(getCacheTag.pages.detail(slug))
    }

    return createSuccess(`${deletableSlugs.length}件のページを削除しました`)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'bulkDeletePages', slugs },
    })
    return createFailure('一括削除中にエラーが発生しました')
  }
})

/**
 * システムページのSEO/OGP情報を更新
 */
export const updatePageSeo = withPermission<[string, UpdatePageSeoInput], void>(
  'page',
  'update'
)(async (_user, slug, input) => {
  const parsed = updatePageSeoSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    await prisma.page.update({
      where: { slug },
      data: {
        title: parsed.data.title,
        metaDescription: parsed.data.metaDescription || null,
        metaKeywords: parsed.data.metaKeywords || null,
        ogpTitle: parsed.data.ogpTitle || null,
        ogpDescription: parsed.data.ogpDescription || null,
        ogpImageUrl: parsed.data.ogpImageUrl || null,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    updateTag(CACHE_TAGS.PAGE_SEO)
    updateTag(getCacheTag.pageSeo.detail(slug))
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('SEO設定を更新しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updatePageSeo', slug },
    })
    return createFailure('SEO設定の更新中にエラーが発生しました')
  }
})
