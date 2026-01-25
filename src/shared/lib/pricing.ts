/**
 * 料金計算ユーティリティ
 *
 * 予約料金の計算と割引適用を担当
 * - 長時間割引: 時間ベースの自動割引
 * - クーポン割引: パーセント/定額割引
 * - 併用設定: best（最もお得な割引のみ）/ both（両方適用）
 */

import type { CouponType } from '@/shared/generated/prisma/enums'
import type { Decimal } from '@/shared/generated/prisma/runtime/client'

// Coupon型の簡易定義（Prismaのモデルに依存しない）
type CouponLike = {
  id: string
  code: string
  name: string
  type: CouponType
  discountValue: Decimal | number
  maxDiscountAmount?: Decimal | number | null
  canCombineWithDurationDiscount?: boolean
}

// =============================================================================
// Types
// =============================================================================

/**
 * 長時間割引ルール
 * 設定された時間以上の予約に対して割引を適用
 */
export type DurationDiscountRule = {
  hours: number // 閾値（時間）
  discountRate: number // 割引率（%）
}

/**
 * スペース固有割引タイプ
 */
export type SpaceDiscountType = 'none' | 'percentage' | 'fixed'

const VALID_SPACE_DISCOUNT_TYPES = new Set<string>(['none', 'percentage', 'fixed'])

/**
 * スペース割引タイプの型ガード
 */
export function isValidSpaceDiscountType(value: unknown): value is SpaceDiscountType {
  return typeof value === 'string' && VALID_SPACE_DISCOUNT_TYPES.has(value)
}

/**
 * スペース割引タイプを取得（無効な場合はデフォルト値）
 */
export function getSpaceDiscountTypeOrDefault(
  value: string | null | undefined,
  defaultValue: SpaceDiscountType = 'none'
): SpaceDiscountType {
  return value && isValidSpaceDiscountType(value) ? value : defaultValue
}

/**
 * 長時間割引オーバーライド設定
 */
export type DurationDiscountOverride = 'inherit' | 'enabled' | 'disabled'

const VALID_DURATION_DISCOUNT_OVERRIDES = new Set<string>(['inherit', 'enabled', 'disabled'])

/**
 * 長時間割引オーバーライドの型ガード
 */
export function isValidDurationDiscountOverride(value: unknown): value is DurationDiscountOverride {
  return typeof value === 'string' && VALID_DURATION_DISCOUNT_OVERRIDES.has(value)
}

/**
 * 長時間割引オーバーライドを取得（無効な場合はデフォルト値）
 */
export function getDurationDiscountOverrideOrDefault(
  value: string | null | undefined,
  defaultValue: DurationDiscountOverride = 'inherit'
): DurationDiscountOverride {
  return value && isValidDurationDiscountOverride(value) ? value : defaultValue
}

/**
 * スペース割引設定
 */
export type SpaceDiscountSettings = {
  discountType: SpaceDiscountType
  discountValue: number | null
  durationDiscountOverride: DurationDiscountOverride
}

/**
 * 割引併用モード
 */
export type DiscountCombinationMode = 'best' | 'both'

const VALID_DISCOUNT_COMBINATION_MODES = new Set<string>(['best', 'both'])

/**
 * 割引併用モードの型ガード
 */
export function isValidDiscountCombinationMode(value: unknown): value is DiscountCombinationMode {
  return typeof value === 'string' && VALID_DISCOUNT_COMBINATION_MODES.has(value)
}

/**
 * 割引併用モードを取得（無効な場合はデフォルト値）
 */
export function getDiscountCombinationModeOrDefault(
  value: string | null | undefined,
  defaultValue: DiscountCombinationMode = 'best'
): DiscountCombinationMode {
  return value && isValidDiscountCombinationMode(value) ? value : defaultValue
}

/**
 * 料金計算結果
 */
export type PriceCalculation = {
  basePrice: number // 割引前価格
  spaceDiscount: number // スペース固有割引額
  durationDiscount: number // 長時間割引額
  couponDiscount: number // クーポン割引額
  totalPrice: number // 最終価格
  totalDiscountRate: number // 総割引率（%）
  appliedSpaceDiscount: { type: SpaceDiscountType; value: number } | null // 適用されたスペース割引
  appliedDurationRule: DurationDiscountRule | null // 適用された長時間割引ルール
  appliedCoupon: { id: string; code: string; name: string; type: CouponType; discountValue: number } | null // 適用されたクーポン
  warnings: string[] // 警告メッセージ
}

