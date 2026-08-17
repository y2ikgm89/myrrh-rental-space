import "server-only";

import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";
import type { RefundedByType } from "@/shared/lib/validations/enums/prisma-types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
  type ErrorSeverity as ErrorSeverityType,
} from "@/shared/lib/errors/server";
import {
  EVENT_REGISTRATION_REFUND_LOCK_NAMESPACE,
  RESERVATION_REFUND_LOCK_NAMESPACE,
} from "@/shared/domain/advisory-lock-namespaces";
import { withStripeConnectionHealth } from "@/shared/domain/settings/connection-health";

/**
 * Payment refund advisory lock namespaces.
 */
export const PAYMENT_REFUND_LOCK_NAMESPACE = {
  reservation: RESERVATION_REFUND_LOCK_NAMESPACE,
  "event-registration": EVENT_REGISTRATION_REFUND_LOCK_NAMESPACE,
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
 * Stripe Refund.status の公式集合。
 *
 * @see https://docs.stripe.com/api/refunds/object#refund_object-status
 */
export const STRIPE_REFUND_STATUSES = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type StripeRefundStatus = (typeof STRIPE_REFUND_STATUSES)[number];

const STRIPE_REFUND_STATUS_SET: ReadonlySet<string> = new Set(
  STRIPE_REFUND_STATUSES,
);

export function isStripeRefundStatus(
  value: unknown,
): value is StripeRefundStatus {
  return typeof value === "string" && STRIPE_REFUND_STATUS_SET.has(value);
}

/**
 * Stripe が返した status だけを通す。欠落・未知値を "pending" に落とさない。
 *
 * admin / auto-cancel 経路は `refunds.create` のあとこの関数で確定してから
 * Refund 行を書く。create は idempotency key 付きなので、ここで throw しても
 * 再実行は同じ Refund を取り直す。
 */
export function requireStripeRefundStatus(
  status: string | null | undefined,
): StripeRefundStatus {
  if (isStripeRefundStatus(status)) return status;
  throw new DomainError(
    "Stripe refund status is missing or unknown",
    "UNEXPECTED",
  );
}

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

/**
 * Stripe Refund.status のうち、**もう非終端へは戻らない**値。
 *
 * `claimRefundSettlement` の冪等性ゲートと
 * `applyConfirmedRefundStatus` の巻き戻し拒否が同じ集合を見る必要があるため、
 * ここを SSoT にする。片方だけ書き換えると、確定済みの返金が再 claim 可能な
 * 状態に戻る。
 */
export const TERMINAL_REFUND_STATUSES = [
  "succeeded",
  "failed",
  "canceled",
] as const satisfies readonly StripeRefundStatus[];

const TERMINAL_REFUND_STATUS_SET: ReadonlySet<string> = new Set(
  TERMINAL_REFUND_STATUSES,
);

export function isTerminalRefundStatus(status: string): boolean {
  return TERMINAL_REFUND_STATUS_SET.has(status);
}

type RefundStatusUpdateClient = {
  refund: {
    updateMany: (args: {
      // Prisma の Input 型と交差させる。「status 列だけ・この 2 条件だけ」という
      // 絞り込みを保ったまま、列名が変わったらコンパイルで落とす。
      where: Prisma.RefundWhereInput & {
        stripeRefundId: string;
        status: string;
      };
      data: Prisma.RefundUncheckedUpdateManyInput & { status: string };
    }) => Promise<{ count: number }>;
  };
};

/**
 * refund.updated / refund.charge.dispute.* webhook からのみ呼ぶ、status 列
 * 限定の確定更新。DB 側の append-only trigger `prevent_refunds_mutation`
 * (SSoT: `prisma/baseline/invariants.sql`) が status 以外の列変更を拒否するため、
 * 他列を書き換える経路は物理的に存在しない。
 *
 * `where.status: "succeeded"` を含めない代わりに現在値を渡し `updateMany` の
 * WHERE claim で「呼び出し元が読んだ状態から動いていない行のみ」に限定する
 * （並行書込との競合を防ぐ）。
 *
 * それとは別に、**終端状態からの巻き戻しを拒否する**。Stripe は refund.updated の
 * 配送順を保証せず、こちら側の dedup も `"retry_unprocessed"` で処理途中に落ちた
 * 古い event の再実行を許すため、`succeeded` 確定後に古い `pending` が届く経路が
 * 実在する。WHERE の現在値一致だけでは通ってしまい、確定済みの行が非終端へ戻る。
 * そうなると `finalizeSettled*Refund` の
 * `aggregate({ where: { status: "succeeded" } })` からその返金額が脱落して
 * **全額返金済みなのに PARTIALLY_REFUNDED で確定し、返金完了メールの金額も過小**に
 * なる。`failed` / `canceled` からの巻き戻しは、手動対応が必要なインシデントの
 * 記録を消してしまう（監査 F-57）。
 *
 * 終端 → 終端（例: `succeeded` → `failed`）は通す。Stripe が後から失敗を確定させる
 * ことはあり、その記録は追随すべきだから。
 *
 * @returns 実際に更新された行数 (0 なら該当行が既に別の状態に確定済み、
 *          巻き戻しとして拒否された、または不在)
 */
export async function applyConfirmedRefundStatus(
  client: RefundStatusUpdateClient,
  stripeRefundId: string,
  previousStatus: string,
  newStatus: string,
): Promise<number> {
  if (
    isTerminalRefundStatus(previousStatus) &&
    !isTerminalRefundStatus(newStatus)
  ) {
    return 0;
  }

  const result = await client.refund.updateMany({
    where: { stripeRefundId, status: previousStatus },
    data: { status: newStatus },
  });
  return result.count;
}

type RefundSettlementClaimClient = {
  refund: {
    updateMany: (args: {
      where: Prisma.RefundWhereInput & {
        stripeRefundId: string;
        status: { notIn: string[] };
      };
      data: Prisma.RefundUncheckedUpdateManyInput & { status: string };
    }) => Promise<{ count: number }>;
  };
};

/**
 * Refund 単位の一度きり claim: status 列を非終端状態 (pending/requires_action)
 * から "succeeded" へ遷移させられた呼び出しだけが count>0 を得る。
 *
 * `finalizeSettledReservationRefund` / `finalizeSettledEventRegistrationRefund`
 * (`reservations` / `events` の payment-queries.ts) が entity 側の
 * paymentStatus 反映と同一 tx 内でこの claim を呼び、返り値の count を唯一の
 * 権威ある冪等性ゲートとして使う。webhook の at-least-once 再配信で同じ refund
 * が何度届いても、2 回目以降はここで count=0 になり早期 return する
 * (Codex review, PR #1666)。
 *
 * この関数を `stripe-refund-orchestration.ts` に置く (呼び出し元の
 * payment-queries.ts に直接書かない) 理由は `applyConfirmedRefundStatus` と同じ:
 * `__tests__/unit/architecture/refund-append-only.test.ts` が Refund の
 * append-only 契約を守るため `events/payment-commands.ts` /
 * `reservations/payment-commands.ts` / `reservations/payment-queries.ts` を
 * 対象に `tx.refund.update*` / `prisma.refund.update*` を grep で 0 件強制する。
 *
 * @returns 実際に更新された行数 (0 なら別配信で処理済み、または既に failed/canceled
 *          確定済み)
 */
export async function claimRefundSettlement(
  tx: RefundSettlementClaimClient,
  stripeRefundId: string,
): Promise<number> {
  const result = await tx.refund.updateMany({
    where: {
      stripeRefundId,
      status: { notIn: [...TERMINAL_REFUND_STATUSES] },
    },
    data: { status: "succeeded" },
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
}): Promise<{ id: string; status: StripeRefundStatus }> {
  try {
    const refund = await withStripeConnectionHealth(() =>
      input.client.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: toStripeUnitAmount(input.amount, input.stripeCurrency),
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    return {
      id: refund.id,
      status: requireStripeRefundStatus(refund.status),
    };
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
 *
 * `status` を型で必須にしている。schema の `@default("succeeded")` に任せると、
 * 未確定 (pending) の返金が「返金済み」として記録され、後続の
 * `claimRefundSettlement` が非終端状態を見つけられず返金完了メールと AuditLog が
 * 丸ごと欠落する（監査 F-54 が実際にこの形で起きた）。既定値へ落ちる経路を
 * コンパイル時に塞ぐ。
 */
export async function createRefundRecordIdempotent(
  tx: RefundTransactionClient,
  savepointName: string,
  data: Prisma.RefundUncheckedCreateInput & { status: StripeRefundStatus },
): Promise<void> {
  const validatedSavepoint = assertValidSavepointName(savepointName);
  try {
    await tx.$executeRawUnsafe(`SAVEPOINT ${validatedSavepoint}`);
    await tx.refund.create({ data });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${validatedSavepoint}`);
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")) {
      throw error;
    }
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${validatedSavepoint}`);
  }
}

export type RefundEntityLookup = {
  status: string;
  reservationId: string | null;
  eventRegistrationId: string | null;
  refundedByType: RefundedByType;
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
