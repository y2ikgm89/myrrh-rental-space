import "server-only";

import type Stripe from "stripe";
import { prisma } from "@/shared/db/prisma";
import {
  applyConfirmedRefundStatus,
  findRefundEntityByStripeRefundId,
  isRefundSettledSuccess,
} from "@/shared/domain/payment/stripe-refund-orchestration";
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

  if (entity.status === refund.status) {
    // 既に同一 status で確定済み (webhook 再送 / 順序前後)。idempotent no-op。
    return;
  }

  const claimed = await applyConfirmedRefundStatus(
    prisma,
    refund.id,
    entity.status,
    refund.status,
  );
  if (claimed === 0) {
    // 別プロセスが同時に確定済み (race)。idempotent no-op。
    return;
  }

  if (isRefundSettledSuccess(refund.status)) {
    if (entity.reservationId) {
      await finalizeSettledReservationRefund(
        entity.reservationId,
        refund.id,
        refund.amount,
      );
      invalidateReservationCache(entity.reservationId);
    } else if (entity.eventRegistrationId) {
      await finalizeSettledEventRegistrationRefund(entity.eventRegistrationId);
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