/**
 * 料金計算パラメータ
 */
export type PriceCalculationParams = {
  hourlyPrice: number
  hours: number
  durationRules: DurationDiscountRule[]
  durationDiscountEnabled: boolean
  spaceDiscount?: SpaceDiscountSettings | null
  coupon?: CouponLike | null
  combinationMode: DiscountCombinationMode
  showWarning?: boolean
}

// =============================================================================
// Calculation Functions
// =============================================================================

/**
 * スペース固有割引を計算
 *
 * スペースに設定された固定割引を計算
 * - percentage: 基本料金の指定%を割引
 * - fixed: 固定額を割引
 */
export function calculateSpaceDiscount(
  basePrice: number,
  settings: SpaceDiscountSettings | null | undefined
): { discount: number; applied: { type: SpaceDiscountType; value: number } | null } {
  if (!settings || settings.discountType === 'none' || settings.discountValue == null) {
    return { discount: 0, applied: null }
  }

  const discountValue = Number(settings.discountValue)

  if (settings.discountType === 'percentage') {
    const discount = Math.floor(basePrice * (discountValue / 100))
    return {
      discount,
      applied: { type: 'percentage', value: discountValue },
    }
  }

  // fixed
  const discount = Math.min(discountValue, basePrice) // 割引額が価格を超えないように
  return {
    discount,
    applied: { type: 'fixed', value: discountValue },
  }
}

/**
 * 長時間割引を計算
 *
 * ルールは時間の降順でソートされ、最初にマッチしたルールが適用される
 * 例: 6時間以上で20%、4時間以上で10%の場合、5時間の予約は10%割引
 */
export function calculateDurationDiscount(
  basePrice: number,
  hours: number,
  rules: DurationDiscountRule[]
): { discount: number; appliedRule: DurationDiscountRule | null } {
  if (rules.length === 0 || hours <= 0 || basePrice <= 0) {
    return { discount: 0, appliedRule: null }
  }

  // 時間の降順でソート（より長い時間のルールを優先）
  const sortedRules = [...rules].sort((a, b) => b.hours - a.hours)

  // 最初にマッチしたルールを適用
  for (const rule of sortedRules) {
    if (hours >= rule.hours && rule.discountRate > 0) {
      const discount = Math.floor(basePrice * (rule.discountRate / 100))
      return { discount, appliedRule: rule }
    }
  }

  return { discount: 0, appliedRule: null }
}

/**
 * クーポン割引を計算
 *
 * - パーセント割引: 基本料金の指定%を割引（最大割引額制限あり）
 * - 定額割引: 固定額を割引
 */
export function calculateCouponDiscount(
  price: number,
  coupon: Pick<CouponLike, 'type' | 'discountValue' | 'maxDiscountAmount'>
): number {
  if (price <= 0) return 0

  const discountValue = Number(coupon.discountValue)

  if (coupon.type === 'PERCENTAGE') {
    let discount = Math.floor(price * (discountValue / 100))
    // 最大割引額の制限
    if (coupon.maxDiscountAmount) {
      const maxDiscount = Number(coupon.maxDiscountAmount)
      discount = Math.min(discount, maxDiscount)
    }
    return discount
  }

  // FIXED_AMOUNT
  return Math.min(discountValue, price) // 割引額が価格を超えないように
}

/**
 * 予約料金を計算（メイン関数）
 *
 * 計算順序:
 * 1. 基本料金 = hourlyPrice × hours
 * 2. スペース固有割引を計算（basePriceから）
 * 3. 長時間割引を計算（durationDiscountOverride考慮）
 * 4. クーポン割引を計算
 * 5. 併用モードに応じて最終価格を決定
 */
