import "server-only";

import type { Prisma } from "@generated/prisma/client";
import {
  AuditAction,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { DomainError } from "@/shared/domain/domain-error";
import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import {
  acquirePaymentRefundAdvisoryLock,
  buildPaymentRefundIdempotencyKey,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  isRefundSettledSuccess,
  PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS,
  PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS,
  REFUND_AGGREGATE_EXCLUDED_STATUSES,
  resolveRefundAmount,
  type PaymentRefundEntityKind,
  type StripeRefundStatus,
  planAmountMismatchRefund,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { getStripeClient, type AsyncOnlyStripe } from "@/shared/lib/stripe";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import {
  REFUNDED_BY_TYPE,
  type RefundedByType,
} from "@/shared/lib/validations/enums/refund-attribution";

const STRIPE_MISCONFIGURED_MESSAGE =
  "Stripe の設定が正しくありません。管理者にお問い合わせください。";
const MISSING_PAYMENT_INTENT_MESSAGE = "Stripe の決済情報が見つかりません";
const REFUND_PERSIST_CONFLICT_MESSAGE =
  "返金処理中に状態が変更されました。管理者に連絡してください。";
const ADMIN_REFUND_FAILED_MESSAGE =
  "返金処理に失敗しました。しばらく経ってからお試しください。";
const ORPHAN_CANCEL_REFUND_FAILED_MESSAGE =
  "キャンセル後の自動返金に失敗しました";
const AMOUNT_MISMATCH_REFUND_FAILED_MESSAGE =
  "金額不一致の自動返金に失敗しました";

export type PaymentRefundEntityFk =
  { readonly reservationId: string } | { readonly eventRegistrationId: string };

export type AdminPaymentRefundResult = {
  refundId: string;
  status: StripeRefundStatus;
  newPaymentStatus:
    typeof PaymentStatus.PARTIALLY_REFUNDED | typeof PaymentStatus.REFUNDED;
  isSettled: boolean;
  cumulativeAmount: number;
  refundAmount: number;
};

export type AutoRefundCommandOutcome = {
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
};

/**
 * 金額不一致の自動返金だけが持つ追加の結末（監査 A-27）。
 *
 * Stripe が実際に取った額が、こちらの台帳に記録できる上限
 * （`chargeBase - 既存返金合計`）を超えているケース。orphan cancel や
 * waitlist offer の自動返金では起こらないので、共有の
 * `AutoRefundCommandOutcome` は広げない。
 */
export type AmountMismatchRefundOutcome =
  | AutoRefundCommandOutcome
  | {
      outcome: "amount_exceeds_recordable";
      /** 台帳に記録できる上限（`chargeBase - 既存返金合計`）。 */
      recordableAmount: number;
    };

export type AutoRefundInspectResult =
  | { readonly action: "not_applicable" }
  | { readonly action: "already_refunded" }
  | { readonly action: "continue"; readonly chargeTotal: number };

export type AmountMismatchInspectResult =
  | { readonly action: "not_applicable" }
  | { readonly action: "already_refunded" }
  | {
      readonly action: "continue";
      /**
       * この entity の課金基準額。DB の `refunds_total_within_paid_check`
       * （`invariants.sql`）が返金合計の上限として見る値と同じもの
       * （Reservation は `totalPriceWithTax`、EventRegistration は `paidAmount`）。
       *
       * `null` は「基準額が未記録」= trigger 側も `paid IS NOT NULL` で
       * skip する状態。頭打ちの判定も行わない。
       */
      readonly chargeBase: number | null;
    };

type RefundCommandTx = Prisma.TransactionClient;

type AdminRefundPrepared<TExtra extends object> = {
  amount: number;
  cumulativeSoFar: number;
  newCumulative: number;
  willBeFullyRefunded: boolean;
  paymentIntentId: string;
  idempotencyKey: string;
  extra: TExtra;
};

async function requireStripeRefundClient(): Promise<{
  client: AsyncOnlyStripe;
  stripeCurrency: string;
}> {
  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(STRIPE_MISCONFIGURED_MESSAGE, "VALIDATION");
  }
  return { client, stripeCurrency: stripeSettings.stripeCurrency };
}

async function sumCountableRefunds(
  tx: RefundCommandTx,
  fk: PaymentRefundEntityFk,
  options?: { readonly excludeRefundedByType: RefundedByType },
): Promise<number> {
  const aggregate = await tx.refund.aggregate({
    where: {
      ...fk,
      status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      ...(options === undefined
        ? {}
        : { refundedByType: { not: options.excludeRefundedByType } }),
    },
    _sum: { amount: true },
  });
  return aggregate._sum.amount ?? 0;
}

function auditRequestMetadata(request?: {
  ip: string | null;
  userAgent: string | null;
}): { ip?: string; userAgent?: string } {
  return {
    ...(request?.ip != null ? { ip: request.ip } : {}),
    ...(request?.userAgent != null ? { userAgent: request.userAgent } : {}),
  };
}

/**
 * Admin 返金の 3-phase 骨格（prepare tx → Stripe I/O → persist tx → audit）。
 * Reservation / EventRegistration は find・FK・paymentStatus 更新だけ差し替える。
 */
export async function runAdminPaymentRefundCommand<
  TExtra extends object,
>(input: {
  kind: PaymentRefundEntityKind;
  entityId: string;
  requestedAmount?: number;
  reason?: string;
  actorType: RefundedByType;
  actorUserId?: string;
  request?: { ip: string | null; userAgent: string | null };
  operation: string;
  logContext: Record<string, string>;
  resource: string;
  savepointName: string;
  idempotencyPrefix: "reservation-refund" | "event-registration-refund";
  messages: {
    notFound: string;
    notRefundable: string;
    missingCharge: string;
    fullyRefunded: string;
  };
  refundFk: PaymentRefundEntityFk;
  findEntity: (tx: RefundCommandTx) => Promise<{
    paymentStatus: PaymentStatus;
    stripePaymentIntentId: string | null;
    chargeTotal: number | null;
    extra: TExtra;
  } | null>;
  persistPaymentStatus: (
    tx: RefundCommandTx,
    newStatus:
      typeof PaymentStatus.REFUNDED | typeof PaymentStatus.PARTIALLY_REFUNDED,
  ) => Promise<void>;
}): Promise<AdminPaymentRefundResult & TExtra> {
  const { client, stripeCurrency } = await requireStripeRefundClient();
  const { reason, actorType, actorUserId, request } = input;

  const prepared = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, input.kind, input.entityId);

    const entity = await input.findEntity(tx);
    if (!entity) {
      throw new DomainError(input.messages.notFound, "NOT_FOUND");
    }

    if (
      entity.paymentStatus !== PaymentStatus.PAID &&
      entity.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new DomainError(input.messages.notRefundable, "VALIDATION");
    }

    if (!entity.stripePaymentIntentId) {
      throw new DomainError(MISSING_PAYMENT_INTENT_MESSAGE, "VALIDATION");
    }

    if (entity.chargeTotal === null || entity.chargeTotal <= 0) {
      throw new DomainError(input.messages.missingCharge, "VALIDATION");
    }

    const cumulativeSoFar = await sumCountableRefunds(tx, input.refundFk);
    const excludedAttemptCount = await tx.refund.count({
      where: {
        ...input.refundFk,
        status: { in: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      },
    });

    const resolved = resolveRefundAmount({
      chargeTotal: entity.chargeTotal,
      cumulativeSoFar,
      ...(input.requestedAmount !== undefined
        ? { requestedAmount: input.requestedAmount }
        : {}),
      fullyRefundedMessage: input.messages.fullyRefunded,
    });

    return {
      amount: resolved.amount,
      cumulativeSoFar: resolved.cumulativeSoFar,
      newCumulative: resolved.newCumulative,
      willBeFullyRefunded: resolved.willBeFullyRefunded,
      paymentIntentId: entity.stripePaymentIntentId,
      extra: entity.extra,
      idempotencyKey: buildPaymentRefundIdempotencyKey({
        prefix: input.idempotencyPrefix,
        entityId: input.entityId,
        newCumulative: resolved.newCumulative,
        excludedAttemptCount,
      }),
    } satisfies AdminRefundPrepared<TExtra>;
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: prepared.paymentIntentId,
    amount: prepared.amount,
    stripeCurrency,
    metadata: {
      initiator: actorType,
      ...(reason ? { reason } : {}),
    },
    idempotencyKey: prepared.idempotencyKey,
    operation: input.operation,
    logContext: input.logContext,
    userMessage: ADMIN_REFUND_FAILED_MESSAGE,
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, input.kind, input.entityId);

    const cumulativeSoFar = await sumCountableRefunds(tx, input.refundFk);
    if (cumulativeSoFar !== prepared.cumulativeSoFar) {
      throw new DomainError(REFUND_PERSIST_CONFLICT_MESSAGE, "CONFLICT");
    }

    const isSettled = isRefundSettledSuccess(refund.status);

    await createRefundRecordIdempotent(tx, input.savepointName, {
      ...input.refundFk,
      amount: prepared.amount,
      ...(reason ? { reason } : {}),
      stripeRefundId: refund.id,
      refundedByType: actorType,
      status: refund.status,
    });

    // 非同期返金が未確定の間は paymentStatus を書き換えない。
    if (isSettled) {
      await input.persistPaymentStatus(
        tx,
        prepared.willBeFullyRefunded
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
      );
    }

    return {
      refundId: refund.id,
      status: refund.status,
      newPaymentStatus: prepared.willBeFullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED,
      isSettled,
      cumulativeAmount: prepared.newCumulative,
      refundAmount: prepared.amount,
      ...prepared.extra,
    };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  await createAuditLogRecord({
    ...(actorUserId ? { userId: actorUserId } : {}),
    action: AuditAction.UPDATE,
    resource: input.resource,
    resourceId: input.entityId,
    newValue: result.isSettled
      ? {
          paymentStatus: result.newPaymentStatus,
          refundedAmount: result.cumulativeAmount,
        }
      : { refundStatus: result.status },
    metadata: {
      actorType,
      refundAmount: result.refundAmount,
      cumulativeAmount: result.cumulativeAmount,
      stripeRefundId: result.refundId,
      isSettled: result.isSettled,
      ...(reason ? { reason } : {}),
      ...auditRequestMetadata(request),
    },
  });

  return result;
}

