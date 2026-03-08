'use server'

import { updateTag } from 'next/cache'
import { executeAdminMutation } from '@/admin/lib/admin-action'
import { createFailure, createSuccess } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { fireAndForget } from '@/shared/lib/async-utils'
import { purgePageCache } from '@/shared/lib/cloudflare'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { verifyAdminSession } from '@/shared/lib/auth'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from '@/shared/lib/slug-validation'
import {
  createPageCommand,
  createPageIfNotExistsCommand,
  deletePageCommand,
  deletePagePermanentlyCommand,
  ensureSystemPageCommand,
  restorePageCommand,
  togglePagePublishedCommand,
  updatePageCommand,
  updatePageSeoCommand,
  bulkDeletePagesCommand,
  bulkTogglePagePublishedCommand,
} from '@/shared/domain/pages/commands'
import {
  getDeletedPagesListQuery,
  getHomepageLastUpdatedQuery,
  getPageBySlugQuery,
  getPageForPublicQuery,
  getPagesListQuery,
  getSystemPagesListQuery,
  type PageListQueryParams,
} from '@/shared/domain/pages/admin-queries'
import {
  createPageSchema,
  getSystemPageDefinition,
  isSystemPageSlug,
  updatePageSchema,
  updatePageSeoSchema,
  type CreatePageInput,
  type UpdatePageInput,
  type UpdatePageSeoInput,
} from '@/shared/lib/validations/page'
import type { PageData, PageListResult } from '@/shared/domain/pages/types'

export type PagesListParams = PageListQueryParams

function purgePageCaches(...slugs: string[]): void {
  for (const slug of [...new Set(slugs)]) {
    fireAndForget(purgePageCache(slug), {
      operation: 'purgePageCache',
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    })
  }
}

function invalidatePageTags(...slugs: string[]): void {
  updateTag(CACHE_TAGS.PAGES)
  for (const slug of [...new Set(slugs)]) {
    updateTag(getCacheTag.pages.detail(slug))
  }
}

function invalidatePageSeoTags(slug: string): void {
  updateTag(CACHE_TAGS.PAGE_SEO)
  updateTag(getCacheTag.pageSeo.detail(slug))
}

export async function getHomepageLastUpdated(): Promise<Date | null> {
  await verifyAdminSession()
  return getHomepageLastUpdatedQuery()
}

export async function getPagesList(
  params: PagesListParams = {},
): Promise<PageListResult> {
  await verifyAdminSession()
  return getPagesListQuery(params)
}

export async function getPageBySlug(slug: string): Promise<PageData | null> {
  await verifyAdminSession()
  return getPageBySlugQuery(slug)
}

export async function getPageForPublic(slug: string): Promise<PageData | null> {
  return getPageForPublicQuery(slug)
}

export async function createPageIfNotExists(
  slug: string,
  title: string,
): Promise<PageData | null> {
  try {
    await verifyAdminSession()
    return await createPageIfNotExistsCommand(slug, title)
  } catch {
    return null
  }
}

export async function ensureSystemPage(slug: string): Promise<PageData | null> {
  try {
    await verifyAdminSession()
    const result = await ensureSystemPageCommand(slug)
    if (!result) {
      return null
    }

    if (result.created) {
      updateTag(CACHE_TAGS.PAGES)
      updateTag(getCacheTag.pages.detail(slug))
    }

    return result.page
  } catch {
    return null
  }
}

export async function checkPageSlugAvailability(
  slug: string,
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

export async function getDeletedPagesList(): Promise<PageData[]> {
  await verifyAdminSession()
  return getDeletedPagesListQuery()
}

export async function getSystemPagesList(): Promise<PageData[]> {
  await verifyAdminSession()
  return getSystemPagesListQuery()
}

export async function updatePage(slug: string, input: UpdatePageInput) {
  const parsed = updatePageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: slug,
    execute: async () => {
      await updatePageCommand(slug, parsed.data)
    },
    success: () => createSuccess('ページを更新しました'),
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function createPage(input: CreatePageInput) {
  const parsed = createPageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  let createdSlug = ''

  return executeAdminMutation({
    resource: 'page',
    action: 'create',
    execute: async () => {
      const result = await createPageCommand(parsed.data)
      createdSlug = result.slug
      return result
    },
    success: (result) => createSuccess('ページを作成しました', result),
    afterSuccess: () => {
      invalidatePageTags(createdSlug)
      purgePageCaches(createdSlug)
    },
    resolveAuditResourceId: (result) => result.slug,
  })
}

export async function deletePage(slug: string) {
  if (isSystemPageSlug(slug)) {
    return createFailure('システムページは削除できません')
  }

  return executeAdminMutation({
    resource: 'page',
    action: 'delete',
    resourceId: slug,
    execute: async () => {
      await deletePageCommand(slug)
    },
    success: () => createSuccess('ページを削除しました'),
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function deletePagePermanently(slug: string) {
  if (isSystemPageSlug(slug)) {
    return createFailure('システムページは削除できません')
  }

  return executeAdminMutation({
    resource: 'page',
    action: 'delete',
    resourceId: slug,
    execute: async () => {
      await deletePagePermanentlyCommand(slug)
    },
    success: () => createSuccess('ページを完全に削除しました'),
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function restorePage(slug: string) {
  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: slug,
    execute: async () => {
      await restorePageCommand(slug)
    },
    success: () => createSuccess('ページを復元しました'),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.PAGES)
      purgePageCaches(slug)
    },
  })
}

export async function togglePagePublished(slug: string) {
  let isPublished = false

  return executeAdminMutation({
    resource: 'page',
    action: 'publish',
    resourceId: slug,
    execute: async () => {
      const result = await togglePagePublishedCommand(slug)
      isPublished = result.isPublished
    },
    success: () =>
      createSuccess(
        isPublished ? 'ページを公開しました' : 'ページを非公開にしました',
      ),
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function bulkTogglePagePublished(
  slugs: string[],
  publish: boolean,
) {
  return executeAdminMutation<void>({
    resource: 'page',
    action: 'publish',
    execute: async () => {
      await bulkTogglePagePublishedCommand(slugs, publish)
    },
    success: () =>
      createSuccess(
        publish
          ? `${slugs.length}件のページを公開しました`
          : `${slugs.length}件のページを非公開にしました`,
      ),
    afterSuccess: () => {
      invalidatePageTags(...slugs)
      purgePageCaches(...slugs)
    },
  })
}

export async function bulkDeletePages(slugs: string[]) {
  let deletedSlugs: string[] = []

  return executeAdminMutation<void>({
    resource: 'page',
    action: 'delete',
    execute: async () => {
      const result = await bulkDeletePagesCommand(slugs)
      deletedSlugs = result.deletedSlugs
    },
    success: () =>
      createSuccess(`${deletedSlugs.length}件のページを削除しました`),
    afterSuccess: () => {
      invalidatePageTags(...deletedSlugs)
      purgePageCaches(...deletedSlugs)
    },
  })
}

export async function updatePageSeo(slug: string, input: UpdatePageSeoInput) {
  const parsed = updatePageSeoSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: slug,
    execute: async () => {
      const definition = getSystemPageDefinition(slug)
      await updatePageSeoCommand(slug, {
        ...parsed.data,
        title: parsed.data.title || definition?.title || slug,
      })
    },
    success: () => createSuccess('SEO設定を更新しました'),
    afterSuccess: () => {
      invalidatePageTags(slug)
      invalidatePageSeoTags(slug)
      purgePageCaches(slug)
    },
  })
}
