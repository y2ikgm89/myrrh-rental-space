import "server-only";

import type Stripe from "stripe";
import { prisma } from "@/shared/db/prisma";
import {
  applyConfirmedRefundStatus,
  findRefundEntityByStripeRefundId,
  isRefundSettledSuccess,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { fromStripeUnitAmount } from "@/shared/lib/stripe-shared";
import { finalizeSettledReservationRefund } from "@/shared/domain/reservations/payment-queries";
import { finalizeSettledEventRegistrationRefund } from "@/shared/domain/events/payment-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  invalidateEventRegistrationCache,
  invalidateReservationCache,
} from "./cache-invalidation";

/**
 * refund.updated / refund.failed
 *
 * konbini / customer_balance 等の非同期決済手段は `refunds.create()` 時点では
 * "pending" (稀に "requires_action") しか返さず、Stripe が最大45日かけて後日
 * "succeeded" または "failed"/"canceled" を確定させる
 * (`tok_pendingRefund` → refund.updated、`tok_refundFail` → refund.failed。
 * Stripe 公式 testing docs 参照)。作成時点 (`createStripeRefundOrThrow` の
 * 各呼び出し元) は未確定の間 paymentStatus 反映・返金完了メール送信を保留して
 * いるため、この handler が確定後にその保留処理を完了させる。
 *
 * "succeeded" 以外への遷移 ("failed" / "canceled") は Stripe 公式ガイダンス
 * (https://docs.stripe.com/refunds#failed-refunds) が「代替の返金手段を手配する
 * 必要がある」と明記する運用上のインシデントのため、CRITICAL ログで管理者対応を促す
 * (自動での代替返金は行わない)。
 */
export async function handleRefundStatusUpdated(
  refund: Stripe.Refund,
): Promise<void> {
  if (refund.status === null) return;

  const entity = await findRefundEntityByStripeRefundId(refund.id);
  if (!entity) {
    // 自 repo が作成していない refund (Dashboard 手動操作等) の可能性がある。
    // charge.refunded 側が idempotent に拾うため warning に留めて 200 を返す。
    logError(
      new Error("No refund row found for refund.updated/refund.failed"),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "stripeWebhookRefundStatusUpdated",
          stripeRefundId: refund.id,
        },
      },
    );
    return;
  }

  if (entity.status !== refund.status) {
    // status 列の更新自体は claim 数を問わない: 別プロセスが同時に確定済み
    // (race) でも、後続の finalize 呼び出しは entity.reservationId /
    // eventRegistrationId 側の updateMany WHERE claim で独立に idempotent。
    await applyConfirmedRefundStatus(
      prisma,
      refund.id,
      entity.status,
      refund.status,
    );
  }

  if (isRefundSettledSuccess(refund.status)) {
    // finalize は必ず呼ぶ (claimed===0 でも早期 return しない): webhook 再送で
    // status 列の更新が前回既に完了していても、paymentStatus 反映・メール送信
    // 側が前回クラッシュ等で未完了のままの可能性があるため。冪等性は finalize
    // 関数自身の updateMany WHERE claim (paymentStatus ガード) が担保する。
    const settledAmount = fromStripeUnitAmount(refund.amount, refund.currency);
    if (entity.reservationId) {
      await finalizeSettledReservationRefund(
        entity.reservationId,
        refund.id,
        settledAmount,
        entity.refundedByType,
      );
      invalidateReservationCache(entity.reservationId);
    } else if (entity.eventRegistrationId) {
      await finalizeSettledEventRegistrationRefund(
        entity.eventRegistrationId,
        refund.id,
        entity.refundedByType,
      );
      invalidateEventRegistrationCache();
    }
    return;
  }

  if (refund.status === "failed" || refund.status === "canceled") {
    logError(
      new Error(
        `Stripe refund ${refund.status}: manual intervention required (alternative refund method)`,
      ),
      {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "stripeWebhookRefundStatusUpdated",
          stripeRefundId: refund.id,
          refundStatus: refund.status,
          ...(entity.reservationId
            ? { reservationId: entity.reservationId }
            : {}),
          ...(entity.eventRegistrationId
            ? { eventRegistrationId: entity.eventRegistrationId }
            : {}),
        },
      },
    );
  }

  // "pending" / "requires_action" への遷移は単なる中間状態、何もしない。
}