/**
 * キャンセル済み entity への captured orphan を自動返金する 3-phase 骨格。
 */
export async function runOrphanCancelRefundCommand(input: {
  kind: PaymentRefundEntityKind;
  entityId: string;
  stripePaymentIntentId: string;
  reason: string;
  operation: string;
  logContext: Record<string, string>;
  resource: string;
  savepointName: string;
  idempotencyKey: (chargeTotal: number, excludedAttemptCount: number) => string;
  refundFk: PaymentRefundEntityFk;
  inspectEntity: (tx: RefundCommandTx) => Promise<AutoRefundInspectResult>;
  markAlreadyRefunded: (
    tx: RefundCommandTx,
    paymentIntentId: string,
  ) => Promise<void>;
  persistSettledRefund: (
    tx: RefundCommandTx,
    paymentIntentId: string,
  ) => Promise<void>;
}): Promise<AutoRefundCommandOutcome> {
  const { client, stripeCurrency } = await requireStripeRefundClient();
  const paymentIntentId = input.stripePaymentIntentId;

  const prepareResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, input.kind, input.entityId);

    const inspected = await input.inspectEntity(tx);
    if (inspected.action !== "continue") {
      return { outcome: inspected.action } as const;
    }

    const cumulativeSoFar = await sumCountableRefunds(tx, input.refundFk);
    const remaining = inspected.chargeTotal - cumulativeSoFar;
    const excludedAttemptCount = await tx.refund.count({
      where: {
        ...input.refundFk,
        status: { in: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      },
    });

    if (remaining <= 0) {
      await input.markAlreadyRefunded(tx, paymentIntentId);
      return { outcome: "already_refunded" as const };
    }

    return {
      outcome: "stripe_refund" as const,
      amount: remaining,
      cumulativeSoFar,
      paymentIntentId,
      idempotencyKey: input.idempotencyKey(
        inspected.chargeTotal,
        excludedAttemptCount,
      ),
    };
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  if (prepareResult.outcome !== "stripe_refund") {
    return prepareResult;
  }

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: prepareResult.paymentIntentId,
    amount: prepareResult.amount,
    stripeCurrency,
    metadata: {
      initiator: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
      reason: input.reason,
    },
    idempotencyKey: prepareResult.idempotencyKey,
    operation: input.operation,
    logContext: {
      ...input.logContext,
      stripePaymentIntentId: prepareResult.paymentIntentId,
    },
    userMessage: ORPHAN_CANCEL_REFUND_FAILED_MESSAGE,
    severity: ErrorSeverity.CRITICAL,
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, input.kind, input.entityId);

    const cumulativeSoFar = await sumCountableRefunds(tx, input.refundFk);
    if (cumulativeSoFar !== prepareResult.cumulativeSoFar) {
      throw new DomainError(REFUND_PERSIST_CONFLICT_MESSAGE, "CONFLICT");
    }

    await createRefundRecordIdempotent(tx, input.savepointName, {
      ...input.refundFk,
      amount: prepareResult.amount,
      reason: input.reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
      status: refund.status,
    });

    if (isRefundSettledSuccess(refund.status)) {
      await input.persistSettledRefund(tx, prepareResult.paymentIntentId);
    }

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: prepareResult.amount,
    };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: input.resource,
      resourceId: input.entityId,
      metadata: {
        operation: input.operation,
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        reason: input.reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}

