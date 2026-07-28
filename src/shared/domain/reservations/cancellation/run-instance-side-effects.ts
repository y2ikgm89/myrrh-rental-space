import "server-only";

import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  runAdminEmailStep,
  runCheckoutSessionExpireStep,
  runCustomerEmailStep,
  runGcalStep,
  runNotificationStep,
  runRefundStep,
  runSmartLockStep,
} from "@/shared/domain/reservations/cancellation/steps";
import {
  CHANNEL_TO_CANCELLED_BY,
  type CancellationSideEffectInput,
  type CancellationSideEffectOutcomes,
  type SideEffectReservation,
} from "@/shared/domain/reservations/cancellation/types";
import type { ReservationEmailData } from "@/shared/lib/email/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * 副作用チェーンの本体。全 sub-effect を並列実行し、outcome を集約 AuditLog に書く。
 * 個別 sub-effect の失敗は run*Step 内で完結し、throw をここまで伝播させない。
 * `applyCancellationSideEffects` から `fireAndForget` 越しに `after()` 内で実行される。
 */
export async function runCancellationSideEffectsAndFlushAudit(args: {
  input: CancellationSideEffectInput;
  reservation: SideEffectReservation;
  payload: ReservationEmailData;
  wasPaid: boolean;
  requiresRefund: boolean;
}): Promise<void> {
  const { input, reservation, payload, wasPaid, requiresRefund } = args;

  const [
    refund,
    checkoutSessionExpire,
    gcal,
    customerEmail,
    adminEmail,
    notification,
    smartLock,
  ] = await Promise.all([
    runRefundStep({ input, reservation, requiresRefund, wasPaid }),
    runCheckoutSessionExpireStep({
      reservationId: reservation.id,
      sessionId: reservation.stripeCheckoutSessionId,
    }),
    runGcalStep({ input, reservation }),
    runCustomerEmailStep({ input, payload }),
    runAdminEmailStep({ input, payload }),
    runNotificationStep({ input, requiresRefund }),
    runSmartLockStep(input),
  ]);

  const outcomes: CancellationSideEffectOutcomes = {
    refund,
    checkoutSessionExpire,
    gcal,
    customerEmail,
    adminEmail,
    notification,
    smartLock,
  };

  try {
    await createAuditLogRecord({
      ...(input.actorUserId ? { userId: input.actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: input.reservationId,
      newValue: {
        status: "CANCELLED",
        cancelledByType: CHANNEL_TO_CANCELLED_BY[input.channel],
        cancellationReason: input.cancellationReason,
      },
      metadata: {
        channel: input.channel,
        ip: input.request.ip,
        userAgent: input.request.userAgent,
        ...(input.request.tokenFingerprint
          ? { tokenFingerprint: input.request.tokenFingerprint }
          : {}),
        requiresRefund,
        wasPaid,
        sideEffects: outcomes,
      },
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "auditLogCancellation",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
  }
}
