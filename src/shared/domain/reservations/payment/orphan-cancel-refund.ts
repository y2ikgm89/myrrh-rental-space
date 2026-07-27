import "server-only";

import {
  AuditAction,
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getStripeClient } from "@/shared/lib/stripe";
import {
  acquirePaymentRefundAdvisoryLock,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  PAYMENT_REFUND_TRANSACTION_OPTIONS,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import { ErrorSeverity } from "@/shared/lib/errors/server";

/**
 * Stripe 決済が「キャンセル済み予約」に対して成立してしまった orphan を自動返金し、
 * `paymentStatus=REFUNDED` に収束させる（idempotent）。
 *
 * `refundReservationPaymentCommand` は PAID / PARTIALLY_REFUNDED 前提のため直接は使えない。
 * claim 前提の webhook race を想定し、`paymentStatus=PENDING/UNPAID` でも実行できる。
 */
export async function refundOrphanedStripePaymentForCancelledReservation(input: {
  reservationId: string;
  /**
   * webhook payload 由来の PaymentIntent ID。DB 未保存でも可（このコマンドが保存する）。
   */
  stripePaymentIntentId: string;
  reason?: string;
}): Promise<{
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
}> {
  const {
    reservationId,
    stripePaymentIntentId,
    reason = "キャンセル済み予約への決済成立に伴う自動返金",
  } = input;

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, "reservation", reservationId);

    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId, deletedAt: null },
      select: {
        status: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
        totalPriceWithTax: true,
      },
    });

    if (!reservation) {
      return { outcome: "not_applicable" as const };
    }

    if (reservation.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (reservation.status !== ReservationStatus.CANCELLED) {
      return { outcome: "not_applicable" as const };
    }

    if (
      reservation.totalPriceWithTax === null ||
      reservation.totalPriceWithTax <= 0
    ) {
      return { outcome: "not_applicable" as const };
    }

    const paymentIntentId = stripePaymentIntentId;

    // 既 refund 累積額 (advisory lock 内で読むので TOCTOU なし)
    const aggregate = await tx.refund.aggregate({
      where: { reservationId },
      _sum: { amount: true },
    });
    const cumulativeSoFar = aggregate._sum.amount ?? 0;
    const remaining = reservation.totalPriceWithTax - cumulativeSoFar;

    if (remaining <= 0) {
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          status: ReservationStatus.CANCELLED,
          paymentStatus: { not: PaymentStatus.REFUNDED },
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          stripePaymentIntentId: paymentIntentId,
        },
      });
      return { outcome: "already_refunded" as const };
    }

    const refund = await createStripeRefundOrThrow({
      client,
      paymentIntentId: paymentIntentId,
      amount: remaining,
      stripeCurrency,
      metadata: {
        initiator: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        reason,
      },
      idempotencyKey: `reservation-refund-${reservationId}-${reservation.totalPriceWithTax}`,
      operation: "refundOrphanedStripePaymentForCancelledReservation",
      logContext: {
        reservationId,
        stripePaymentIntentId: paymentIntentId,
      },
      userMessage: "キャンセル後の自動返金に失敗しました",
      severity: ErrorSeverity.CRITICAL,
    });

    await createRefundRecordIdempotent(tx, "refund_create_auto_on_cancel", {
      reservationId,
      amount: remaining,
      reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
    });

    await tx.reservation.updateMany({
      where: {
        id: reservationId,
        deletedAt: null,
        status: ReservationStatus.CANCELLED,
        paymentStatus: { not: PaymentStatus.REFUNDED },
      },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(),
      },
    });

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: remaining,
    };
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: reservationId,
      metadata: {
        operation: "refundOrphanedStripePaymentForCancelledReservation",
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
