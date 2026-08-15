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
  calculatePolicyRefundBreakdown,
  resolveRefundPolicy,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

/** Machine-readable skip reason codes (reservation + event 共通 SSoT)。 */
export const AUTO_REFUND_SKIP_REASON = {
  NOT_PAID: "notPaid",
  NO_PAYMENT_INTENT: "noPaymentIntent",
  POLICY_INVALID: "policyInvalid",
  POLICY_REFUND_RATE_ZERO: "policyRefundRateZero",
  /** 既存の返金だけで、返金ポリシーの取り分に既に達している。 */
  POLICY_ALREADY_SATISFIED: "policyAlreadySatisfied",
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
  /**
   * 既に返金済みの累計額（円）。
   *
   * **返金ポリシーは「総額に対する取り分」を決める。** 既に部分返金があるなら、
   * 今回返すのはその差分だけ（監査 F-43）。
   */
  refundedSoFar: number;
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
    refundedSoFar,
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
      try {
        await createNotificationCommand({
          type: NOTIFICATION_TYPE.REFUND_POLICY_INVALID,
          title:
            NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.REFUND_POLICY_INVALID],
          message: `返金ポリシー JSON が不正なため自動返金をスキップしました（${entityId}）。parseReason: ${resolution.reason}`,
          resourceId: entityId,
        });
      } catch (notifyErr) {
        const normalized = normalizeError(notifyErr);
        logError(normalized, {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          context: {
            operation,
            entityId,
            reason: "refundPolicyInvalidNotificationFailed",
          },
        });
      }
      return {
        status: "skipped",
        reason: AUTO_REFUND_SKIP_REASON.POLICY_INVALID,
        detail: { parseReason: resolution.reason },
      };
    }

    let refundAmount: number | undefined;
    let policyEntitlement: number | undefined;
    if (resolution.status === "configured" && chargeBase !== null) {
      // 取り分（entitlement）と今回返す額（outstanding）の算出は
      // `calculatePolicyRefundBreakdown` が SSoT。管理画面の推奨額も同じ関数を使う。
      const breakdown = calculatePolicyRefundBreakdown(
        resolution.policy,
        chargeBase,
        refundedSoFar,
        startTime,
        new Date(),
      );
      policyEntitlement = breakdown.entitlement;
      refundAmount = breakdown.outstanding;
    }
    // status === "unset" → refundAmount 未指定のまま残額全額自動返金

    if (refundAmount !== undefined && refundAmount <= 0) {
      // 取り分が 0%（ポリシーどおり返さない）と、既存返金で取り分に達している
      // （返すべき差分が無い）は別の状態。運用の読み分けができるよう区別する。
      const reason =
        policyEntitlement === 0
          ? AUTO_REFUND_SKIP_REASON.POLICY_REFUND_RATE_ZERO
          : AUTO_REFUND_SKIP_REASON.POLICY_ALREADY_SATISFIED;
      logError(new Error(`Auto refund skipped: ${reason}`), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { operation, entityId, reason },
      });
      return {
        status: "skipped",
        reason,
        detail: {
          ...(policyEntitlement !== undefined ? { policyEntitlement } : {}),
          refundedSoFar,
        },
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