/**
 * Checkout amount_total 不一致で fulfill できなかった captured payment の自動返金。
 */
export async function runAmountMismatchRefundCommand(input: {
  kind: PaymentRefundEntityKind;
  entityId: string;
  stripePaymentIntentId: string;
  capturedAppAmount: number;
  reason: string;
  operation: string;
  logContext: Record<string, string>;
  resource: string;
  savepointName: string;
  idempotencyKey: string;
  refundFk: PaymentRefundEntityFk;
  inspectEntity: (tx: RefundCommandTx) => Promise<AmountMismatchInspectResult>;
  persistSettledRefund: (tx: RefundCommandTx) => Promise<void>;
}): Promise<AmountMismatchRefundOutcome> {
  if (input.capturedAppAmount <= 0) {
    return { outcome: "not_applicable" };
  }

  const { client, stripeCurrency } = await requireStripeRefundClient();

  const prepareResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, input.kind, input.entityId);

    const inspected = await input.inspectEntity(tx);
    if (inspected.action !== "continue") {
      return { outcome: inspected.action } as const;
    }

    // 台帳に記録できる上限を、他の 2 経路と同じく advisory lock 内で確定する
    // （監査 A-27）。ここを見ずに Stripe の captured 額をそのまま書くと、
    // `refunds_total_within_paid_check`（DEFERRABLE INITIALLY DEFERRED）が
    // COMMIT 時に落として tx 全体が abort する。savepoint では捕まらない。
    // その結果 Refund 行も監査ログも管理者通知も残らず、webhook は 500 を返して
    // Stripe が最大 3 日間再送し続ける（同じ idempotencyKey で同じ違反を繰り返す）。
    // **この経路自身が書いた行は数えない。** idempotencyKey は entity ごとに 1 本
    // （`reservation-amount-mismatch-refund-${id}`）なので、AUTO_AMOUNT_MISMATCH の
    // 既存行があればそれは「同じ返金」であって追加分ではない。webhook が先に
    // Refund を記録してからこのコマンドが走る競合（`auto-refund-writes-refund-row`
    // の重複 stripeRefundId ケース）で、自分の行を二重計上して誤って見送るのを防ぐ。
    const plan = planAmountMismatchRefund({
      capturedAppAmount: input.capturedAppAmount,
      chargeBase: inspected.chargeBase,
      cumulativeSoFar:
        inspected.chargeBase === null
          ? 0
          : await sumCountableRefunds(tx, input.refundFk, {
              excludeRefundedByType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
            }),
    });
    if (plan.kind === "exceeds_recordable") {
      return {
        outcome: "amount_exceeds_recordable" as const,
        recordableAmount: plan.recordableAmount,
      };
    }

    return { outcome: "stripe_refund" as const };
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  if (prepareResult.outcome === "amount_exceeds_recordable") {
    // **Stripe への返金はしない。** 自分の台帳に書けない額を返金すると、
    // 「返金した事実がアプリに残らない」状態を意図的に作ることになる。
    // 人が Stripe ダッシュボードで判断できるよう CRITICAL で残す。
    logError(
      new Error(
        "Amount-mismatch auto refund skipped: captured amount exceeds recordable refund total",
      ),
      {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.CRITICAL,
        context: {
          ...input.logContext,
          operation: input.operation,
          capturedAppAmount: input.capturedAppAmount,
          recordableAmount: prepareResult.recordableAmount,
          stripePaymentIntentId: input.stripePaymentIntentId,
        },
      },
    );
    return prepareResult;
  }

  if (prepareResult.outcome !== "stripe_refund") {
    return prepareResult;
  }

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: input.stripePaymentIntentId,
    amount: input.capturedAppAmount,
    stripeCurrency,
    metadata: {
      initiator: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
      reason: input.reason,
    },
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    logContext: input.logContext,
    userMessage: AMOUNT_MISMATCH_REFUND_FAILED_MESSAGE,
    severity: ErrorSeverity.CRITICAL,
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, input.kind, input.entityId);

    await createRefundRecordIdempotent(tx, input.savepointName, {
      ...input.refundFk,
      amount: input.capturedAppAmount,
      reason: input.reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
      status: refund.status,
    });

    if (isRefundSettledSuccess(refund.status)) {
      await input.persistSettledRefund(tx);
    }

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: input.capturedAppAmount,
    };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: input.resource,
      resourceId: input.entityId,
      metadata: {
        operation: input.operation,
        actorType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
        reason: input.reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
