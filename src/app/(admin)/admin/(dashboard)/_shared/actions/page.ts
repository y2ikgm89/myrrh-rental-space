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
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { purgePageCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { checkSlugAvailability, getSlugErrorMessage } from '@/shared/lib/slug-validation'
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
import type { ActionResult } from '@/shared/types/server-actions'

/**
 * 各専用管理ページで管理するページのスラッグ
 * これらはページ管理一覧には表示しない
 * - home: ホームページ専用編集ページで管理（/admin/pages/homepage/edit）
 * - posts/news: 各専用管理ページでSEO設定を管理
 * - terms: Termsテーブルで管理（/admin/terms）
 */
const PAGES_MANAGED_ELSEWHERE = ['home', 'posts', 'news', 'terms']

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

  // where条件を組み立て
  const where: Prisma.PageWhereInput = {
    isActive: true,
    slug: { notIn: [...PAGES_MANAGED_ELSEWHERE] },
  }

  // テキスト検索
  if (query) {
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { slug: { contains: query, mode: 'insensitive' } },
    ]
  }

  // ステータスフィルター
  if (status === 'published') {
    where.isPublished = true
  } else if (status === 'draft') {
    where.isPublished = false
  }

  // 種別フィルター
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

  return { pages, total, page, perPage }
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

  return page
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

  return page
}

/**
 * ページ更新
 */
export async function updatePage(
  slug: string,
  input: UpdatePageInput
): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // バリデーション
  const parsed = updatePageSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const error of parsed.error.issues) {
      const field = error.path.join('.')
      if (!fieldErrors[field]) {
        fieldErrors[field] = []
      }
      fieldErrors[field].push(error.message)
    }
    return {
      success: false,
      error: 'バリデーションエラー',
      fieldErrors,
    }
  }

  try {
    // ページが存在するか確認
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // 更新
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

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return { success: true, message: 'ページを更新しました' }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updatePage', slug },
    })
    return { success: false, error: 'ページの更新中にエラーが発生しました' }
  }
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
      return existingPage
    }

    const page = await prisma.page.create({
      data: {
        slug,
        title,
        isPublished: true,
        isActive: true,
      },
    })

    return page
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
 *
 * システムページ（about, faq, contact等）が存在しない場合、
 * SYSTEM_PAGES定義を元に自動作成します。
 * セクションシステムで編集可能な状態で作成されます。
 */
export async function ensureSystemPage(slug: string): Promise<PageData | null> {
  try {
    await verifyAdminSession()
  } catch {
    return null
  }

  // システムページ定義を取得
  const definition = getSystemPageDefinition(slug)
  if (!definition) {
    return null
  }

  try {
    // 既存ページを確認、なければ作成
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

    // デフォルトセクションを作成（冪等: 既存セクションがあれば何もしない）
    const { ensurePageSections } = await import('@/shared/lib/section-defaults')
    await ensurePageSections(page.id, definition.slug)

    if (!existingPage) {
      updateTag(CACHE_TAGS.PAGES)
    }

    return page
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
 * 新規ページ作成
 */
export async function createPage(
  input: CreatePageInput
): Promise<ActionResult<{ slug: string }>> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // バリデーション
  const parsed = createPageSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const error of parsed.error.issues) {
      const field = error.path.join('.')
      if (!fieldErrors[field]) {
        fieldErrors[field] = []
      }
      fieldErrors[field].push(error.message)
    }
    return {
      success: false,
      error: 'バリデーションエラー',
      fieldErrors,
    }
  }

  try {
    // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断）
    const slugCheck = await checkSlugAvailability(parsed.data.slug, {
      currentType: 'page',
    })
    if (!slugCheck.available) {
      const errorMessage = getSlugErrorMessage(slugCheck.reason)
      return {
        success: false,
        error: errorMessage,
        fieldErrors: { slug: [errorMessage] },
      }
    }

    // ページ作成
    const page = await prisma.page.create({
      data: {
        slug: parsed.data.slug,
        title: parsed.data.title,
        description: parsed.data.description || null,
        isPublished: parsed.data.isPublished,
        isActive: true,
      },
    })

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(page.slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return {
      success: true,
      message: 'ページを作成しました',
      data: { slug: page.slug },
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createPage', slug: input.slug },
    })
    return { success: false, error: 'ページの作成中にエラーが発生しました' }
  }
}

/**
 * ページ削除（論理削除）
 */
