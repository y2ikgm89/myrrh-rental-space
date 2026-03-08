"use server";

import "server-only";

/**
 * クーポン共有 Server Actions
 *
 * admin/publicの両方で使用されるクーポン関連のServer Actions
 */

import {
  decrementCouponUsage as decrementCouponUsageCommand,
  incrementCouponUsage as incrementCouponUsageCommand,
} from "@/shared/domain/coupons/commands";
import {
  validateCouponCodeQuery,
  type ValidatedCouponData,
} from "@/shared/domain/coupons/queries";
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/shared/types/server-actions";
import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";

// =============================================================================
// Types
// =============================================================================

/**
 * クーポン検証成功結果
 */
export type ValidatedCoupon = ValidatedCouponData;

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
    const result = await validateCouponCodeQuery(normalizedCode, reservationAmount);

    if (!result.valid) {
      return createFailure(result.errorMessage);
    }

    return createSuccess("クーポンを適用しました", {
      coupon: result.coupon,
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
    await incrementCouponUsageCommand(couponId);
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
    await decrementCouponUsageCommand(couponId);
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "decrementCouponUsage", couponId },
    });
    throw error;
  }
}
