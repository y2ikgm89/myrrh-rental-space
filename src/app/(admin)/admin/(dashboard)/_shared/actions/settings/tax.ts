'use server'

/**
 * 消費税設定 Server Actions
 *
 * 消費税関連の設定を管理
 * - 標準税率・軽減税率
 * - 価格表示モード（管理画面・公開ページ）
 * - 価格入力モード
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { taxSettingsSchema, type TaxSettingsInput } from './schemas'
import {
  type TaxSettings,
  DEFAULT_TAX_SETTINGS,
} from '@/shared/lib/pricing'
import { TaxDisplayMode, TaxInputMode } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export type TaxSettingsData = TaxSettings

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('settings')

function parseTaxDisplayMode(value: string | null): TaxDisplayMode {
  if (value === TaxDisplayMode.tax_excluded || value === TaxDisplayMode.tax_included || value === TaxDisplayMode.both) {
    return value
  }
  return TaxDisplayMode.tax_included
}

// =============================================================================
// Actions
// =============================================================================

/**
 * 税設定を取得
 */
export async function getTaxSettings(): Promise<TaxSettingsData> {
  if (!(await checkReadPermission())) {
    return DEFAULT_TAX_SETTINGS
  }

  return getTaxSettingsFromDb()
}

/**
 * 税設定を更新
 */
export const updateTaxSettings = withPermission<[input: TaxSettingsInput], void>(
  'settings',
  'update'
)(async (_user, input): Promise<ActionResult<void>> => {
  const parsed = taxSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const data = parsed.data

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      taxStandardRate: data.taxStandardRate,
      taxReducedRate: data.taxReducedRate,
      taxDisplayModeAdmin: data.taxDisplayModeAdmin,
      taxDisplayModePublic: data.taxDisplayModePublic,
      taxInputMode: data.taxInputMode,
    },
    update: {
      taxStandardRate: data.taxStandardRate,
      taxReducedRate: data.taxReducedRate,
      taxDisplayModeAdmin: data.taxDisplayModeAdmin,
      taxDisplayModePublic: data.taxDisplayModePublic,
      taxInputMode: data.taxInputMode,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('消費税設定を更新しました')
})

/**
 * 公開ページ用の税設定を取得
 *
 * 価格表示に使用
 */
export async function getPublicTaxSettings(): Promise<TaxSettingsData> {
  return getTaxSettingsFromDb()
}

/**
 * DBから税設定を取得（内部共通関数）
 */
async function getTaxSettingsFromDb(): Promise<TaxSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      taxStandardRate: true,
      taxReducedRate: true,
      taxDisplayModeAdmin: true,
      taxDisplayModePublic: true,
      taxInputMode: true,
    },
  })

  if (!settings) {
    return DEFAULT_TAX_SETTINGS
  }

  return {
    standardRate: settings.taxStandardRate,
    reducedRate: settings.taxReducedRate,
    displayModeAdmin: parseTaxDisplayMode(settings.taxDisplayModeAdmin),
    displayModePublic: parseTaxDisplayMode(settings.taxDisplayModePublic),
    inputMode: settings.taxInputMode === TaxInputMode.tax_included ? TaxInputMode.tax_included : TaxInputMode.tax_excluded,
  }
}
