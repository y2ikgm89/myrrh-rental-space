import "server-only";

import type { Prisma } from "@generated/prisma/client";
import type { AppPrismaClient } from "@/shared/db/prisma";
import { prisma } from "@/shared/db/prisma";
import type { RefundStripeContext } from "@/shared/domain/payment/refund-command-orchestration";
import {
  acquirePaymentRefundAdvisoryLock,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  PAYMENT_REFUND_TRANSACTION_OPTIONS,
  type PaymentRefundEntityKind,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import {
  ErrorSeverity,
  type ErrorSeverity as ErrorSeverityType,
} from "@/shared/lib/errors/server";
import type { RefundedByType } from "@/shared/lib/validations/enums/refund-attribution";

export type AutoRefundCommandResult = {
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
};

type PaymentRefundTransactionClient = Omit<
  AppPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/**
 * Phase A の結果。
 * - `terminal`: Phase A 内で完了（skip / remaining=0 の status close）
 * - `refund`: Phase B で Stripe、Phase C で Refund 行 + status 更新
 */
export type AutoRefundPlan =
  | { kind: "terminal"; result: AutoRefundCommandResult }
  | {
      kind: "refund";
      amount: number;
      paymentIntentId: string;
      /** Stripe idempotency key（lock 内で確定した charge 額等を含められる） */
      idempotencyKey: string;
    };

export type OrchestrateAutoRefundInput = {
  entityKind: PaymentRefundEntityKind;
  entityId: string;
  stripeContext: RefundStripeContext;
  actorType: RefundedByType;
  reason: string;
  operation: string;
  savepointName: string;
  userMessage: string;
  stripeLogContext: Record<string, string>;
  severity?: ErrorSeverityType;
  planInTx: (tx: PaymentRefundTransactionClient) => Promise<AutoRefundPlan>;
  buildRefundRecord: (args: {
    amount: number;
    stripeRefundId: string;
  }) => Prisma.RefundUncheckedCreateInput;
  finalizeInTx: (
    tx: PaymentRefundTransactionClient,
    args: {
      amount: number;
      stripeRefundId: string;
      paymentIntentId: string;
    },
  ) => Promise<void>;
};

/**
 * Orphan / mismatch / capacity 自動返金の共有 orchestration。
 * Phase A: advisory lock tx で plan 確定 → Phase B: Stripe API (tx 外) →
 * Phase C: advisory lock tx で Refund 行 + paymentStatus 更新。
 */
export async function orchestrateAutoRefundCommand(
  input: OrchestrateAutoRefundInput,
): Promise<AutoRefundCommandResult> {
  const plan = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      input.entityKind,
      input.entityId,
    );
    return input.planInTx(tx);
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);

  if (plan.kind === "terminal") {
    return plan.result;
  }

  const refund = await createStripeRefundOrThrow({
    client: input.stripeContext.client,
    paymentIntentId: plan.paymentIntentId,
    amount: plan.amount,
    stripeCurrency: input.stripeContext.stripeCurrency,
    metadata: {
      initiator: input.actorType,
      reason: input.reason,
    },
    idempotencyKey: plan.idempotencyKey,
    operation: input.operation,
    logContext: input.stripeLogContext,
    userMessage: input.userMessage,
    severity: input.severity ?? ErrorSeverity.CRITICAL,
  });

  await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      input.entityKind,
      input.entityId,
    );

    await createRefundRecordIdempotent(
      tx,
      input.savepointName,
      input.buildRefundRecord({
        amount: plan.amount,
        stripeRefundId: refund.id,
      }),
    );

    await input.finalizeInTx(tx, {
      amount: plan.amount,
      stripeRefundId: refund.id,
      paymentIntentId: plan.paymentIntentId,
    });
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);

  return {
    outcome: "refunded",
    refundId: refund.id,
    refundAmount: plan.amount,
  };
}
