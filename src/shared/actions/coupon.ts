'use server'

/**
 * クーポン共有 Server Actions
 *
 * admin/publicの両方で使用されるクーポン関連のServer Actions
 */

import { prisma } from '@/shared/lib/prisma'
import type { CouponType } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

/**
 * クーポン検証成功結果
 */
export interface ValidatedCoupon {
  id: string
  code: string
  name: string
  type: CouponType
  discountValue: number
  maxDiscountAmount: number | null
  canCombineWithDurationDiscount: boolean
}

/**
 * 検証結果型
 */
export type CouponValidationResult =
  | { success: true; data: { coupon: ValidatedCoupon }; message: string }
  | { success: false; error: string }

// =============================================================================
// Actions
// =============================================================================

/**
 * クーポンコードを検証
 *
 * 予約フォームでクーポンコードを入力した際の検証
 * - コードの存在確認
 * - 有効期限の確認
 * - 利用回数制限の確認
 * - 最低利用金額の確認（オプション）
 *
 * @param code - クーポンコード
 * @param reservationAmount - 予約金額（最低利用金額チェック用）
 */
export async function validateCouponCode(
  code: string,
  reservationAmount?: number
): Promise<CouponValidationResult> {
  const normalizedCode = code.toUpperCase().trim()

  if (normalizedCode.length < 4) {
    return { success: false, error: 'クーポンコードは4文字以上で入力してください' }
  }

  // 入力検証: 英数字のみ許可
  if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
    return { success: false, error: '無効なクーポンコードです' }
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
  })

  // タイミング攻撃対策: すべての検証を実行し、統一されたエラーメッセージを返す
  const now = new Date()
  let isInvalid = false
  let minAmountError: string | null = null

  // クーポンが存在しない or 無効
  if (!coupon || !coupon.isActive) {
    isInvalid = true
  }

  // 以下の検証はクーポンが存在する場合のみ実行
  if (coupon) {
    // 有効期間前
    if (coupon.validFrom > now) {
      isInvalid = true
    }
    // 有効期限切れ
    if (coupon.validUntil && coupon.validUntil < now) {
      isInvalid = true
    }
    // 利用回数上限
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      isInvalid = true
    }
    // 最低利用金額チェック（ユーザーに有用なフィードバックのため別メッセージ）
    if (reservationAmount !== undefined && coupon.minReservationAmount) {
      const minAmount = Number(coupon.minReservationAmount)
      if (reservationAmount < minAmount) {
        minAmountError = `このクーポンは¥${minAmount.toLocaleString()}以上のご利用で適用できます`
      }
    }
  }

  // 無効なクーポンのエラーを優先（最低利用金額エラーより先に返す）
  if (isInvalid || !coupon) {
    return { success: false, error: '無効なクーポンコードです' }
  }

  // 最低利用金額エラー
  if (minAmountError) {
    return { success: false, error: minAmountError }
  }

  return {
    success: true,
    message: 'クーポンを適用しました',
    data: {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        discountValue: Number(coupon.discountValue),
        maxDiscountAmount: coupon.maxDiscountAmount ? Number(coupon.maxDiscountAmount) : null,
        canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
      },
    },
  }
}

/**
 * クーポン使用回数をインクリメント
 *
 * 予約確定時に呼び出される
 *
 * @param couponId - クーポンID
 */
export async function incrementCouponUsage(couponId: string): Promise<void> {
  await prisma.coupon.update({
    where: { id: couponId },
    data: { usageCount: { increment: 1 } },
  })
}
