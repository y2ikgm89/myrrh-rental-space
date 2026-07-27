import "server-only";

import { runAutoRefundOnCancel } from "@/shared/domain/cancellation/run-auto-refund-on-cancel";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import { refundReservationPaymentCommand } from "@/shared/domain/reservations/payment-commands";
import { revokeSmartLockPasscodesForReservation } from "@/shared/domain/smart-lock/revoke-passcode";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  channelLabel,
  mapEmailResultToOutcome,
} from "@/shared/domain/reservations/cancellation/helpers";
import type {
  CancellationEffectOutcome,
  CancellationSideEffectInput,
  SideEffectReservation,
} from "@/shared/domain/reservations/cancellation/types";
import {
  getReservationEmailRenderContext,
  resolveReservationAdminNotificationDelivery,
} from "@/shared/domain/settings/queries/email-render-context";
import { deleteCalendarSync } from "@/shared/lib/calendar-sync/outbound";
import {
  sendReservationAdminNotification,
  sendReservationCancelledEmail,
} from "@/shared/lib/email/reservation-emails";
import type { ReservationEmailData } from "@/shared/lib/email/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";

export async function runRefundStep(args: {
  input: CancellationSideEffectInput;
  reservation: SideEffectReservation;
  requiresRefund: boolean;
  wasPaid: boolean;
}): Promise<CancellationEffectOutcome> {
  const { input, reservation, requiresRefund, wasPaid } = args;

  return runAutoRefundOnCancel({
    entityId: input.reservationId,
    operation: "autoRefundOnCancel",
    channel: input.channel,
    wasPaid,
    requiresRefund,
    chargeBase: reservation.totalPriceWithTax ?? reservation.totalPrice ?? null,
    startTime: reservation.startTime,
    ...(input.refundPolicySnapshot !== undefined
      ? { refundPolicySnapshot: input.refundPolicySnapshot }
      : {}),
    request: {
      ip: input.request.ip,
      userAgent: input.request.userAgent,
    },
    executeRefund: async ({ amount, request }) =>
      refundReservationPaymentCommand({
        reservationId: input.reservationId,
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        request,
        ...(amount !== undefined ? { amount } : {}),
      }),
  });
}

export async function runGcalStep(args: {
  input: CancellationSideEffectInput;
  reservation: SideEffectReservation;
}): Promise<CancellationEffectOutcome> {
  const { input, reservation } = args;
  if (input.suppress?.gcalDelete) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  if (!reservation.googleCalendarEventId) {
    return { status: "skipped", reason: "noEventId" };
  }
  try {
    const result = await deleteCalendarSync(
      input.reservationId,
      reservation.googleCalendarEventId,
    );
    if (result.success) {
      return { status: "ok" };
    }
    logError(new Error(`deleteCalendarSync failed: ${result.error}`), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "deleteCalendarSync",
        reservationId: input.reservationId,
      },
    });
    return { status: "error", reason: result.error };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "deleteCalendarSync",
        reservationId: input.reservationId,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runCustomerEmailStep(args: {
  input: CancellationSideEffectInput;
  payload: ReservationEmailData;
}): Promise<CancellationEffectOutcome> {
  const { input, payload } = args;
  if (input.suppress?.customerEmail) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  try {
    const renderContext = await getReservationEmailRenderContext();
    const result = await sendReservationCancelledEmail(payload, renderContext);
    return mapEmailResultToOutcome(result);
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendCancellationEmails",
        reservationId: input.reservationId,
        channel: input.channel,
        recipient: "customer",
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runAdminEmailStep(args: {
  input: CancellationSideEffectInput;
  payload: ReservationEmailData;
}): Promise<CancellationEffectOutcome> {
  const { input, payload } = args;
  if (input.suppress?.adminEmail) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  try {
    const delivery =
      await resolveReservationAdminNotificationDelivery("cancel");
    if (!delivery.enabled) {
      return { status: "skipped", reason: "disabled_or_suppressed" };
    }
    const result = await sendReservationAdminNotification(
      payload,
      "cancel",
      delivery,
    );
    return mapEmailResultToOutcome(result);
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendCancellationEmails",
        reservationId: input.reservationId,
        channel: input.channel,
        recipient: "admin",
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runNotificationStep(args: {
  input: CancellationSideEffectInput;
  requiresRefund: boolean;
}): Promise<CancellationEffectOutcome> {
  const { input, requiresRefund } = args;
  if (input.suppress?.inAppNotification) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  const notificationTitle = requiresRefund
    ? "PAID 予約のキャンセル — 要返金確認"
    : `予約キャンセル（${channelLabel(input.channel)}）`;
  const notificationMessage = input.cancellationReason
    ? `理由: ${input.cancellationReason}`
    : "理由: 入力なし";

  try {
    await createNotificationCommand({
      type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
      title: notificationTitle,
      message: notificationMessage,
      resourceType: "reservation",
      resourceId: input.reservationId,
    });
    return { status: "ok" };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "createCancellationNotification",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runCheckoutSessionExpireStep(args: {
  reservationId: string;
  sessionId: string | null;
}): Promise<CancellationEffectOutcome> {
  if (!args.sessionId) {
    return { status: "skipped", reason: "noCheckoutSession" };
  }

  try {
    await expireOpenCheckoutSessionBestEffort({
      sessionId: args.sessionId,
      context: { reservationId: args.reservationId },
    });
    return { status: "ok", detail: { sessionId: args.sessionId } };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "expireCheckoutSessionOnCancel",
        reservationId: args.reservationId,
        sessionId: args.sessionId,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runSmartLockStep(
  input: CancellationSideEffectInput,
): Promise<CancellationEffectOutcome> {
  try {
    await revokeSmartLockPasscodesForReservation(input.reservationId);
    return { status: "ok" };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "revokeSmartLockPasscodesOnCancel",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}
