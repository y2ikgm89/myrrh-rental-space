import "server-only";

import type { Prisma } from "@generated/prisma/client";
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

/** Stripe refund tx: advisory lock 保持中に API + DB 書込を行うため長め。 */
export const PAYMENT_REFUND_TRANSACTION_OPTIONS = {
  timeout: 30_000,
  maxWait: 30_000,
} as const;

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
