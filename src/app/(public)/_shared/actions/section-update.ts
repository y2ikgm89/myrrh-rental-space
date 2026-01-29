'use server'

/**
 * セクション設定更新 Server Actions
 *
 * 公開ページからのホームページセクション設定更新を処理
 * 管理者認証必須
 */

import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { verifyAdminSession } from '@/shared/lib/auth'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { createSuccess, createFailure, type ActionResult } from '@/shared/types/server-actions'
import type { Prisma } from '@/shared/generated/prisma/client'
import { validateSectionConfig } from '@/shared/lib/validations/homepage-section'
import { isValidHomepageSectionType } from '@/shared/lib/validations/enums'

// =============================================================================
// Types
// =============================================================================

type UpdateSectionConfigInput = {
  sectionId: string
  config: Record<string, unknown>
  title?: string
}

// =============================================================================
// Main Action
// =============================================================================

/**
 * セクション設定を更新
 *
 * @param input - 更新入力
 * @returns ActionResult
 */
export async function updateSectionConfig(
  input: UpdateSectionConfigInput
): Promise<ActionResult> {
  // 認証チェック
  try {
    await verifyAdminSession()
  } catch {
    return createFailure('ログインが必要です')
  }

  const { sectionId, config, title } = input

  try {
    // セクション存在確認
    const section = await prisma.homepageSection.findUnique({
      where: { id: sectionId },
      select: { id: true, type: true },
    })

    if (!section) {
      return createFailure('セクションが見つかりません')
    }

    // 型ガードで検証（PrismaのenumをHomepageSectionTypeに変換）
    if (!isValidHomepageSectionType(section.type)) {
      return createFailure('不正なセクションタイプです')
    }
    // バリデーション
    const validated = validateSectionConfig(section.type, config)
    if (!validated.success) {
      // Zod 4ではissuesプロパティを使用
      const errorMessages = validated.error.issues
        .map((issue) => issue.message)
        .join(', ')
      return createFailure(`設定が無効です: ${errorMessages}`)
    }

    // 更新データ構築
    const updateData: Prisma.HomepageSectionUpdateInput = {
      config: validated.data,
    }

    // titleが指定されている場合のみ更新
    if (title !== undefined) {
      updateData.title = title
    }

    // 更新
    await prisma.homepageSection.update({
      where: { id: sectionId },
      data: updateData,
    })

    // キャッシュ即時失効
    updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS)

    return createSuccess('保存しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updateSectionConfig', sectionId },
    })
    return createFailure('セクションの更新中にエラーが発生しました')
  }
}
