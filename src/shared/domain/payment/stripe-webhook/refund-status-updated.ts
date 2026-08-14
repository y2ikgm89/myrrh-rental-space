import "server-only";

import type Stripe from "stripe";
import { prisma } from "@/shared/db/prisma";
import {
  applyConfirmedRefundStatus,
  findRefundEntityByStripeRefundId,
  isRefundSettledSuccess,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import {
  isNonIntegerAppAmountError,
  toPersistedAppAmount,
} from "@/shared/lib/stripe-shared";
import { acknowledgeNonIntegerAppAmount } from "@/shared/domain/payment/payment-claim-orchestration";
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

  if (isRefundSettledSuccess(refund.status)) {
    // Refund.status の claim (非終端 → "succeeded") は finalize 関数自身が
    // entity 反映と同一 tx 内で atomic に行う (Codex review, PR #1666)。
    // ここで事前に applyConfirmedRefundStatus を呼んでしまうと finalize 側の
    // claim が常に count=0 になり、finalize (entity 反映・完了 AuditLog・
    // 返金完了メール) が一切実行されなくなるため、succeeded 側では呼ばない。
    let settledAmount: number;
    try {
      settledAmount = toPersistedAppAmount(refund.amount, refund.currency);
    } catch (error) {
      if (isNonIntegerAppAmountError(error)) {
        const entityId =
          entity.reservationId ?? entity.eventRegistrationId ?? null;
        acknowledgeNonIntegerAppAmount(error, {
          operation: "stripeWebhookRefundStatusUpdated",
          stripeRefundId: refund.id,
          subject: entity.eventRegistrationId
            ? "event-registration"
            : "reservation",
          // exactOptionalPropertyTypes: undefined を明示代入しない
          ...(entityId ? { entityId } : {}),
        });
        return;
      }
      throw error;
    }
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

  // succeeded 以外 (failed/canceled/pending/requires_action) はここで status
  // 列を記録する。副作用を伴う succeeded 側と異なり単純な状態記録のため、
  // entity.status との一致チェックのみで十分 (再送での重複更新は同値書込に
  // なるだけで実害がない)。
  if (entity.status !== refund.status) {
    await applyConfirmedRefundStatus(
      prisma,
      refund.id,
      entity.status,
      refund.status,
    );
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
