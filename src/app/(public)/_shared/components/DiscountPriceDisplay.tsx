'use client'

/**
 * 割引価格表示コンポーネント（公開ページ用）
 *
 * 割引適用時の価格を視覚的に表示
 * - 割引前価格（取り消し線）
 * - 割引後価格（強調）
 * - 割引率バッジ
 * - 割引内訳（長時間割引・クーポン）
 */

import { cn } from '@/shared/lib/utils'
import type { PriceCalculation } from '@/shared/lib/pricing'

// =============================================================================
// Types
// =============================================================================

export interface DiscountPriceDisplayProps {
  /** 料金計算結果 */
  calculation: PriceCalculation
  /** 割引前価格を表示するか */
  showOriginalPrice?: boolean
  /** 割引内訳を表示するか */
  showBreakdown?: boolean
  /** 警告メッセージを表示するか */
  showWarnings?: boolean
  /** サイズ */
  size?: 'sm' | 'md' | 'lg'
  /** クラス名 */
  className?: string
}

// =============================================================================
// Size Styles
// =============================================================================

const sizeStyles = {
  sm: {
    original: 'text-sm',
    price: 'text-lg font-semibold',
    badge: 'text-xs px-1.5 py-0.5',
    breakdown: 'text-xs',
  },
  md: {
    original: 'text-sm',
    price: 'text-2xl font-bold',
    badge: 'text-sm px-2 py-1',
    breakdown: 'text-sm',
  },
  lg: {
    original: 'text-base',
    price: 'text-3xl font-bold',
    badge: 'text-base px-2.5 py-1',
    breakdown: 'text-sm',
  },
} as const

// =============================================================================
// Component
// =============================================================================

export function DiscountPriceDisplay({
  calculation,
  showOriginalPrice = true,
  showBreakdown = false,
  showWarnings = true,
  size = 'md',
  className,
}: DiscountPriceDisplayProps) {
  const hasDiscount = calculation.totalDiscountRate > 0
  const {
    basePrice,
    totalPrice,
    totalDiscountRate,
    durationDiscount,
    couponDiscount,
    appliedDurationRule,
    appliedCoupon,
    warnings,
  } = calculation

  const styles = sizeStyles[size]

  return (
    <div className={cn('space-y-2', className)}>
      {/* 価格表示 */}
      <div className="flex flex-wrap items-baseline gap-2">
        {hasDiscount && showOriginalPrice && (
          <span className={cn('text-muted-foreground line-through', styles.original)}>
            ¥{basePrice.toLocaleString()}
          </span>
        )}

        <span className={cn('text-foreground', styles.price)}>
          ¥{totalPrice.toLocaleString()}
        </span>

        {hasDiscount && (
          <span
            className={cn(
              'rounded-full bg-destructive text-destructive-foreground',
              styles.badge
            )}
          >
            {totalDiscountRate}%OFF
          </span>
        )}
      </div>

      {/* 割引内訳 */}
      {showBreakdown && hasDiscount && (
        <div className={cn('space-y-1 text-muted-foreground', styles.breakdown)}>
          {appliedDurationRule && durationDiscount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-primary">長時間割引</span>
              <span>
                ({appliedDurationRule.hours}時間以上で{appliedDurationRule.discountRate}%OFF)
              </span>
              <span className="font-medium">-¥{durationDiscount.toLocaleString()}</span>
            </div>
          )}

          {appliedCoupon && couponDiscount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-success">クーポン</span>
              <span>「{appliedCoupon.code}」</span>
              <span className="font-medium">-¥{couponDiscount.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* 警告メッセージ */}
      {showWarnings && warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((warning, index) => (
            <p key={index} className="text-xs text-warning">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Compact Version (for inline display)
// =============================================================================

export interface CompactDiscountPriceProps {
  /** 元の価格 */
  originalPrice: number
  /** 割引後の価格 */
  discountedPrice: number
  /** 割引率（%） */
  discountRate?: number
  /** サイズ */
  size?: 'sm' | 'md'
  /** クラス名 */
  className?: string
}

export function CompactDiscountPrice({
  originalPrice,
  discountedPrice,
  discountRate,
  size = 'sm',
  className,
}: CompactDiscountPriceProps) {
  const hasDiscount = originalPrice > discountedPrice
  const actualRate = discountRate ?? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)

  if (!hasDiscount) {
    return (
      <span className={cn(size === 'sm' ? 'text-sm' : 'text-base', 'font-medium', className)}>
        ¥{originalPrice.toLocaleString()}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <span className={cn('text-muted-foreground line-through', size === 'sm' ? 'text-xs' : 'text-sm')}>
        ¥{originalPrice.toLocaleString()}
      </span>
      <span className={cn('font-semibold text-foreground', size === 'sm' ? 'text-sm' : 'text-base')}>
        ¥{discountedPrice.toLocaleString()}
      </span>
      <span className={cn('rounded bg-destructive px-1 text-destructive-foreground', size === 'sm' ? 'text-[10px]' : 'text-xs')}>
        {actualRate}%OFF
      </span>
    </span>
  )
}
