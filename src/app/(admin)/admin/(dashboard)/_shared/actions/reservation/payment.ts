"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCheckoutSessionCommand,
  recordManualReservationPaymentCommand,
  refundReservationPaymentCommand,
  type RefundReservationResult,
} from "@/shared/domain/reservations/payment-commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { fetchReservationEmailData } from "@/shared/domain/reservations/payloads";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import {
  AuditAction,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { sendReservationRefundEmail } from "@/shared/domain/email/lib-dispatch";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });

const manualPaymentMethodValues = ["CASH", "BANK_TRANSFER", "OTHER"] as const;

const manualPaymentSchema = z.object({
  reservationId: reservationIdSchema,
  amount: z.number().int().min(1),
  method: z.enum(manualPaymentMethodValues),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
});

export type ManualReservationPaymentInput = z.input<typeof manualPaymentSchema>;

export async function createCheckoutSession(
  reservationId: string,
): Promise<MutationResult<{ sessionId: string; sessionUrl: string | null }>> {
  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: parsedId.data,
    execute: async () =>
      createCheckoutSessionCommand({
        reservationId: parsedId.data,
        actorCustomerId: null,
      }),
    afterSuccess: (data) => {
      invalidateReservationCaches(parsedId.data, data.customerId);
    },
  });
}

export async function recordManualReservationPayment(
  input: ManualReservationPaymentInput,
): Promise<MutationResult<{ reservationId: string; receiptWarning?: string }>> {
  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: parsed.data.reservationId,
    execute: async (user) => {
      const result = await recordManualReservationPaymentCommand({
        reservationId: parsed.data.reservationId,
        amount: parsed.data.amount,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateReservationCaches(
        parsed.data.reservationId,
        outcome.customerId,
      );

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "reservation",
          resourceId: parsed.data.reservationId,
          oldValue: { paymentStatus: PaymentStatus.UNPAID },
          newValue: { paymentStatus: PaymentStatus.PAID },
          metadata: {
            manualPaymentAmount: parsed.data.amount,
            manualPaymentMethod: parsed.data.method,
            ...(parsed.data.note !== null && {
              manualPaymentNote: parsed.data.note,
            }),
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogRecordManualReservationPayment",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}

/**
 * 管理者による返金 (task #9 PR#3 で command 拡張、task #9 PR#4 で UI で amount/reason 入力対応)。
 *
 * @param reservationId 対象予約 ID
 * @param options 部分返金 amount / 返金理由。両方省略で残額全額返金 + reason なし
 *
 * actorType=ADMIN で `refundReservationPaymentCommand` を呼び出す。amount 未指定 →
 * `Refund` 集計後の残額全額を返金 (PAID 予約なら totalPriceWithTax、PARTIALLY_REFUNDED
 * 予約なら totalPriceWithTax - Σ既 refunds)。actorUserId は Better Auth session の管理者 id。
 */
export async function refundReservationPayment(
  reservationId: string,
  options?: {
    /** 部分返金額 (円、正整数)。省略で残額全額。 */
    amount?: number;
    /** 返金理由 (Refund.reason + AuditLog metadata に記録)。 */
    reason?: string;
  },
): Promise<MutationResult<RefundReservationResult>> {
  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: parsedId.data,
    execute: async (user) => {
      // UA-HORIZ-04: admin session hijack シナリオでの forensics 対称化のため
      // ip / userAgent を AuditLog metadata に載せる (cancel / receipt / waitlist と同型)。
      const request = await buildAuditRequestContext();
      return refundReservationPaymentCommand({
        reservationId: parsedId.data,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: user.id,
        request,
        ...(options?.amount !== undefined ? { amount: options.amount } : {}),
        ...(options?.reason !== undefined && options.reason !== ""
          ? { reason: options.reason }
          : {}),
      });
    },
    afterSuccess: (data) => {
      invalidateReservationCaches(parsedId.data, data.customerId);

      // konbini / customer_balance 等の非同期返金 (isSettled=false) はまだ Stripe が
      // 確定させていないため、「返金完了」メール・通知はここでは送らない
      // (refund.updated webhook 経由の確定時に送信する)。
      if (!data.isSettled) return;

      // Cluster H #8: 顧客への返金通知メール + 管理者向け in-app 通知を発火する。
      // 返金は「更新」「キャンセル」と独立した重要取引通知として非 gate で常時送信。
      // idempotencyKey は refundId ベースなので複数回の部分返金でも silent drop しない。
      fireAndForget(
        (async () => {
          const emailData = await fetchReservationEmailData(parsedId.data);
          if (!emailData) return;
          await sendReservationRefundEmail({
            reservationId: emailData.reservationId,
            customerEmail: emailData.customerEmail,
            customerName: emailData.customerName,
            spaceName: emailData.spaceName,
            startTime: emailData.startTime,
            endTime: emailData.endTime,
            refundAmount: data.refundAmount,
            cumulativeRefundAmount: data.cumulativeAmount,
            // Stripe charge / refund 上限は totalPriceWithTax (税込) が SSoT。
            originalTotal:
              emailData.totalPriceWithTax ?? emailData.totalPrice ?? 0,
            isFullyRefunded: data.newPaymentStatus === PaymentStatus.REFUNDED,
            refundId: data.refundId,
            ...(emailData.userId != null ? { userId: emailData.userId } : {}),
          });
        })(),
        {
          operation: "sendReservationRefundEmail",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { reservationId: parsedId.data, refundId: data.refundId },
        },
      );

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.RESERVATION_REFUND,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
          message:
            data.newPaymentStatus === PaymentStatus.REFUNDED
              ? "管理者が予約の全額返金を実行しました"
              : "管理者が予約の一部返金を実行しました",
          resourceType: "reservation",
          resourceId: parsedId.data,
        }),
        {
          operation: "refundReservationPaymentNotification",
          category: ErrorCategory.DATABASE,
        },
      );
    },
  });
}
