import "server-only";

import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
  type ErrorSeverity as ErrorSeverityType,
} from "@/shared/lib/errors/server";

/**
 * Payment refund advisory lock namespaces.
 * `.claude/rules/db-domain.md` registry と一致。
 */
export const PAYMENT_REFUND_LOCK_NAMESPACE = {
  reservation: 728355,
  "event-registration": 728356,
} as const;

export type PaymentRefundEntityKind =
  keyof typeof PAYMENT_REFUND_LOCK_NAMESPACE;

/** Phase A: lock + validate + amount resolution（Stripe I/O なし）。 */
export const PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS = {
  timeout: 5_000,
  maxWait: 5_000,
} as const;

/** Phase C: lock + Refund insert + paymentStatus 更新（Stripe I/O なし）。 */
export const PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS = {
  timeout: 10_000,
  maxWait: 10_000,
} as const;

/** @deprecated 3 フェーズ分割後は PREPARE / PERSIST を使用。 */
export const PAYMENT_REFUND_TRANSACTION_OPTIONS =
  PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS;

export type ResolvedRefundAmount = {
  readonly amount: number;
  readonly cumulativeSoFar: number;
  readonly newCumulative: number;
  readonly willBeFullyRefunded: boolean;
};

/**
 * 返金額を advisory lock 内で確定する（charge 上限・部分返金・残額全額）。
 *
 * @throws DomainError VALIDATION
 */
export function resolveRefundAmount(input: {
  readonly chargeTotal: number;
  readonly cumulativeSoFar: number;
  readonly requestedAmount?: number;
  readonly fullyRefundedMessage: string;
}): ResolvedRefundAmount {
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

const SAVEPOINT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

type RefundTransactionClient = {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  $executeRawUnsafe: (query: string) => Promise<unknown>;
  refund: {
    create: (args: {
      data: Prisma.RefundUncheckedCreateInput;
    }) => Promise<unknown>;
  };
};

/**
 * Stripe Refund.status のうち、返金が確定的に完了したとみなせる値。
 *
 * カード等の同期的な決済手段は `refunds.create()` のレスポンス時点で既に
 * "succeeded" を返す。konbini / customer_balance 等の非同期決済手段は
 * "pending"（まれに "requires_action"）を返し、Stripe が最大45日かけて
 * 後日 "succeeded" または "failed"/"canceled" を確定させる
 * (refund.updated webhook で通知)。"succeeded" 以外の状態で
 * paymentStatus を REFUNDED 確定・返金完了メール送信をしてはならない。
 *
 * @see https://docs.stripe.com/refunds#failed-refunds
 */
export function isRefundSettledSuccess(status: string | null): boolean {
  return status === "succeeded";
}

type RefundStatusUpdateClient = {
  refund: {
    updateMany: (args: {
      where: { stripeRefundId: string; status: string };
      data: { status: string };
    }) => Promise<{ count: number }>;
  };
};

/**
 * refund.updated / refund.charge.dispute.* webhook からのみ呼ぶ、status 列
 * 限定の確定更新。DB 側の append-only trigger
 * (20260730115734_refunds_status_column_and_transition_exception) が
 * status 以外の列変更を拒否するため、他列を書き換える経路は物理的に存在しない。
 *
 * `where.status: "succeeded"` を含めない代わりに現在値を渡し `updateMany` の
 * WHERE claim で「まだ確定していない行のみ」に限定する（既に "succeeded" /
 * "failed" 等に確定済みの行を webhook の再送・順序前後で誤って再書込みしない）。
 *
 * @returns 実際に更新された行数 (0 なら該当行が既に別の状態に確定済み、または不在)
 */
export async function applyConfirmedRefundStatus(
  client: RefundStatusUpdateClient,
  stripeRefundId: string,
  previousStatus: string,
  newStatus: string,
): Promise<number> {
  const result = await client.refund.updateMany({
    where: { stripeRefundId, status: previousStatus },
    data: { status: newStatus },
  });
  return result.count;
}

function assertValidSavepointName(name: string): string {
  if (!SAVEPOINT_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid savepoint name: ${name}`);
  }
  return name;
}

export async function acquirePaymentRefundAdvisoryLock(
  tx: RefundTransactionClient,
  entityKind: PaymentRefundEntityKind,
  entityId: string,
): Promise<void> {
  const namespace = PAYMENT_REFUND_LOCK_NAMESPACE[entityKind];
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${namespace}::int4, hashtext(${entityId}))`;
}

export async function createStripeRefundOrThrow(input: {
  client: AsyncOnlyStripe;
  paymentIntentId: string;
  amount: number;
  stripeCurrency: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
  operation: string;
  logContext: Record<string, string>;
  userMessage: string;
  severity?: ErrorSeverityType;
}): Promise<{ id: string; status: string | null }> {
  try {
    const refund = await input.client.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: toStripeUnitAmount(input.amount, input.stripeCurrency),
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: refund.id, status: refund.status ?? null };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: input.severity ?? ErrorSeverity.HIGH,
      context: { operation: input.operation, ...input.logContext },
    });
    throw new DomainError(input.userMessage, "UNEXPECTED");
  }
}

