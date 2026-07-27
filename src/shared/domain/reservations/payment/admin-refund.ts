import "server-only";

import {
  AuditAction,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  buildAdminRefundPaymentStatusWhere,
  computeAdminRefundAmount,
  orchestrateAdminRefundCommand,
  resolveAdminRefundPaymentStatus,
  resolveRefundStripeContext,
} from "@/shared/domain/payment/refund-command-orchestration";
import type { RefundedByType } from "@/shared/lib/validations/enums/refund-attribution";

export interface RefundReservationInput {
  reservationId: string;
  /**
   * 部分返金額 (円、正整数)。未指定なら残額全額 (totalPrice - Σrefunds.amount)。
   * `1 <= amount <= remaining` を violation すると VALIDATION エラー。
   */
  amount?: number;
  /**
   * 管理者入力の理由。Refund.reason に保存し、AuditLog metadata・顧客通知メール文面
   * (task #9 PR#4 で連動) にも流す。
   */
  reason?: string;
  /**
   * 「誰が」返金を主導したか。DB 側 CHECK 制約 `refunds_refundedByType_check` と
   * application 側 helper (`REFUNDED_BY_TYPE`) の両方で強制する二重防御の一部。
   */
  actorType: RefundedByType;
  /**
   * AuditLog.userId に書く。ADMIN 経路は admin userId、AUTO_ON_CANCEL では null (system 起動)。
   */
  actorUserId?: string;
  /**
   * UA-HORIZ-04: リクエスト由来のフォレンジック context。admin action は
   * `buildAuditRequestContext()` から取得して渡す。AUTO_ON_CANCEL / webhook 経路は
   * `undefined` で呼び出し可 (metadata に ip/userAgent キーは付かない)。
   */
  request?: { ip: string | null; userAgent: string | null };
}

export interface RefundReservationResult {
  refundId: string;
  status: string | null;
  customerId: string;
  newPaymentStatus:
    typeof PaymentStatus.PARTIALLY_REFUNDED | typeof PaymentStatus.REFUNDED;
  /** 累積返金額 (今回の refund を含めた合計、円) */
  cumulativeAmount: number;
  /** 今回 refund した金額 (円) */
  refundAmount: number;
}

/**
 * Reservation の返金 (部分返金対応、Stripe idempotent、Refund child table + AuditLog 書込)。
 *
 * ## 契約
 * - `paymentStatus` が `PAID` または `PARTIALLY_REFUNDED` の予約のみ返金可能
 * - `amount` 未指定 → 残額全額 (`totalPrice - Σ既 refunds.amount`)
 * - 累積返金額が `totalPrice` (charge 額) に到達したら `REFUNDED`、未満なら `PARTIALLY_REFUNDED`
 * - Stripe idempotency key = `reservation-refund-{reservationId}-{newCumulative}` で
 *   2 回目以降の部分返金でも unique になり、accidental retry (network glitch 等) は
 *   同一 amount + 同一 newCumulative で idempotent (safe)
 *
 * ## 並行制御
 * - Phase 1 / 3 の interactive tx 冒頭で `pg_advisory_xact_lock` を取得し、
 *   同一予約への concurrent refund を直列化する (over-refund 防止)
 * - Stripe API 呼び出しは advisory lock tx の外で行う (checkout create と同型)
 *
 * ## Belt-and-suspenders
 * - Stripe refund 成功後、`Refund.stripeRefundId @unique` により二重 insert は DB 側で reject。
 *   webhook (charge.refunded) が同一 stripeRefundId を先に書いた場合は skip (idempotent)。
 *
 * @throws DomainError NOT_FOUND / VALIDATION / UNEXPECTED
 */
export async function refundReservationPaymentCommand(
  input: RefundReservationInput,
): Promise<RefundReservationResult> {
  const {
    reservationId,
    amount: requestedAmount,
    reason,
    actorType,
    actorUserId,
    request,
  } = input;

  const stripeContext = await resolveRefundStripeContext();

  const result = await orchestrateAdminRefundCommand<
    RefundReservationResult,
    { customerId: string }
  >({
    entityKind: "reservation",
    entityId: reservationId,
    requestedAmount,
    reason,
    actorType,
    idempotencyKeyPrefix: `reservation-refund-${reservationId}`,
    operation: "refundReservationPayment",
    savepointName: "refund_create_reservation",
    stripeContext,
    stripeLogContext: { reservationId },
    planInTx: async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          id: true,
          customerId: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          totalPriceWithTax: true,
        },
      });

      if (!reservation) {
        throw new DomainError("予約が見つかりません", "NOT_FOUND");
      }

      if (
        reservation.paymentStatus !== PaymentStatus.PAID &&
        reservation.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new DomainError(
          "支払い済み・一部返金済みの予約のみ返金できます",
          "VALIDATION",
        );
      }

      if (!reservation.stripePaymentIntentId) {
        throw new DomainError(
          "Stripe の決済情報が見つかりません",
          "VALIDATION",
        );
      }

      if (
        reservation.totalPriceWithTax === null ||
        reservation.totalPriceWithTax <= 0
      ) {
        throw new DomainError(
          "料金が設定されていない予約は返金できません",
          "VALIDATION",
        );
      }

      const aggregate = await tx.refund.aggregate({
        where: { reservationId },
        _sum: { amount: true },
      });
      const cumulativeSoFar = aggregate._sum.amount ?? 0;
      const amountPlan = computeAdminRefundAmount({
        requestedAmount,
        chargeTotal: reservation.totalPriceWithTax,
        cumulativeSoFar,
        fullyRefundedMessage: "この予約は既に全額返金済みです",
      });

      return {
        ...amountPlan,
        paymentIntentId: reservation.stripePaymentIntentId,
        chargeTotal: reservation.totalPriceWithTax,
        entityPayload: { customerId: reservation.customerId },
      };
    },
    buildRefundRecord: ({ amount, stripeRefundId, reason: refundReason }) => ({
      reservationId,
      amount,
      ...(refundReason ? { reason: refundReason } : {}),
      stripeRefundId,
      refundedByType: actorType,
    }),
    updatePaymentStatusInTx: async (tx, willBeFullyRefunded) => {
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          ...buildAdminRefundPaymentStatusWhere(),
        },
        data: {
          paymentStatus: resolveAdminRefundPaymentStatus(willBeFullyRefunded),
        },
      });
    },
    buildResult: ({ refundId, status, plan, entityPayload }) => ({
      refundId,
      status,
      customerId: entityPayload.customerId,
      newPaymentStatus: resolveAdminRefundPaymentStatus(
        plan.willBeFullyRefunded,
      ),
      cumulativeAmount: plan.newCumulative,
      refundAmount: plan.amount,
    }),
  });

  // AuditLog (tx 外、hash-chain の write は独立)
  await createAuditLogRecord({
    ...(actorUserId ? { userId: actorUserId } : {}),
    action: AuditAction.UPDATE,
    resource: "reservation",
    resourceId: reservationId,
    newValue: {
      paymentStatus: result.newPaymentStatus,
      refundedAmount: result.cumulativeAmount,
    },
    metadata: {
      actorType,
      refundAmount: result.refundAmount,
      cumulativeAmount: result.cumulativeAmount,
      stripeRefundId: result.refundId,
      ...(reason ? { reason } : {}),
      ...(request?.ip != null ? { ip: request.ip } : {}),
      ...(request?.userAgent != null ? { userAgent: request.userAgent } : {}),
    },
  });

  return result;
}
