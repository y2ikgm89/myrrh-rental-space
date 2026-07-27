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

export interface RefundEventRegistrationInput {
  registrationId: string;
  /**
   * 部分返金額 (円、正整数)。未指定なら残額全額 (paidAmount - Σrefunds.amount)。
   */
  amount?: number;
  /**
   * 管理者入力の理由。Refund.reason に保存し、AuditLog metadata にも流す。
   */
  reason?: string;
  /**
   * 「誰が」返金を主導したか。DB CHECK 制約と application 側 enum で二重防御。
   */
  actorType: RefundedByType;
  /**
   * AuditLog.userId に書く。ADMIN 経路は admin userId、AUTO_ON_CANCEL / STRIPE_DASHBOARD は
   * null (system / 外部起動)。
   */
  actorUserId?: string;
  /**
   * UA-HORIZ-04: リクエスト由来のフォレンジック context。admin action は
   * `buildAuditRequestContext()` から取得して渡す。webhook / system 起動経路は
   * `undefined` で呼び出し可 (metadata に ip/userAgent キーは付かない)。
   */
  request?: { ip: string | null; userAgent: string | null };
}

export interface RefundEventRegistrationResult {
  refundId: string;
  status: string | null;
  newPaymentStatus:
    typeof PaymentStatus.PARTIALLY_REFUNDED | typeof PaymentStatus.REFUNDED;
  /** 累積返金額 (今回の refund を含めた合計、円) */
  cumulativeAmount: number;
  /** 今回 refund した金額 (円) */
  refundAmount: number;
}

/**
 * EventRegistration の返金 (部分返金対応、Stripe idempotent、Refund child + AuditLog 書込)。
 *
 * ## 契約
 * - `paymentStatus` が `PAID` または `PARTIALLY_REFUNDED` の申込のみ返金可能
 * - `amount` 未指定 → 残額全額 (`paidAmount - Σ既 refunds.amount`)
 * - 累積返金額が `paidAmount` に到達したら `REFUNDED`、未満なら `PARTIALLY_REFUNDED`
 * - Stripe idempotency key = `event-registration-refund-{registrationId}-{newCumulative}` で
 *   2 回目以降の部分返金でも unique
 *
 * ## 並行制御
 * - Phase 1 / 3 の interactive tx 冒頭で advisory lock を取得
 * - Stripe API 呼び出しは advisory lock tx の外 (`orchestrateAdminRefundCommand`)
 *
 * @throws DomainError NOT_FOUND / VALIDATION / UNEXPECTED
 */
export async function refundEventRegistrationPaymentCommand(
  input: RefundEventRegistrationInput,
): Promise<RefundEventRegistrationResult> {
  const {
    registrationId,
    amount: requestedAmount,
    reason,
    actorType,
    actorUserId,
    request,
  } = input;

  const stripeContext = await resolveRefundStripeContext();

  const result = await orchestrateAdminRefundCommand<
    RefundEventRegistrationResult,
    Record<string, never>
  >({
    entityKind: "event-registration",
    entityId: registrationId,
    requestedAmount,
    reason,
    actorType,
    idempotencyKeyPrefix: `event-registration-refund-${registrationId}`,
    operation: "refundEventRegistrationPayment",
    savepointName: "refund_create_event",
    stripeContext,
    stripeLogContext: { registrationId },
    planInTx: async (tx) => {
      const registration = await tx.eventRegistration.findFirst({
        where: { id: registrationId, event: { deletedAt: null } },
        select: {
          id: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          paidAmount: true,
        },
      });

      if (!registration) {
        throw new DomainError("イベント申込が見つかりません", "NOT_FOUND");
      }

      if (
        registration.paymentStatus !== PaymentStatus.PAID &&
        registration.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new DomainError(
          "決済確定・一部返金済みのイベント申込のみ返金できます",
          "VALIDATION",
        );
      }

      if (!registration.stripePaymentIntentId) {
        throw new DomainError(
          "Stripe の決済情報が見つかりません",
          "VALIDATION",
        );
      }

      if (registration.paidAmount === null || registration.paidAmount <= 0) {
        throw new DomainError(
          "受領額が記録されていないイベント申込は返金できません",
          "VALIDATION",
        );
      }

      const aggregate = await tx.refund.aggregate({
        where: { eventRegistrationId: registrationId },
        _sum: { amount: true },
      });
      const cumulativeSoFar = aggregate._sum.amount ?? 0;
      const amountPlan = computeAdminRefundAmount({
        requestedAmount,
        chargeTotal: registration.paidAmount,
        cumulativeSoFar,
        fullyRefundedMessage: "このイベント申込は既に全額返金済みです",
      });

      return {
        ...amountPlan,
        paymentIntentId: registration.stripePaymentIntentId,
        chargeTotal: registration.paidAmount,
        entityPayload: {},
      };
    },
    buildRefundRecord: ({ amount, stripeRefundId, reason: refundReason }) => ({
      eventRegistrationId: registrationId,
      amount,
      ...(refundReason ? { reason: refundReason } : {}),
      stripeRefundId,
      refundedByType: actorType,
    }),
    updatePaymentStatusInTx: async (tx, willBeFullyRefunded) => {
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          ...buildAdminRefundPaymentStatusWhere(),
        },
        data: {
          paymentStatus: resolveAdminRefundPaymentStatus(willBeFullyRefunded),
        },
      });
    },
    buildResult: ({ refundId, status, plan }) => ({
      refundId,
      status,
      newPaymentStatus: resolveAdminRefundPaymentStatus(
        plan.willBeFullyRefunded,
      ),
      cumulativeAmount: plan.newCumulative,
      refundAmount: plan.amount,
    }),
  });

  // AuditLog (tx 外)
  await createAuditLogRecord({
    ...(actorUserId ? { userId: actorUserId } : {}),
    action: AuditAction.UPDATE,
    resource: "event-registration",
    resourceId: registrationId,
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
