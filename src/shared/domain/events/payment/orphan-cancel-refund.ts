import "server-only";

import {
  AuditAction,
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  acquirePaymentRefundAdvisoryLock,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  PAYMENT_REFUND_TRANSACTION_OPTIONS,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { getStripeClient } from "@/shared/lib/stripe";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import { ErrorSeverity } from "@/shared/lib/errors/server";

/**
 * キャンセル済み EventRegistration への Stripe 決済成立 orphan を
 * PENDING/UNPAID → REFUNDED に閉じる。
 *
 * `refundEventRegistrationPaymentCommand` は PAID 前提のため使えない。
 * Reservation 側 `refundOrphanedStripePaymentForCancelledReservation` と同型。
 */
export async function refundOrphanedStripePaymentForCancelledEventRegistration(input: {
  registrationId: string;
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
    registrationId,
    stripePaymentIntentId,
    reason = "キャンセル済みイベント申込への決済成立に伴う自動返金",
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
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const registration = await tx.eventRegistration.findFirst({
      where: { id: registrationId, event: { deletedAt: null } },
      select: {
        status: true,
        paymentStatus: true,
        paidAmount: true,
        quantity: true,
        ticket: { select: { price: true } },
      },
    });

    if (!registration) {
      return { outcome: "not_applicable" as const };
    }

    if (registration.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (registration.status !== RegistrationStatus.CANCELLED) {
      return { outcome: "not_applicable" as const };
    }

    const expectedAmount =
      registration.paidAmount != null && registration.paidAmount > 0
        ? registration.paidAmount
        : registration.ticket.price * registration.quantity;

    if (expectedAmount <= 0) {
      return { outcome: "not_applicable" as const };
    }

    const paymentIntentId = stripePaymentIntentId;

    const aggregate = await tx.refund.aggregate({
      where: { eventRegistrationId: registrationId },
      _sum: { amount: true },
    });
    const cumulativeSoFar = aggregate._sum.amount ?? 0;
    const remaining = expectedAmount - cumulativeSoFar;

    if (remaining <= 0) {
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          status: RegistrationStatus.CANCELLED,
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
      idempotencyKey: `event-registration-cancel-orphan-refund-${registrationId}-${expectedAmount}`,
      operation: "refundOrphanedStripePaymentForCancelledEventRegistration",
      logContext: {
        registrationId,
        stripePaymentIntentId: paymentIntentId,
      },
      userMessage: "キャンセル後の自動返金に失敗しました",
      severity: ErrorSeverity.CRITICAL,
    });

    await createRefundRecordIdempotent(
      tx,
      "refund_create_event_auto_on_cancel",
      {
        eventRegistrationId: registrationId,
        amount: remaining,
        reason,
        stripeRefundId: refund.id,
        refundedByType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
      },
    );

    await tx.eventRegistration.updateMany({
      where: {
        id: registrationId,
        status: RegistrationStatus.CANCELLED,
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
      resource: "event-registration",
      resourceId: registrationId,
      metadata: {
        operation: "refundOrphanedStripePaymentForCancelledEventRegistration",
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
