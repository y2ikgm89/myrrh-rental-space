import "server-only";

import type { Prisma } from "@generated/prisma/client";
import type { AppPrismaClient } from "@/shared/db/prisma";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import {
  acquirePaymentRefundAdvisoryLock,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  PAYMENT_REFUND_TRANSACTION_OPTIONS,
  type PaymentRefundEntityKind,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { getStripeClient, type AsyncOnlyStripe } from "@/shared/lib/stripe";
import type { RefundedByType } from "@/shared/lib/validations/enums/refund-attribution";
import { prisma } from "@/shared/db/prisma";

export type RefundStripeContext = {
  client: AsyncOnlyStripe;
  stripeCurrency: string;
};

export async function resolveRefundStripeContext(): Promise<RefundStripeContext> {
  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }
  return {
    client,
    stripeCurrency: stripeSettings.stripeCurrency,
  };
}

export type AdminRefundPlan = {
  amount: number;
  paymentIntentId: string;
  chargeTotal: number;
  cumulativeSoFar: number;
  newCumulative: number;
  willBeFullyRefunded: boolean;
};

/** advisory lock 内で charge 上限・残額・部分返金額を確定する。 */
export function computeAdminRefundAmount(input: {
  requestedAmount: number | undefined;
  chargeTotal: number;
  cumulativeSoFar: number;
  fullyRefundedMessage: string;
}): Pick<
  AdminRefundPlan,
  "amount" | "cumulativeSoFar" | "newCumulative" | "willBeFullyRefunded"
> {
  const remaining = input.chargeTotal - input.cumulativeSoFar;

  if (remaining <= 0) {
    throw new DomainError(input.fullyRefundedMessage, "VALIDATION");
  }

  const amount = input.requestedAmount ?? remaining;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new DomainError(
      "返金額は 1 円以上の整数で指定してください",
      "VALIDATION",
    );
  }
  if (amount > remaining) {
    throw new DomainError(
      `返金額が残額を超えています (残額: ${remaining} 円)`,
      "VALIDATION",
    );
  }

  const newCumulative = input.cumulativeSoFar + amount;
  return {
    amount,
    cumulativeSoFar: input.cumulativeSoFar,
    newCumulative,
    willBeFullyRefunded: newCumulative === input.chargeTotal,
  };
}

type PaymentRefundTransactionClient = Omit<
  AppPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

export type OrchestrateAdminRefundInput<TResult, TEntityPayload> = {
  entityKind: PaymentRefundEntityKind;
  entityId: string;
  requestedAmount?: number | undefined;
  reason?: string | undefined;
  actorType: RefundedByType;
  idempotencyKeyPrefix: string;
  operation: string;
  savepointName: string;
  stripeContext: RefundStripeContext;
  stripeLogContext: Record<string, string>;
  planInTx: (
    tx: PaymentRefundTransactionClient,
  ) => Promise<AdminRefundPlan & { entityPayload: TEntityPayload }>;
  buildRefundRecord: (args: {
    amount: number;
    stripeRefundId: string;
    reason?: string;
  }) => Prisma.RefundUncheckedCreateInput;
  updatePaymentStatusInTx: (
    tx: PaymentRefundTransactionClient,
    willBeFullyRefunded: boolean,
  ) => Promise<void>;
  buildResult: (args: {
    refundId: string;
    status: string | null;
    plan: AdminRefundPlan;
    entityPayload: TEntityPayload;
  }) => TResult;
};

/**
 * 管理者返金コマンドの共有 orchestration。
 * Phase 1: advisory lock tx で plan 確定 → Phase 2: Stripe API (tx 外) →
 * Phase 3: advisory lock tx で Refund 行 + paymentStatus 更新。
 */
export async function orchestrateAdminRefundCommand<TResult, TEntityPayload>(
  input: OrchestrateAdminRefundInput<TResult, TEntityPayload>,
): Promise<TResult> {
  const planResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      input.entityKind,
      input.entityId,
    );
    return input.planInTx(tx);
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);

  const { entityPayload, ...plan } = planResult;

  const refund = await createStripeRefundOrThrow({
    client: input.stripeContext.client,
    paymentIntentId: plan.paymentIntentId,
    amount: plan.amount,
    stripeCurrency: input.stripeContext.stripeCurrency,
    metadata: {
      initiator: input.actorType,
      ...(input.reason ? { reason: input.reason } : {}),
    },
    idempotencyKey: `${input.idempotencyKeyPrefix}-${plan.newCumulative}`,
    operation: input.operation,
    logContext: input.stripeLogContext,
    userMessage: "返金処理に失敗しました。しばらく経ってからお試しください。",
  });

  return prisma.$transaction(async (tx) => {
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
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );

    await input.updatePaymentStatusInTx(tx, plan.willBeFullyRefunded);

    return input.buildResult({
      refundId: refund.id,
      status: refund.status,
      plan,
      entityPayload,
    });
  }, PAYMENT_REFUND_TRANSACTION_OPTIONS);
}

/** admin refund の paymentStatus updateMany WHERE 述語。 */
export function buildAdminRefundPaymentStatusWhere(): {
  paymentStatus: { in: PaymentStatus[] };
} {
  return {
    paymentStatus: {
      in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
    },
  };
}

/** admin refund の paymentStatus 遷移先。 */
export function resolveAdminRefundPaymentStatus(
  willBeFullyRefunded: boolean,
): typeof PaymentStatus.REFUNDED | typeof PaymentStatus.PARTIALLY_REFUNDED {
  return willBeFullyRefunded
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;
}
