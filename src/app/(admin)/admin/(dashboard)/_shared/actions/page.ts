'use server'

import { updateTag } from 'next/cache'
import { executeAdminMutationResult } from '@/admin/lib/admin-action'
import { createValidationMutationError } from '@/shared/lib/action-helpers'
import { fireAndForget } from '@/shared/lib/async-utils'
import { purgePageCache } from '@/shared/lib/cloudflare'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import type { MutationResult } from '@/shared/lib/mutation-result'
import {
  createPageCommand,
  deletePageCommand,
  deletePagePermanentlyCommand,
  restorePageCommand,
  togglePagePublishedCommand,
  updatePageCommand,
  updatePageSeoCommand,
  bulkDeletePagesCommand,
  bulkTogglePagePublishedCommand,
} from '@/shared/domain/pages/commands'
import {
  createPageSchema,
  getSystemPageDefinition,
  updatePageSchema,
  updatePageSeoSchema,
  type CreatePageInput,
  type UpdatePageInput,
  type UpdatePageSeoInput,
} from '@/shared/lib/validations/page'

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

export async function updatePage(
  slug: string,
  input: UpdatePageInput,
): Promise<MutationResult> {
  const parsed = updatePageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationMutationError(parsed.error)
  }

  return executeAdminMutationResult({
    resource: 'page',
    action: 'update',
    resourceId: slug,
    execute: async () => {
      await updatePageCommand(slug, parsed.data)
      return null
    },
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function createPage(
  input: CreatePageInput,
): Promise<MutationResult<{ slug: string }>> {
  const parsed = createPageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationMutationError(parsed.error)
  }

  let createdSlug = ''

  return executeAdminMutationResult({
    resource: 'page',
    action: 'create',
    execute: async () => {
      const result = await createPageCommand(parsed.data)
      createdSlug = result.slug
      return result
    },
    afterSuccess: () => {
      invalidatePageTags(createdSlug)
      purgePageCaches(createdSlug)
    },
    resolveAuditResourceId: (result) => result.slug,
  })
}

export async function deletePage(slug: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: 'page',
    action: 'delete',
    resourceId: slug,
    execute: async () => {
      await deletePageCommand(slug)
      return null
    },
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function deletePagePermanently(
  slug: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: 'page',
    action: 'delete',
    resourceId: slug,
    execute: async () => {
      await deletePagePermanentlyCommand(slug)
      return null
    },
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function restorePage(slug: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: 'page',
    action: 'update',
    resourceId: slug,
    execute: async () => {
      await restorePageCommand(slug)
      return null
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.PAGES)
      purgePageCaches(slug)
    },
  })
}

export async function togglePagePublished(
  slug: string,
): Promise<MutationResult<{ isPublished: boolean }>> {
  return executeAdminMutationResult({
    resource: 'page',
    action: 'publish',
    resourceId: slug,
    execute: async () => togglePagePublishedCommand(slug),
    afterSuccess: () => {
      invalidatePageTags(slug)
      purgePageCaches(slug)
    },
  })
}

export async function bulkTogglePagePublished(
  slugs: string[],
  publish: boolean,
): Promise<MutationResult<{ count: number; isPublished: boolean }>> {
  return executeAdminMutationResult({
    resource: 'page',
    action: 'publish',
    execute: async () => {
      await bulkTogglePagePublishedCommand(slugs, publish)
      return { count: slugs.length, isPublished: publish }
    },
    afterSuccess: () => {
      invalidatePageTags(...slugs)
      purgePageCaches(...slugs)
    },
  })
}

export async function bulkDeletePages(
  slugs: string[],
): Promise<MutationResult<{ deletedCount: number; deletedSlugs: string[] }>> {
  return executeAdminMutationResult({
    resource: 'page',
    action: 'delete',
    execute: async () => {
      const result = await bulkDeletePagesCommand(slugs)
      return {
        deletedCount: result.deletedSlugs.length,
        deletedSlugs: result.deletedSlugs,
      }
    },
    afterSuccess: (result) => {
      invalidatePageTags(...result.deletedSlugs)
      purgePageCaches(...result.deletedSlugs)
    },
  })
}

export async function updatePageSeo(
  slug: string,
  input: UpdatePageSeoInput,
): Promise<MutationResult> {
  const parsed = updatePageSeoSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationMutationError(parsed.error)
  }

  return executeAdminMutationResult({
    resource: 'page',
    action: 'update',
    resourceId: slug,
    execute: async () => {
      const definition = getSystemPageDefinition(slug)
      await updatePageSeoCommand(slug, {
        ...parsed.data,
        title: parsed.data.title || definition?.title || slug,
      })
      return null
    },
    afterSuccess: () => {
      invalidatePageTags(slug)
      invalidatePageSeoTags(slug)
      purgePageCaches(slug)
    },
  })
}