export async function deletePage(slug: string): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // システムページは削除不可
  if (isSystemPageSlug(slug)) {
    return { success: false, error: 'システムページは削除できません' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // 論理削除（isActive = false）
    await prisma.page.update({
      where: { slug },
      data: {
        isActive: false,
        isPublished: false,
      },
    })

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return { success: true, message: 'ページを削除しました' }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deletePage', slug },
    })
    return { success: false, error: 'ページの削除中にエラーが発生しました' }
  }
}

/**
 * ページ完全削除（物理削除）- 管理者のみ
 */
export async function deletePagePermanently(
  slug: string
): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // システムページは削除不可
  if (isSystemPageSlug(slug)) {
    return { success: false, error: 'システムページは削除できません' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // 物理削除
    await prisma.page.delete({
      where: { slug },
    })

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return { success: true, message: 'ページを完全に削除しました' }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deletePagePermanently', slug },
    })
    return { success: false, error: 'ページの削除中にエラーが発生しました' }
  }
}

/**
 * ページ復元（論理削除からの復元）
 */
export async function restorePage(slug: string): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    if (existingPage.isActive) {
      return { success: false, error: 'このページは既にアクティブです' }
    }

    // 復元
    await prisma.page.update({
      where: { slug },
      data: {
        isActive: true,
      },
    })

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return { success: true, message: 'ページを復元しました' }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'restorePage', slug },
    })
    return { success: false, error: 'ページの復元中にエラーが発生しました' }
  }
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

  return pages
}

/**
 * ページ公開状態の切り替え
 */
export async function togglePagePublished(
  slug: string
): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true, isPublished: true },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    const newPublishedState = !existingPage.isPublished

    await prisma.page.update({
      where: { slug },
      data: {
        isPublished: newPublishedState,
        publishedAt: newPublishedState ? new Date() : null,
      },
    })

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return {
      success: true,
      message: newPublishedState ? 'ページを公開しました' : 'ページを非公開にしました',
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'togglePagePublished', slug },
    })
    return { success: false, error: 'ページの更新中にエラーが発生しました' }
  }
}

/**
 * ページ一括公開/非公開切り替え
 */
export async function bulkTogglePagePublished(
  slugs: string[],
  publish: boolean
): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  if (slugs.length === 0) {
    return { success: false, error: '対象ページが選択されていません' }
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

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)
    for (const slug of slugs) {
      updateTag(getCacheTag.pages.detail(slug))
    }

    return {
      success: true,
      message: publish
        ? `${slugs.length}件のページを公開しました`
        : `${slugs.length}件のページを非公開にしました`,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'bulkTogglePagePublished', slugs },
    })
    return { success: false, error: '一括操作中にエラーが発生しました' }
  }
}

/**
 * ページ一括削除（論理削除）
 */
export async function bulkDeletePages(
  slugs: string[]
): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  if (slugs.length === 0) {
    return { success: false, error: '対象ページが選択されていません' }
  }

  // システムページは除外
  const deletableSlugs = slugs.filter((slug) => !isSystemPageSlug(slug))
  if (deletableSlugs.length === 0) {
    return { success: false, error: 'システムページは削除できません' }
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

    return {
      success: true,
      message: `${deletableSlugs.length}件のページを削除しました`,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'bulkDeletePages', slugs },
    })
    return { success: false, error: '一括削除中にエラーが発生しました' }
  }
}

/**
 * システムページのSEO/OGP情報を更新
 */
export async function updatePageSeo(
  slug: string,
  input: UpdatePageSeoInput
): Promise<ActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // バリデーション
  const parsed = updatePageSeoSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const error of parsed.error.issues) {
      const field = error.path.join('.')
      if (!fieldErrors[field]) {
        fieldErrors[field] = []
      }
      fieldErrors[field].push(error.message)
    }
    return {
      success: false,
      error: 'バリデーションエラー',
      fieldErrors,
    }
  }

  try {
    // ページが存在するか確認
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // SEO/OGP情報のみ更新
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

    // キャッシュ無効化
    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    updateTag(CACHE_TAGS.PAGE_SEO)
    updateTag(getCacheTag.pageSeo.detail(slug))

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return { success: true, message: 'SEO設定を更新しました' }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updatePageSeo', slug },
    })
    return { success: false, error: 'SEO設定の更新中にエラーが発生しました' }
  }
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

  return pages
}

