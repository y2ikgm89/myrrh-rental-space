'use server'

/**
 * ブロックテンプレート Server Actions
 *
 * Lexical エディタのブロックテンプレート CRUD を提供する Server Actions。
 * エディタ内で選択したブロックをテンプレートとして保存・再利用できます。
 *
 * @module admin/actions/block-template
 */

import { z } from 'zod'

import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { checkReadPermissionFor } from '@/admin/lib/permissions'

// =============================================================================
// Validation
// =============================================================================

const createBlockTemplateSchema = z.object({
  name: z.string().min(1, { error: 'テンプレート名は必須です' }).max(100, { error: '100文字以内で入力してください' }),
  description: z.string().max(500, { error: '500文字以内で入力してください' }).optional(),
  nodeJson: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
})

// =============================================================================
// Types
// =============================================================================

export type BlockTemplateListItem = {
  id: string
  name: string
  description: string | null
  createdAt: Date
  creatorName: string | null
}

type CreateBlockTemplateInput = z.infer<typeof createBlockTemplateSchema>

// =============================================================================
// Read Actions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('blockTemplate')

export async function getBlockTemplates(): Promise<BlockTemplateListItem[]> {
  const permError = await checkReadPermission()
  if (permError) return []

  try {
    const templates = await prisma.blockTemplate.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        creator: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt,
      creatorName: t.creator?.name ?? null,
    }))
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
  const denied = await checkReadPermission()
  if (denied) return createFailure('権限がありません')

  try {
    const template = await prisma.blockTemplate.findUnique({
      where: { id },
      select: { nodeJson: true },
    })

    if (!template) {
      return createFailure('テンプレートが見つかりません')
    }

    return createSuccess('取得しました', { nodeJson: template.nodeJson })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getBlockTemplateById' },
    })
    return createFailure('テンプレートの取得に失敗しました')
  }
}

// =============================================================================
// Write Actions (withPermission - 監査ログ自動記録)
// =============================================================================

export const createBlockTemplate = withPermission<
  [input: CreateBlockTemplateInput],
  { id: string }
>('blockTemplate', 'create')(async (user, input): Promise<ActionResult<{ id: string }>> => {
  const validated = createBlockTemplateSchema.safeParse(input)
  if (!validated.success) {
    return createFailure(z.flattenError(validated.error).formErrors[0] ?? 'バリデーションエラー')
  }

  try {
    const template = await prisma.blockTemplate.create({
      data: {
        name: validated.data.name,
        description: validated.data.description ?? null,
        nodeJson: JSON.parse(JSON.stringify(validated.data.nodeJson)),
        createdBy: user.id,
      },
      select: { id: true },
    })

    updateTag(CACHE_TAGS.BLOCK_TEMPLATES)
    return createSuccess('テンプレートを保存しました', { id: template.id })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createBlockTemplate' },
    })
    return createFailure('テンプレートの保存に失敗しました')
  }
})

export const deleteBlockTemplate = withPermission<[id: string], void>(
  'blockTemplate',
  'delete'
)(async (_user, id): Promise<ActionResult> => {
  try {
    await prisma.blockTemplate.delete({ where: { id } })

    updateTag(CACHE_TAGS.BLOCK_TEMPLATES)
    return createSuccess('テンプレートを削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteBlockTemplate' },
    })
    return createFailure('テンプレートの削除に失敗しました')
  }
})
