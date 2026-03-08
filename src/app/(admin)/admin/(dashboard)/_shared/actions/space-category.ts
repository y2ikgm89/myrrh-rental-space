'use server'

import { updateTag } from 'next/cache'
import { z } from 'zod'
import { executeAdminMutation } from '@/admin/lib/admin-action'
import {
  createSuccess,
  type ActionResult,
} from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { CACHE_TAGS } from '@/shared/lib/constants'
import {
  createSpaceCategory as createSpaceCategoryCommand,
  deleteSpaceCategory as deleteSpaceCategoryCommand,
  hardDeleteSpaceCategory as hardDeleteSpaceCategoryCommand,
  updateSpaceCategory as updateSpaceCategoryCommand,
  updateSpaceCategoryOrder as updateSpaceCategoryOrderCommand,
} from '@/shared/domain/space-categories/commands'
import { spaceCategoryFormSchema } from '@/admin/lib/validations/space-category'
import type {
  SpaceCategoryFormInput,
} from '@/admin/lib/validations/space-category'

const idSchema = z.string().uuid({ error: 'カテゴリーIDが不正です' })
const categoryOrderSchema = z.array(
  z.object({
    id: z.string().uuid({ error: 'カテゴリーIDが不正です' }),
    sortOrder: z.number().int().min(0, { error: '並び順が不正です' }),
  })
)

export async function createSpaceCategory(
  input: SpaceCategoryFormInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = spaceCategoryFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'spaceCategory',
    action: 'create',
    execute: async () => createSpaceCategoryCommand(parsed.data),
    success: (result) => createSuccess('カテゴリーを作成しました', result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACE_CATEGORIES)
    },
    resolveAuditResourceId: (result) => result.id,
  })
}

export async function updateSpaceCategory(
  id: string,
  input: SpaceCategoryFormInput
): Promise<ActionResult<{ id: string }>> {
  const validatedId = idSchema.safeParse(id)
  if (!validatedId.success) {
    return createValidationError(validatedId.error)
  }

  const parsed = spaceCategoryFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'spaceCategory',
    action: 'update',
    resourceId: validatedId.data,
    execute: async () => updateSpaceCategoryCommand(validatedId.data, parsed.data),
    success: (result) => createSuccess('カテゴリーを更新しました', result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACE_CATEGORIES)
    },
    resolveAuditResourceId: (result) => result.id,
  })
}

export async function updateSpaceCategoryOrder(
  items: { id: string; sortOrder: number }[]
): Promise<ActionResult<{ updated: number }>> {
  const parsed = categoryOrderSchema.safeParse(items)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  return executeAdminMutation({
    resource: 'spaceCategory',
    action: 'update',
    execute: async () => updateSpaceCategoryOrderCommand(parsed.data),
    success: (result) => createSuccess('並び順を更新しました', result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACE_CATEGORIES)
    },
  })
}

export async function deleteSpaceCategory(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const validated = idSchema.safeParse(id)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'spaceCategory',
    action: 'delete',
    resourceId: validated.data,
    execute: async () => deleteSpaceCategoryCommand(validated.data),
    success: (result) => createSuccess('カテゴリーを削除しました', result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACE_CATEGORIES)
    },
    resolveAuditResourceId: (result) => result.id,
  })
}

export async function hardDeleteSpaceCategory(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const validated = idSchema.safeParse(id)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'spaceCategory',
    action: 'delete',
    resourceId: validated.data,
    execute: async () => hardDeleteSpaceCategoryCommand(validated.data),
    success: (result) =>
      createSuccess('カテゴリーを完全に削除しました', result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACE_CATEGORIES)
    },
    resolveAuditResourceId: (result) => result.id,
  })
}