export function calculateReservationPrice(
  params: PriceCalculationParams
): PriceCalculation {
  const {
    hourlyPrice,
    hours,
    durationRules,
    durationDiscountEnabled,
    spaceDiscount,
    coupon,
    combinationMode,
    showWarning = true,
  } = params

  const warnings: string[] = []
  const basePrice = Math.floor(hourlyPrice * hours)

  // スペース固有割引
  const spaceDiscountResult = calculateSpaceDiscount(basePrice, spaceDiscount)
  const finalSpaceDiscount = spaceDiscountResult.discount
  const appliedSpaceDiscount = spaceDiscountResult.applied

  // 長時間割引（オーバーライド設定を考慮）
  let durationDiscount = 0
  let appliedDurationRule: DurationDiscountRule | null = null

  // オーバーライド設定を判定
  const durationOverride = spaceDiscount?.durationDiscountOverride ?? 'inherit'
  const effectiveDurationEnabled =
    durationOverride === 'inherit'
      ? durationDiscountEnabled
      : durationOverride === 'enabled'

  if (effectiveDurationEnabled && durationRules.length > 0) {
    // スペース割引適用後の価格に対して長時間割引を計算
    const priceAfterSpaceDiscount = basePrice - finalSpaceDiscount
    const result = calculateDurationDiscount(priceAfterSpaceDiscount, hours, durationRules)
    durationDiscount = result.discount
    appliedDurationRule = result.appliedRule
  }

  // クーポン割引
  let couponDiscount = 0
  let appliedCoupon: PriceCalculation['appliedCoupon'] = null

  if (coupon) {
    // スペース割引・長時間割引適用後の価格に対してクーポン割引を計算
    const priceAfterPriorDiscounts = basePrice - finalSpaceDiscount - durationDiscount
    couponDiscount = calculateCouponDiscount(priceAfterPriorDiscounts, coupon)
    appliedCoupon = {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      discountValue: Number(coupon.discountValue),
    }
  }

  // 併用モードに応じた最終価格計算
  // 注: スペース固有割引は常に適用（併用モードの対象外）
  let finalDurationDiscount = durationDiscount
  let finalCouponDiscount = couponDiscount

  if (combinationMode === 'best' && durationDiscount > 0 && couponDiscount > 0) {
    // 最もお得な割引のみ適用（長時間割引 vs クーポン割引）
    if (durationDiscount >= couponDiscount) {
      finalCouponDiscount = 0
      appliedCoupon = null
    } else {
      finalDurationDiscount = 0
      appliedDurationRule = null
    }

    if (showWarning) {
      warnings.push('より大きな割引が自動的に適用されました')
    }
  } else if (combinationMode === 'both' && durationDiscount > 0 && couponDiscount > 0) {
    // 両方適用（クーポンの併用設定を確認）
    if (coupon && !coupon.canCombineWithDurationDiscount) {
      // クーポンが併用不可の場合、クーポンを優先
      finalDurationDiscount = 0
      appliedDurationRule = null

      if (showWarning) {
        warnings.push('このクーポンは他の割引と併用できません')
      }
    } else if (showWarning && finalDurationDiscount > 0 && finalCouponDiscount > 0) {
      warnings.push('長時間割引とクーポン割引が両方適用されています')
    }
  }

  const totalDiscount = finalSpaceDiscount + finalDurationDiscount + finalCouponDiscount
  const totalPrice = Math.max(0, basePrice - totalDiscount) // マイナスにならないように
  const totalDiscountRate = basePrice > 0 ? Math.round((totalDiscount / basePrice) * 100) : 0

  return {
    basePrice,
    spaceDiscount: finalSpaceDiscount,
    durationDiscount: finalDurationDiscount,
    couponDiscount: finalCouponDiscount,
    totalPrice,
    totalDiscountRate,
    appliedSpaceDiscount,
    appliedDurationRule,
    appliedCoupon,
    warnings,
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * 長時間割引ルールを検証
 */
export function validateDurationDiscountRules(
  rules: unknown
): { valid: boolean; rules: DurationDiscountRule[]; error?: string } {
  if (!Array.isArray(rules)) {
    return { valid: false, rules: [], error: '割引ルールは配列である必要があります' }
  }

  const validRules: DurationDiscountRule[] = []

  for (const rule of rules) {
    if (
      typeof rule !== 'object' ||
      rule === null ||
      typeof rule.hours !== 'number' ||
      typeof rule.discountRate !== 'number'
    ) {
      return {
        valid: false,
        rules: [],
        error: '各ルールは hours と discountRate を持つ必要があります',
      }
    }

    if (rule.hours <= 0) {
      return { valid: false, rules: [], error: '時間は0より大きい必要があります' }
    }

    if (rule.discountRate < 0 || rule.discountRate > 100) {
      return { valid: false, rules: [], error: '割引率は0〜100の範囲で指定してください' }
    }

    validRules.push({
      hours: rule.hours,
      discountRate: rule.discountRate,
    })
  }

  return { valid: true, rules: validRules }
}

/**
 * JSON から長時間割引ルールをパース
 */
export function parseDurationDiscountRules(
  json: unknown
): DurationDiscountRule[] {
  const result = validateDurationDiscountRules(json)
  return result.valid ? result.rules : []
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * 割引額をフォーマット（表示用）
 */
export function formatDiscountAmount(
  type: CouponType,
  value: number
): string {
  if (type === 'PERCENTAGE') {
    return `${value}%OFF`
  }
  return `¥${value.toLocaleString()}OFF`
}

/**
 * 割引サマリーを生成（表示用）
 */
export function formatDiscountSummary(calculation: PriceCalculation): string[] {
  const summaries: string[] = []

  if (calculation.appliedSpaceDiscount) {
    const label =
      calculation.appliedSpaceDiscount.type === 'percentage'
        ? `${calculation.appliedSpaceDiscount.value}%OFF`
        : `¥${calculation.appliedSpaceDiscount.value.toLocaleString()}OFF`
    summaries.push(`スペース割引（${label}）: -¥${calculation.spaceDiscount.toLocaleString()}`)
  }

  if (calculation.appliedDurationRule) {
    summaries.push(
      `長時間割引（${calculation.appliedDurationRule.hours}時間以上）: -¥${calculation.durationDiscount.toLocaleString()}`
    )
  }

  if (calculation.appliedCoupon) {
    const couponLabel = formatDiscountAmount(
      calculation.appliedCoupon.type,
      Number(calculation.appliedCoupon.discountValue)
    )
    summaries.push(
      `クーポン「${calculation.appliedCoupon.code}」${couponLabel}: -¥${calculation.couponDiscount.toLocaleString()}`
    )
  }

  return summaries
}

// =============================================================================
// Tax Calculation Functions
// =============================================================================

/**
 * 税率タイプ
 */
export type TaxRateType = 'standard' | 'reduced'

const VALID_TAX_RATE_TYPES = new Set<string>(['standard', 'reduced'])

/**
 * 税率タイプの型ガード
 */
export function isValidTaxRateType(value: unknown): value is TaxRateType {
  return typeof value === 'string' && VALID_TAX_RATE_TYPES.has(value)
}

/**
 * 税率タイプを取得（無効な場合はデフォルト値）
 */
export function getTaxRateTypeOrDefault(
  value: string | null | undefined,
  defaultValue: TaxRateType = 'standard'
): TaxRateType {
  return value && isValidTaxRateType(value) ? value : defaultValue
}

/**
 * 税表示モード
 */
export type TaxDisplayMode = 'tax_excluded' | 'tax_included' | 'both'

const VALID_TAX_DISPLAY_MODES = new Set<string>(['tax_excluded', 'tax_included', 'both'])

/**
 * 税表示モードの型ガード
 */
export function isValidTaxDisplayMode(value: unknown): value is TaxDisplayMode {
  return typeof value === 'string' && VALID_TAX_DISPLAY_MODES.has(value)
}

/**
 * 税表示モードを取得（無効な場合はデフォルト値）
 */
export function getTaxDisplayModeOrDefault(
  value: string | null | undefined,
  defaultValue: TaxDisplayMode = 'both'
): TaxDisplayMode {
  return value && isValidTaxDisplayMode(value) ? value : defaultValue
}

/**
 * 税入力モード
 */
export type TaxInputMode = 'tax_excluded' | 'tax_included'

const VALID_TAX_INPUT_MODES = new Set<string>(['tax_excluded', 'tax_included'])

/**
 * 税入力モードの型ガード
 */
export function isValidTaxInputMode(value: unknown): value is TaxInputMode {
  return typeof value === 'string' && VALID_TAX_INPUT_MODES.has(value)
}

/**
 * 税入力モードを取得（無効な場合はデフォルト値）
 */
export function getTaxInputModeOrDefault(
  value: string | null | undefined,
  defaultValue: TaxInputMode = 'tax_excluded'
): TaxInputMode {
  return value && isValidTaxInputMode(value) ? value : defaultValue
}

/**
 * 税設定
 */
export type TaxSettings = {
  standardRate: number // 標準税率（%）
  reducedRate: number // 軽減税率（%）
  displayModeAdmin: TaxDisplayMode // 管理画面の表示モード
  displayModePublic: TaxDisplayMode // 公開ページの表示モード
  inputMode: TaxInputMode // 入力モード（税抜き/税込み）
}

/**
 * デフォルト税設定
 */
export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  standardRate: 10,
  reducedRate: 8,
  displayModeAdmin: 'both',
  displayModePublic: 'tax_included',
  inputMode: 'tax_excluded',
}

/**
 * 税率を取得
 */
export function getTaxRate(
  taxRateType: TaxRateType,
  settings: TaxSettings = DEFAULT_TAX_SETTINGS
): number {
  return taxRateType === 'reduced' ? settings.reducedRate : settings.standardRate
}

/**
 * 税込価格を計算（税抜価格から）
 * 四捨五入で端数処理（消費税の一般的な計算方法）
 */
export function calculateTaxIncludedPrice(
  taxExcludedPrice: number,
  taxRate: number
): number {
  return Math.round(taxExcludedPrice * (1 + taxRate / 100))
}

/**
 * 税抜価格を計算（税込価格から）
 * 四捨五入で端数処理（消費税の一般的な計算方法）
 */
export function calculateTaxExcludedPrice(
  taxIncludedPrice: number,
  taxRate: number
): number {
  return Math.round(taxIncludedPrice / (1 + taxRate / 100))
}

/**
 * 税額を計算（税抜価格から）
 * 四捨五入で端数処理（消費税の一般的な計算方法）
 */
export function calculateTaxAmount(
  taxExcludedPrice: number,
  taxRate: number
): number {
  return Math.round(taxExcludedPrice * (taxRate / 100))
}

/**
 * 価格フォーマットオプション
 */
export type PriceFormatOptions = {
  showCurrency?: boolean // 通貨記号を表示（デフォルト: true）
  showTaxLabel?: boolean // 税ラベルを表示（デフォルト: false）
  taxLabel?: string // 税ラベル（デフォルト: '税込'/'税抜'）
}

/**
 * 価格をフォーマット
 */
export function formatPrice(
  price: number,
  options: PriceFormatOptions = {}
): string {
  const { showCurrency = true, showTaxLabel = false, taxLabel } = options
  const formattedPrice = price.toLocaleString('ja-JP')
  let result = showCurrency ? `¥${formattedPrice}` : formattedPrice
  if (showTaxLabel && taxLabel) {
    result += `（${taxLabel}）`
  }
  return result
}

/**
 * 税込/税抜価格の表示オプション
 */
export type TaxPriceDisplayOptions = {
  taxExcludedPrice: number // 税抜価格
  taxRate: number // 税率（%）
  displayMode: TaxDisplayMode // 表示モード
}

/**
 * 税込/税抜価格をフォーマット
 */
export function formatPriceWithTax(options: TaxPriceDisplayOptions): string {
  const { taxExcludedPrice, taxRate, displayMode } = options
  const taxIncludedPrice = calculateTaxIncludedPrice(taxExcludedPrice, taxRate)

  switch (displayMode) {
    case 'tax_excluded':
      return `¥${taxExcludedPrice.toLocaleString('ja-JP')}（税抜）`
    case 'tax_included':
      return `¥${taxIncludedPrice.toLocaleString('ja-JP')}（税込）`
    case 'both':
      return `¥${taxIncludedPrice.toLocaleString('ja-JP')}（税込）/ ¥${taxExcludedPrice.toLocaleString('ja-JP')}（税抜）`
  }
}

/**
 * 税率ラベルを取得
 */
export function getTaxRateLabel(taxRateType: TaxRateType, taxRate: number): string {
  const typeLabel = taxRateType === 'reduced' ? '軽減税率' : '標準税率'
  return `${typeLabel}（${taxRate}%）`
}
