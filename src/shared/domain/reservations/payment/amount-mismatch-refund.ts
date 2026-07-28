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
 * Checkout Session の amount_total が DB 期待額と不一致のため fulfill できなかった
 * captured payment を自動返金し `paymentStatus=REFUNDED` に収束させる（idempotent）。
 */
export async function refundCheckoutAmountMismatchForReservation(input: {
  reservationId: string;
  stripePaymentIntentId: string;
  capturedAppAmount: number;
  reason?: string;
}): Promise<{
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
}> {
  const {
    reservationId,
    stripePaymentIntentId,
    capturedAppAmount,
    reason = "Checkout 金額不一致のための自動返金",
  } = input;

  if (capturedAppAmount <= 0) {
    return { outcome: "not_applicable" };
  }

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
      },
    });

    if (!reservation) {
      return { outcome: "not_applicable" as const };
    }

    if (reservation.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      return { outcome: "not_applicable" as const };
    }

    if (
      reservation.paymentStatus !== PaymentStatus.UNPAID &&
      reservation.paymentStatus !== PaymentStatus.PENDING
    ) {
      return { outcome: "not_applicable" as const };
    }

    const refund = await createStripeRefundOrThrow({
      client,
      paymentIntentId: stripePaymentIntentId,
      amount: capturedAppAmount,
      stripeCurrency,
      metadata: {
        initiator: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
        reason,
      },
      idempotencyKey: `reservation-amount-mismatch-refund-${reservationId}`,
      operation: "refundCheckoutAmountMismatchForReservation",
      logContext: { reservationId },
      userMessage: "金額不一致の自動返金に失敗しました",
      severity: ErrorSeverity.CRITICAL,
    });

    await createRefundRecordIdempotent(tx, "refund_create_amount_mismatch", {
      reservationId,
      amount: capturedAppAmount,
      reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
    });

    await tx.reservation.updateMany({
      where: {
        id: reservationId,
        deletedAt: null,
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        },
        paymentStatus: {
          in: [PaymentStatus.UNPAID, PaymentStatus.PENDING],
        },
      },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        stripePaymentIntentId,
      },
    });

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: capturedAppAmount,
    };
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: reservationId,
      metadata: {
        operation: "refundCheckoutAmountMismatchForReservation",
        actorType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
