'use client'

/**
 * クーポンコード入力コンポーネント
 *
 * 予約フォームで使用するクーポンコード入力
 * - コード入力フィールド
 * - 適用ボタン
 * - 適用結果表示
 * - エラーメッセージ表示
 */

import { useState, useTransition, type ChangeEvent, type KeyboardEvent } from 'react'
import { validateCouponCode } from '@/shared/actions/coupon'
import { cn } from '@/shared/lib/utils'
import { Check, Loader2, Tag, X } from 'lucide-react'
import { formatDiscountAmount } from '@/shared/lib/pricing'
import type { CouponType } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export interface AppliedCoupon {
  id: string
  code: string
  name: string
  type: CouponType
  discountValue: number
  maxDiscountAmount: number | null
  canCombineWithDurationDiscount: boolean
}

export interface CouponCodeInputProps {
  /** 適用済みクーポン */
  appliedCoupon?: AppliedCoupon | null
  /** クーポン適用時のコールバック */
  onApply: (coupon: AppliedCoupon) => void
  /** クーポン解除時のコールバック */
  onRemove: () => void
  /** 予約金額（最低利用金額チェック用） */
  reservationAmount?: number
  /** 無効化 */
  disabled?: boolean
  /** クラス名 */
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function CouponCodeInput({
  appliedCoupon,
  onApply,
  onRemove,
  reservationAmount,
  disabled = false,
  className,
}: CouponCodeInputProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleApply = () => {
    if (!code.trim()) {
      setError('クーポンコードを入力してください')
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await validateCouponCode(code, reservationAmount)

      if (!result.success) {
        setError(result.error)
        return
      }

      if (result.data?.coupon) {
        onApply(result.data.coupon)
        setCode('')
      }
    })
  }

  const handleRemove = () => {
    onRemove()
    setCode('')
    setError(null)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase())
    setError(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleApply()
    }
  }

  // 適用済みクーポンがある場合の表示
  if (appliedCoupon) {
    return (
      <div className={cn('space-y-2', className)}>
        <label className="text-sm font-medium">クーポン</label>
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <Tag className="h-4 w-4 text-green-600" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-green-700">
                {appliedCoupon.code}
              </span>
              <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs text-white">
                {formatDiscountAmount(appliedCoupon.type, appliedCoupon.discountValue)}
              </span>
            </div>
            <p className="text-xs text-green-600">{appliedCoupon.name}</p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-md text-green-600 hover:bg-green-100 hover:text-green-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">クーポンを削除</span>
          </button>
        </div>
      </div>
    )
  }

  // 未適用の場合の入力フォーム
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor="coupon-code" className="text-sm font-medium">
        クーポンコード
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="coupon-code"
            type="text"
            value={code}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="例: SUMMER2024"
            disabled={disabled || isPending}
            className={cn(
              'h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 font-mono uppercase placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            )}
            maxLength={20}
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled || isPending || !code.trim()}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span>適用</span>
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <p className="text-xs text-gray-500">
        お持ちのクーポンコードを入力してください
      </p>
    </div>
  )
}
