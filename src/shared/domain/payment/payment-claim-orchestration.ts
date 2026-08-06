import "server-only";

import type {
  PaymentStatus,
  RegistrationStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import type { NotificationType } from "@/shared/lib/validations/enums/helpers";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import { fromStripeUnitAmount } from "@/shared/lib/stripe-shared";
import {
  REFUNDED_BY_TYPE,
  isValidRefundedByType,
  type RefundedByType,
} from "@/shared/lib/validations/enums/refund-attribution";
import {
  PAYMENT_STATUSES_REFUNDABLE_FOR_CHARGE_WEBHOOK,
  resolveRefundStatusFromChargeAmounts,
} from "@/shared/domain/payment/payment-status-guards";

export type PaidClaimMissCurrentState = {
  status: ReservationStatus | RegistrationStatus;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
};

export type OrphanRefundNotificationSpec = {
  type: NotificationType;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
};

export type OrphanRefundOutcome = {
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
};

/**
 * PAID claim が count=0 のとき、キャンセル済み entity への money-in-flight を
 * 自動返金 + 通知で収束させる共有 orchestration。
 */
export async function handlePaidClaimMissWithOrphanRefund(input: {
  entityId: string;
  webhookPaymentIntentId: string | null;
  current: PaidClaimMissCurrentState | null;
  cancelledStatus: ReservationStatus | RegistrationStatus;
  operation: string;
  refundOrphan: (args: {
    stripePaymentIntentId: string;
  }) => Promise<OrphanRefundOutcome>;
  notifications: {
    missingPaymentIntent: OrphanRefundNotificationSpec;
    refunded: (refundAmount: number) => OrphanRefundNotificationSpec;
    refundFailed: (paymentIntentId: string) => OrphanRefundNotificationSpec;
  };
  notifyContext: {
    missingPaymentIntentOperation: string;
    refundedOperation: string;
    refundFailedOperation: string;
  };
  /** Reservation は refund 失敗時に rethrow、Event は swallow して false を返す。 */
  rethrowRefundFailure: boolean;
}): Promise<void> {
  if (input.current?.status !== input.cancelledStatus) {
    return;
  }

  const paymentIntentId =
    input.webhookPaymentIntentId ?? input.current.stripePaymentIntentId;

  if (!paymentIntentId) {
    logError(
      new Error(
        `${input.operation}: missing stripePaymentIntentId for a cancelled entity`,
      ),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: input.operation,
          entityId: input.entityId,
          currentPaymentStatus: input.current.paymentStatus,
        },
      },
    );
    fireAndForget(
      createNotificationCommand(input.notifications.missingPaymentIntent),
      {
        operation: input.notifyContext.missingPaymentIntentOperation,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: { entityId: input.entityId },
      },
    );
    return;
  }

  try {
    const refunded = await input.refundOrphan({
      stripePaymentIntentId: paymentIntentId,
    });
    if (refunded.outcome === "refunded") {
      fireAndForget(
        createNotificationCommand(
          input.notifications.refunded(refunded.refundAmount ?? 0),
        ),
        {
          operation: input.notifyContext.refundedOperation,
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            entityId: input.entityId,
            stripePaymentIntentId: paymentIntentId,
            refundId: refunded.refundId,
          },
        },
      );
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.CRITICAL,
      context: {
        operation: input.operation,
        entityId: input.entityId,
        stripePaymentIntentId: paymentIntentId,
        currentPaymentStatus: input.current.paymentStatus,
      },
    });
    fireAndForget(
      createNotificationCommand(
        input.notifications.refundFailed(paymentIntentId),
      ),
      {
        operation: input.notifyContext.refundFailedOperation,
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.CRITICAL,
        context: {
          entityId: input.entityId,
          stripePaymentIntentId: paymentIntentId,
        },
      },
    );
    if (input.rethrowRefundFailure) {
      throw error;
    }
  }
}

export type ChargeRefundLatestRefund = {
  readonly id: string;
  readonly amount: number;
  readonly metadata?: Record<string, string | undefined> | null | undefined;
};

/**
 * `charge.refunded` webhook の idempotent 反映コア。
 * Reservation / EventRegistration は Refund FK と updateMany delegate のみ差し替える。
 */
export async function applyStripeChargeRefundIdempotent(input: {
  chargeAmount: number;
  amountRefunded: number;
  currency: string;
  latestRefund: ChargeRefundLatestRefund | null;
  createRefundRecord: (data: {
    amount: number;
    stripeRefundId: string;
    refundedByType: RefundedByType;
  }) => Promise<void>;
  updatePaymentStatus: (
    newStatus:
      typeof PaymentStatus.REFUNDED | typeof PaymentStatus.PARTIALLY_REFUNDED,
  ) => Promise<void>;
}): Promise<void> {
  const { chargeAmount, amountRefunded, currency, latestRefund } = input;

  if (latestRefund) {
    const initiatorMeta = latestRefund.metadata?.["initiator"];
    const refundedByType = isValidRefundedByType(initiatorMeta)
      ? initiatorMeta
      : REFUNDED_BY_TYPE.STRIPE_DASHBOARD;
    try {
      await input.createRefundRecord({
        amount: fromStripeUnitAmount(latestRefund.amount, currency),
        stripeRefundId: latestRefund.id,
        refundedByType,
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error, "Refund.stripeRefundId"))
        throw error;
    }
  }

  const newStatus = resolveRefundStatusFromChargeAmounts({
    chargeAmount,
    amountRefunded,
  });

  await input.updatePaymentStatus(newStatus);
}

/** charge.refunded の paymentStatus 遷移 WHERE 述語（entity 側 updateMany に spread）。 */
export function buildChargeRefundPaymentStatusWhere(): {
  paymentStatus: { in: PaymentStatus[] };
} {
  return {
    paymentStatus: {
      in: [...PAYMENT_STATUSES_REFUNDABLE_FOR_CHARGE_WEBHOOK],
    },
  };
}
