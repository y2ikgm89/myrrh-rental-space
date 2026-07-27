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
 * Waitlist offer: Stripe 課金成功後に confirm が EXPIRED（容量/期限 race）になった
 * orphan を PENDING → REFUNDED に閉じる。
 *
 * `refundEventRegistrationPaymentCommand` は PAID 前提のため使えない。
 * paymentIntent は webhook session 由来（DB 未保存でも可）。
 */
export async function refundExpiredWaitlistOfferPaymentCommand(input: {
  registrationId: string;
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
    reason = "Waitlist capacity race after successful payment",
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
        id: true,
        status: true,
        paymentStatus: true,
        paidAmount: true,
        stripePaymentIntentId: true,
      },
    });

    if (!registration) {
      return { outcome: "not_applicable" as const };
    }

    if (registration.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (
      registration.status !== RegistrationStatus.EXPIRED ||
      registration.paymentStatus !== PaymentStatus.PENDING ||
      registration.paidAmount === null ||
      registration.paidAmount <= 0
    ) {
      return { outcome: "not_applicable" as const };
    }

    const amount = registration.paidAmount;

    const refund = await createStripeRefundOrThrow({
      client,
      paymentIntentId: stripePaymentIntentId,
      amount,
      stripeCurrency,
      metadata: {
        initiator: REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
        reason,
      },
      idempotencyKey: `event-registration-capacity-race-refund-${registrationId}`,
      operation: "refundExpiredWaitlistOfferPayment",
      logContext: { registrationId },
      userMessage: "容量レース後の自動返金に失敗しました",
      severity: ErrorSeverity.CRITICAL,
    });

    await createRefundRecordIdempotent(tx, "refund_create_capacity_race", {
      eventRegistrationId: registrationId,
      amount,
      reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
    });

    await tx.eventRegistration.updateMany({
      where: {
        id: registrationId,
        status: RegistrationStatus.EXPIRED,
        paymentStatus: PaymentStatus.PENDING,
      },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        stripePaymentIntentId,
      },
    });

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: amount,
    };
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: registrationId,
      metadata: {
        operation: "refundExpiredWaitlistOfferPayment",
        actorType: REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
