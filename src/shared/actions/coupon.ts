"use server";

import "server-only";

/**
 * クーポン共有 Server Actions
 *
 * admin/publicの両方で使用されるクーポン関連のServer Actions
 */

import { prisma } from "@/shared/lib/prisma";
import type { CouponType } from "@/shared/generated/prisma/enums";
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/shared/types/server-actions";
import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";

// =============================================================================
// Types
// =============================================================================

/**
 * クーポン検証成功結果
 */
export interface ValidatedCoupon {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountValue: number;
  maxDiscountAmount: number | null;
  canCombineWithDurationDiscount: boolean;
}

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
  reservationAmount?: number,
): Promise<ActionResult<{ coupon: ValidatedCoupon }>> {
  const normalizedCode = code.toUpperCase().trim();

  if (normalizedCode.length < 4) {
    return createFailure("クーポンコードは4文字以上で入力してください");
  }

  if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
    return createFailure("無効なクーポンコードです");
  }

  try {
    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    const now = new Date();
    let isInvalid = false;
    let minAmountError: string | null = null;

    if (!coupon || !coupon.isActive) {
      isInvalid = true;
    }

    if (coupon) {
      if (coupon.validFrom > now) {
        isInvalid = true;
      }
      if (coupon.validUntil && coupon.validUntil < now) {
        isInvalid = true;
      }
      if (
        coupon.usageLimit !== null &&
        coupon.usageCount >= coupon.usageLimit
      ) {
        isInvalid = true;
      }
      if (reservationAmount !== undefined && coupon.minReservationAmount) {
        if (reservationAmount < coupon.minReservationAmount) {
          minAmountError = `このクーポンは¥${coupon.minReservationAmount.toLocaleString()}以上のご利用で適用できます`;
        }
      }
    }

    if (isInvalid || !coupon) {
      return createFailure("無効なクーポンコードです");
    }

    if (minAmountError) {
      return createFailure(minAmountError);
    }

    return createSuccess("クーポンを適用しました", {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
      },
    });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "validateCouponCode", code: normalizedCode },
    });
    return createFailure("一時的なエラーが発生しました");
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
  try {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usageCount: { increment: 1 } },
    });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "incrementCouponUsage", couponId },
    });
    throw error;
  }
}

/**
 * クーポン使用回数をデクリメント
 *
 * 予約編集でクーポンを変更・削除した際に呼び出される。
 * 0以下にはならないよう MAX(0, count - 1) で更新する。
 *
 * @param couponId - クーポンID
 */
export async function decrementCouponUsage(couponId: string): Promise<void> {
  try {
    await prisma.coupon.updateMany({
      where: { id: couponId, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "decrementCouponUsage", couponId },
    });
    throw error;
  }
}
