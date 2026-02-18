'use server'

/**
 * 割引設定 Server Actions
 *
 * 長時間割引の設定を管理
 * - 有効/無効
 * - 割引ルール（時間閾値と割引率）
 * - 割引併用モード
 * - 表示設定
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { discountSettingsSchema, type DiscountSettingsInput } from './schemas'
import {
  parseDurationDiscountRules,
  type DurationDiscountRule,
} from '@/shared/lib/pricing'
import { getValidDiscountCombinationMode } from '@/shared/lib/validations/enums'
import { DiscountCombinationMode } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export type DiscountSettingsData = {
  durationDiscountEnabled: boolean
  durationDiscountRules: DurationDiscountRule[]
  discountCombinationMode: DiscountCombinationMode
  showOriginalPrice: boolean
  discountWarningEnabled: boolean
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DISCOUNT_SETTINGS: DiscountSettingsData = {
  durationDiscountEnabled: false,
  durationDiscountRules: [],
  discountCombinationMode: DiscountCombinationMode.best,
  showOriginalPrice: true,
  discountWarningEnabled: true,
}

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('settings')

// =============================================================================
// Actions
// =============================================================================

/**
 * 割引設定を取得
 */
export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  if (!(await checkReadPermission())) {
    return DEFAULT_DISCOUNT_SETTINGS
  }

  return getDiscountSettingsFromDb()
}

/**
 * 割引設定を更新
 */
export const updateDiscountSettings = withPermission<[input: DiscountSettingsInput], void>(
  'settings',
  'update'
)(async (_user, input): Promise<ActionResult<void>> => {
  const parsed = discountSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const data = parsed.data

  // ルールのバリデーション
  // 同じ時間閾値が複数ないかチェック
  const hourSet = new Set<number>()
  for (const rule of data.durationDiscountRules) {
    if (hourSet.has(rule.hours)) {
      return createFailure(`${rule.hours}時間の割引ルールが重複しています`)
    }
    hourSet.add(rule.hours)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      durationDiscountEnabled: data.durationDiscountEnabled,
      durationDiscountRules: JSON.stringify(data.durationDiscountRules),
      discountCombinationMode: data.discountCombinationMode,
      showOriginalPrice: data.showOriginalPrice,
      discountWarningEnabled: data.discountWarningEnabled,
    },
    update: {
      durationDiscountEnabled: data.durationDiscountEnabled,
      durationDiscountRules: JSON.stringify(data.durationDiscountRules),
      discountCombinationMode: data.discountCombinationMode,
      showOriginalPrice: data.showOriginalPrice,
      discountWarningEnabled: data.discountWarningEnabled,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('割引設定を更新しました')
})

/**
 * DBから割引設定を取得（内部共通関数）
 */
async function getDiscountSettingsFromDb(): Promise<DiscountSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      durationDiscountEnabled: true,
      durationDiscountRules: true,
      discountCombinationMode: true,
      showOriginalPrice: true,
      discountWarningEnabled: true,
    },
  })

  if (!settings) {
    return DEFAULT_DISCOUNT_SETTINGS
  }

  return {
    durationDiscountEnabled: settings.durationDiscountEnabled,
    durationDiscountRules: parseDurationDiscountRules(settings.durationDiscountRules),
    discountCombinationMode: getValidDiscountCombinationMode(settings.discountCombinationMode),
    showOriginalPrice: settings.showOriginalPrice,
    discountWarningEnabled: settings.discountWarningEnabled,
  }
}
