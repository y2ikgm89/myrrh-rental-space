'use server'

import { z } from 'zod'
import { updateTag } from 'next/cache'
import { executeAdminMutation } from '@/admin/lib/admin-action'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { createValidationError } from '@/shared/lib/action-helpers'
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from '@/admin/types/server-actions'
import {
  createBlockTemplate as createBlockTemplateCommand,
  deleteBlockTemplate as deleteBlockTemplateCommand,
} from '@/shared/domain/block-template/commands'
import {
  getBlockTemplateNodeJsonById as getBlockTemplateNodeJsonByIdQuery,
  getBlockTemplates as getBlockTemplatesQuery,
} from '@/shared/domain/block-template/queries'
import { CACHE_TAGS } from '@/shared/lib/constants'
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from '@/shared/lib/errors/server'

const createBlockTemplateSchema = z.object({
  name: z
    .string()
    .min(1, { error: 'テンプレート名は必須です' })
    .max(100, { error: '100文字以内で入力してください' }),
  description: z.string().max(500, { error: '500文字以内で入力してください' }).optional(),
  nodeJson: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
})

const idSchema = z.string().uuid({ error: 'テンプレートIDが不正です' })
type CreateBlockTemplateInput = z.infer<typeof createBlockTemplateSchema>

const checkReadPermission = checkReadPermissionFor('blockTemplate')

export async function getBlockTemplates() {
  const allowed = await checkReadPermission()
  if (!allowed) {
    return []
  }

  try {
    return await getBlockTemplatesQuery()
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getBlockTemplates' },
    })
    return []
  }
}

export async function getBlockTemplateById(
  id: string
): Promise<ActionResult<{ nodeJson: unknown }>> {
  const allowed = await checkReadPermission()
  if (!allowed) {
    return createFailure('権限がありません')
  }

  const validated = idSchema.safeParse(id)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  try {
    const template = await getBlockTemplateNodeJsonByIdQuery(validated.data)

    if (!template) {
      return createFailure('テンプレートが見つかりません')
    }

    return createSuccess('取得しました', template)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getBlockTemplateById' },
    })
    return createFailure('テンプレートの取得に失敗しました')
  }
}

export async function createBlockTemplate(
  input: CreateBlockTemplateInput
): Promise<ActionResult<{ id: string }>> {
  const validated = createBlockTemplateSchema.safeParse(input)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'blockTemplate',
    action: 'create',
    execute: async (user) => createBlockTemplateCommand(validated.data, user.id),
    success: (result) => createSuccess('テンプレートを保存しました', result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BLOCK_TEMPLATES)
    },
    resolveAuditResourceId: (result) => result.id,
  })
}

export async function deleteBlockTemplate(
  id: string
): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'blockTemplate',
    action: 'delete',
    resourceId: validated.data,
    execute: async () => {
      await deleteBlockTemplateCommand(validated.data)
    },
    success: () => createSuccess('テンプレートを削除しました'),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BLOCK_TEMPLATES)
    },
  })
}
