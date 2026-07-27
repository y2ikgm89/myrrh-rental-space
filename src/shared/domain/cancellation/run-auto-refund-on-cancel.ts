/**
 * キャンセル時 Stripe 自動返金の共通オーケストレーション。
 *
 * Reservation / EventRegistration の cancellation side-effects が共有する
 * refund policy 解決 → tier 計算 → skip 判定 → refund command 起票の SSoT。
 *
 * @module shared/domain/cancellation/run-auto-refund-on-cancel
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  calculateRefundAmount,
  resolveRefundPolicy,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/** Machine-readable skip reason codes (reservation + event 共通 SSoT)。 */
export const AUTO_REFUND_SKIP_REASON = {
  NOT_PAID: "notPaid",
  NO_PAYMENT_INTENT: "noPaymentIntent",
  POLICY_INVALID: "policyInvalid",
  POLICY_REFUND_RATE_ZERO: "policyRefundRateZero",
} as const;

export type AutoRefundSkipReason =
  (typeof AUTO_REFUND_SKIP_REASON)[keyof typeof AUTO_REFUND_SKIP_REASON];

/** 単一 auto-refund 副作用の outcome。side-effects AuditLog metadata と共通。 */
export type AutoRefundEffectOutcome = {
  status: "ok" | "skipped" | "error";
  reason?: string;
  detail?: Record<string, string | number | boolean | null>;
};

export type AutoRefundRefundResult = {
  refundAmount: number;
  cumulativeAmount: number;
  newPaymentStatus: string;
};

export type RunAutoRefundOnCancelInput = {
  /** reservationId / registrationId — Cloud Logging context 用。 */
  entityId: string;
  /** Cloud Logging context.operation (例: autoRefundOnCancel)。 */
  operation: string;
  channel?: string;
  wasPaid: boolean;
  requiresRefund: boolean;
  /** Policy tier 計算の charge base (totalPriceWithTax / paidAmount 等)。 */
  chargeBase: number | null;
  /** Policy tier 評価の基準時刻 (reservation.startTime / slot.startAt)。 */
  startTime: Date;
  refundPolicySnapshot?: RefundPolicyResolution;
  request: {
    ip: string | null;
    userAgent: string | null;
  };
  executeRefund: (args: {
    amount?: number;
    request: { ip: string | null; userAgent: string | null };
  }) => Promise<AutoRefundRefundResult>;
};

async function resolveRefundPolicyForCancel(
  snapshot: RefundPolicyResolution | undefined,
): Promise<RefundPolicyResolution> {
  if (snapshot !== undefined) {
    return snapshot;
  }
  const settings = await prisma.settingsCommerce.findUnique({
    where: { id: "singleton" },
    select: { refundPolicy: true },
  });
  return resolveRefundPolicy(settings?.refundPolicy);
}

/**
 * キャンセル時 auto-refund ステップ。throw せず outcome を返す (orchestrator 保護)。
 */
export async function runAutoRefundOnCancel(
  input: RunAutoRefundOnCancelInput,
): Promise<AutoRefundEffectOutcome> {
  const {
    entityId,
    operation,
    channel,
    wasPaid,
    requiresRefund,
    chargeBase,
    startTime,
    refundPolicySnapshot,
    request,
    executeRefund,
  } = input;

  if (!requiresRefund) {
    return {
      status: "skipped",
      reason: wasPaid
        ? AUTO_REFUND_SKIP_REASON.NO_PAYMENT_INTENT
        : AUTO_REFUND_SKIP_REASON.NOT_PAID,
    };
  }

  try {
    const resolution = await resolveRefundPolicyForCancel(refundPolicySnapshot);

    if (resolution.status === "invalid") {
      logError(
        new Error("Auto refund skipped: refund policy JSON is invalid"),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: {
            operation,
            entityId,
            reason: AUTO_REFUND_SKIP_REASON.POLICY_INVALID,
            parseReason: resolution.reason,
          },
        },
      );
      return {
        status: "skipped",
        reason: AUTO_REFUND_SKIP_REASON.POLICY_INVALID,
        detail: { parseReason: resolution.reason },
      };
    }

    let refundAmount: number | undefined;
    if (resolution.status === "configured" && chargeBase !== null) {
      refundAmount = calculateRefundAmount(
        resolution.policy,
        chargeBase,
        startTime,
        new Date(),
      );
    }
    // status === "unset" → refundAmount 未指定のまま残額全額自動返金

    if (refundAmount !== undefined && refundAmount <= 0) {
      logError(new Error("Auto refund skipped: policy refund rate is 0%"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: {
          operation,
          entityId,
          reason: AUTO_REFUND_SKIP_REASON.POLICY_REFUND_RATE_ZERO,
        },
      });
      return {
        status: "skipped",
        reason: AUTO_REFUND_SKIP_REASON.POLICY_REFUND_RATE_ZERO,
        ...(refundAmount === 0 ? { detail: { policyRefundAmount: 0 } } : {}),
      };
    }

    const result = await executeRefund({
      ...(refundAmount !== undefined ? { amount: refundAmount } : {}),
      request,
    });

    return {
      status: "ok",
      detail: {
        refundAmount: result.refundAmount,
        cumulativeAmount: result.cumulativeAmount,
        newPaymentStatus: result.newPaymentStatus,
      },
    };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation,
        entityId,
        ...(channel !== undefined ? { channel } : {}),
      },
    });
    return { status: "error", reason: normalized.message };
  }
}