/**
 * Refund 行 insert の belt-and-suspenders パターン。
 * webhook 先着 race で `stripeRefundId` unique 衝突時は savepoint rollback して tx 継続。
 */
export async function createRefundRecordIdempotent(
  tx: RefundTransactionClient,
  savepointName: string,
  data: Prisma.RefundUncheckedCreateInput,
): Promise<void> {
  const validatedSavepoint = assertValidSavepointName(savepointName);
  try {
    await tx.$executeRawUnsafe(`SAVEPOINT ${validatedSavepoint}`);
    await tx.refund.create({ data });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${validatedSavepoint}`);
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error, "stripeRefundId")) {
      throw error;
    }
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${validatedSavepoint}`);
  }
}

export type RefundEntityLookup = {
  status: string;
  reservationId: string | null;
  eventRegistrationId: string | null;
  refundedByType: string;
};

/**
 * refund.updated / refund.failed webhook が、対象 Refund 行がどちらのドメイン
 * (Reservation / EventRegistration) に属するか、現在の確定前 status、および
 * どの経路が作成したか (`refundedByType`) を引くための lookup。
 * `refundedByType` は finalize 側が「ADMIN(部分返金対応、累積額から
 * 全額/一部を判定) か AUTO_*(常に単発全額、任意の未確定状態から REFUNDED へ)か」
 * を分岐するために使う。stripeRefundId が repo に存在しない場合
 * (別環境の Stripe イベント誤配送等) は null を返す。
 */
export async function findRefundEntityByStripeRefundId(
  stripeRefundId: string,
): Promise<RefundEntityLookup | null> {
  const refund = await prisma.refund.findUnique({
    where: { stripeRefundId },
    select: {
      status: true,
      reservationId: true,
      eventRegistrationId: true,
      refundedByType: true,
    },
  });
  return refund;
}

/**
 * 返金可能残額の集計 (`resolveRefundAmount` の `cumulativeSoFar` 等) から
 * 除外すべき Refund.status。"failed"/"canceled" は Stripe 側で実際には資金移動が
 * 発生しなかった試行であり、これを合算すると (a) 実際より過大な累積返金額と
 * 誤認し新規返金申請を不当に拒否する、(b) auto-refund 系の
 * `remaining <= 0` 早期終了チェックが失敗試行のみで満たされ、実際は無返金の
 * まま paymentStatus=REFUNDED に遷移する、という 2 種の実害を招く
 * (Codex review, PR #1665)。"pending"/"requires_action" は集計に含める
 * (確定前でも二重返金防止のため予約済み残高として扱う必要があるため)。
 */
export const REFUND_AGGREGATE_EXCLUDED_STATUSES = [
  "failed",
  "canceled",
] as const;
