import "server-only";

import { PaymentStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { expireCheckoutSessionWithClientBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import {
  PAYMENT_STATUSES_TERMINAL_FOR_CHECKOUT_SETTLE,
  buildCheckoutSettleUpdateData,
} from "@/shared/domain/payment/payment-status-guards";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";

export type PaymentUpdateManyRunner = (args: {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}) => Promise<{ count: number }>;

/** Stripe session 作成失敗 / authoritative re-read 失敗時の PENDING → UNPAID revert。 */
export async function revertCheckoutPendingToUnpaid(
  updateMany: PaymentUpdateManyRunner,
  input: {
    entityId: string;
    extraWhere?: Record<string, unknown>;
  },
): Promise<void> {
  await updateMany({
    where: {
      id: input.entityId,
      paymentStatus: PaymentStatus.PENDING,
      ...input.extraWhere,
    },
    data: { paymentStatus: PaymentStatus.UNPAID },
  });
}

/**
 * Checkout Session 作成直後の session id settle。
 * PAID / PARTIALLY_REFUNDED / REFUNDED 到達済みなら count=0（caller が expire + CONFLICT）。
 */
export async function settleCheckoutSessionWrite(
  updateMany: PaymentUpdateManyRunner,
  input: {
    entityId: string;
    sessionId: string;
    extraWhere?: Record<string, unknown>;
    extraData?: Record<string, unknown>;
  },
): Promise<{ settled: boolean }> {
  const result = await updateMany({
    where: {
      id: input.entityId,
      paymentStatus: {
        notIn: [...PAYMENT_STATUSES_TERMINAL_FOR_CHECKOUT_SETTLE],
      },
      ...input.extraWhere,
    },
    data: buildCheckoutSettleUpdateData({
      sessionId: input.sessionId,
      ...(input.extraData !== undefined ? { extra: input.extraData } : {}),
    }),
  });
  return { settled: result.count > 0 };
}

/** settle count=0: orphan session を expire し CONFLICT を throw（二重決済防止）。 */
export async function rejectCheckoutSessionSettle(input: {
  client: AsyncOnlyStripe;
  sessionId: string;
  operation: string;
  logContext: Record<string, string>;
  conflictMessage: string;
}): Promise<never> {
  logError(
    new Error(
      `${input.operation}: session settle rejected (already PAID/REFUNDED)`,
    ),
    {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: input.operation,
        ...input.logContext,
        sessionId: input.sessionId,
      },
    },
  );
  await expireCheckoutSessionWithClientBestEffort({
    client: input.client,
    sessionId: input.sessionId,
    operation: `${input.operation}Expire`,
    context: input.logContext,
  });
  throw new DomainError(input.conflictMessage, "CONFLICT");
}

/** Stripe API / DB write 失敗 catch 節の共有: orphan expire + PENDING revert。 */
export async function handleCheckoutSessionCreateFailure(input: {
  createdSessionId: string | null;
  expireOpenCheckoutSessionBestEffort: (args: {
    sessionId: string;
    context?: Record<string, string>;
  }) => Promise<void>;
  revertPending: () => Promise<void>;
  expireContext: Record<string, string>;
}): Promise<void> {
  if (input.createdSessionId) {
    await input.expireOpenCheckoutSessionBestEffort({
      sessionId: input.createdSessionId,
      context: input.expireContext,
    });
  }
  await input.revertPending();
}
