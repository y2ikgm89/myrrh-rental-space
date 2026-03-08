'use server'

import { updateTag } from 'next/cache'
import { executeAdminMutation } from '@/admin/lib/admin-action'
import { renderEditorStateToHtmlLazy } from '@/admin/lib/lazy-renderer'
import { createSuccess } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import {
  createPageSectionCommand,
  deletePageSectionCommand,
  duplicatePageSectionCommand,
  togglePageSectionCommand,
  updatePageSectionCommand,
  updatePageSectionOrderCommand,
} from '@/shared/domain/sections/commands'
import {
  SectionType,
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  type CreateSectionInput,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
  type SectionConfig,
} from '@/shared/lib/validations/section'

export type PageSectionData = {
  id: string
  pageId: string
  type: SectionType
  title: string | null
  config: SectionConfig
  design: unknown
  contentHtml: string | null
  contentJson: unknown
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

function revalidatePages(pageId?: string) {
  updateTag(CACHE_TAGS.SECTIONS)
  updateTag(CACHE_TAGS.PAGE_SECTIONS)
  updateTag(CACHE_TAGS.PAGES)
  if (pageId) {
    updateTag(getCacheTag.pages.detail(pageId))
  }
}

export async function createPageSection(input: CreateSectionInput) {
  const parsed = createSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : null

  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: parsed.data.pageId,
    execute: async () => createPageSectionCommand(parsed.data, contentHtml),
    success: (result) => createSuccess('セクションを作成しました', result),
    afterSuccess: () => {
      if (parsed.data.pageId) {
        revalidatePages(parsed.data.pageId)
      }
    },
    resolveAuditResourceId: (result) => result.id,
  })
}

export async function updatePageSection(id: string, input: UpdateSectionInput) {
  const parsed = updateSectionSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const contentHtml =
    parsed.data.contentJson === undefined
      ? undefined
      : parsed.data.contentJson
        ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
        : null

  let pageId = ''

  return executeAdminMutation<void>({
    resource: 'page',
    action: 'update',
    resourceId: id,
    execute: async () => {
      const result = await updatePageSectionCommand(id, parsed.data, contentHtml)
      pageId = result.pageId
    },
    success: () => createSuccess('セクションを更新しました'),
    afterSuccess: () => {
      revalidatePages(pageId)
    },
  })
}

export async function togglePageSection(id: string, isActive: boolean) {
  let pageId = ''

  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: id,
    execute: async () => {
      const result = await togglePageSectionCommand(id, isActive)
      pageId = result.pageId
    },
    success: () =>
      createSuccess(
        isActive ? 'セクションを有効にしました' : 'セクションを無効にしました',
      ),
    afterSuccess: () => {
      revalidatePages(pageId)
    },
  })
}

export async function updatePageSectionOrder(
  pageId: string,
  input: UpdateSectionOrderInput,
) {
  const parsed = updateSectionOrderSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: pageId,
    execute: async () => {
      await updatePageSectionOrderCommand(pageId, parsed.data)
    },
    success: () => createSuccess('順序を更新しました'),
    afterSuccess: () => {
      revalidatePages(pageId)
    },
  })
}

export async function deletePageSection(id: string) {
  let pageId = ''

  return executeAdminMutation({
    resource: 'page',
    action: 'update',
    resourceId: id,
    execute: async () => {
      const result = await deletePageSectionCommand(id)
      pageId = result.pageId
    },
    success: () => createSuccess('セクションを削除しました'),
    afterSuccess: () => {
      revalidatePages(pageId)
    },
  })
}

export async function duplicatePageSection(id: string) {
  let duplicatedPageId = ''

  return executeAdminMutation<PageSectionData>({
    resource: 'page',
    action: 'update',
    resourceId: id,
    execute: async () => {
      const result = await duplicatePageSectionCommand(id)
      duplicatedPageId = result.pageId ?? ''
      return result.section
    },
    success: (result) => createSuccess<PageSectionData>('セクションを複製しました', result),
    afterSuccess: () => {
      revalidatePages(duplicatedPageId)
    },
    resolveAuditResourceId: (result) => result.id,
  })
}
