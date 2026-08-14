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
import {
  isNonIntegerAppAmountError,
  toPersistedAppAmount,
  type NonIntegerAppAmountError,
} from "@/shared/lib/stripe-shared";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import {
  REFUNDED_BY_TYPE,
  isValidRefundedByType,
  type RefundedByType,
} from "@/shared/lib/validations/enums/refund-attribution";
import {
  PAYMENT_STATUSES_REFUNDABLE_FOR_CHARGE_WEBHOOK,
  resolveRefundStatusFromChargeAmounts,
} from "@/shared/domain/payment/payment-status-guards";
import { isRefundSettledSuccess } from "@/shared/domain/payment/stripe-refund-orchestration";

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

/**
 * `Refund.amount` (Int) に書けない端数を webhook 500 にしない。
 * Stripe は同じイベントを最大 3 日再送するため、CRITICAL + 管理者通知で止める。
 */
export function acknowledgeNonIntegerAppAmount(
  error: NonIntegerAppAmountError,
  context: {
    operation: string;
    entityId?: string;
    stripeRefundId?: string;
    subject: "reservation" | "event-registration";
  },
): void {
  const isEvent = context.subject === "event-registration";
  const notificationType = isEvent
    ? NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND
    : NOTIFICATION_TYPE.RESERVATION_REFUND;

  logError(error, {
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.CRITICAL,
    context: {
      operation: context.operation,
      stripeMinor: error.stripeMinor,
      currency: error.currency,
      appAmount: error.appAmount,
      ...(context.entityId ? { entityId: context.entityId } : {}),
      ...(context.stripeRefundId
        ? { stripeRefundId: context.stripeRefundId }
        : {}),
    },
  });

  fireAndForget(
    createNotificationCommand({
      type: notificationType,
      title: NOTIFICATION_TYPE_LABELS[notificationType],
      message: `返金額 ${error.appAmount} ${error.currency} は整数ではないため Refund.amount に保存できません。Stripe 最小単位 ${error.stripeMinor}。管理画面と Stripe を突合してください。`,
      ...(context.entityId
        ? {
            resourceType: isEvent ? "event_registration" : "reservation",
            resourceId: context.entityId,
          }
        : {}),
    }),
    {
      operation: `${context.operation}NonIntegerAmount`,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.CRITICAL,
      context: {
        ...(context.entityId ? { entityId: context.entityId } : {}),
        stripeMinor: error.stripeMinor,
        currency: error.currency,
      },
    },
  );
}

export type ChargeRefundLatestRefund = {
  readonly id: string;
  readonly amount: number;
  /**
   * Stripe `Refund.status`。`"succeeded"` 以外は未確定で、この値のまま
   * paymentStatus を終端状態へ動かしてはいけない。
   * 型上 nullable なのは Stripe の型定義がそうであるためで、実運用では
   * 常に値が来る。null は `"pending"`（＝未確定側）として扱う。
   */
  readonly status: string | null;
  readonly metadata?: Record<string, string | undefined> | null | undefined;
};

/**
 * `charge.refunded` webhook の idempotent 反映コア。
 * Reservation / EventRegistration は Refund FK と updateMany delegate のみ差し替える。
 *
 * ## paymentStatus を動かす条件
 *
 * **Stripe が `"succeeded"` を返した返金だけ**が entity の paymentStatus を動かす。
 * konbini / customer_balance のような非同期返金は作成直後 `"pending"` で、Stripe が
 * 最大 45 日後に `"succeeded"` / `"failed"` を確定させる。未確定のまま REFUNDED を
 * 焼くと、後で `refund.failed` が来ても戻す経路が無く（`refund-status-updated.ts` は
 * CRITICAL ログのみ）、`refundReservationPaymentCommand` の入口 gate が
 * PAID / PARTIALLY_REFUNDED しか受けないので**管理画面から再返金もできなくなる**。
 * 確定側は `refund.updated` → `finalizeSettled*Refund` が担当する。
 *
 * app 側の全返金経路は既に `isRefundSettledSuccess` で gate しており、
 * この handler だけが例外だった（監査 F-54 / F-55）。
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
    status: string;
  }) => Promise<void>;
  updatePaymentStatus: (
    newStatus:
      typeof PaymentStatus.REFUNDED | typeof PaymentStatus.PARTIALLY_REFUNDED,
  ) => Promise<void>;
  /** ログの文脈（どの entity の webhook か）。 */
  logContext: { operation: string; entityId: string };
}): Promise<void> {
  const { chargeAmount, amountRefunded, currency, latestRefund } = input;

  if (!latestRefund) {
    // `charge.refunded` なのに `charge.refunds` が空 ＝ どの Refund が確定したのか
    // 判定できない。金額比較だけで終端状態を焼くと戻せなくなるので何もしない。
    // 確定は `refund.updated` 側に委ねる。
    logError(new Error("charge.refunded arrived without any refund object"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { ...input.logContext, chargeAmount, amountRefunded },
    });
    return;
  }

  const initiatorMeta = latestRefund.metadata?.["initiator"];
  const refundedByType = isValidRefundedByType(initiatorMeta)
    ? initiatorMeta
    : REFUNDED_BY_TYPE.STRIPE_DASHBOARD;
  const refundStatus = latestRefund.status ?? "pending";

  let persistAmount: number;
  try {
    persistAmount = toPersistedAppAmount(latestRefund.amount, currency);
  } catch (error) {
    if (isNonIntegerAppAmountError(error)) {
      acknowledgeNonIntegerAppAmount(error, {
        operation: input.logContext.operation,
        entityId: input.logContext.entityId,
        stripeRefundId: latestRefund.id,
        subject: input.logContext.operation.includes("Event")
          ? "event-registration"
          : "reservation",
      });
      return;
    }
    throw error;
  }

  try {
    await input.createRefundRecord({
      amount: persistAmount,
      stripeRefundId: latestRefund.id,
      refundedByType,
      status: refundStatus,
    });
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error, "Refund.stripeRefundId"))
      throw error;
  }

  if (!isRefundSettledSuccess(refundStatus)) return;

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
