import "server-only";

import {
  AuditAction,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import type { RegistrationEmailDetails } from "@/shared/domain/events/registration-cancellation/registration-data";
import {
  runAdminEmailStep,
  runCheckoutSessionExpireStep,
  runCustomerEmailStep,
  runNotificationStep,
  runRefundStep,
  runWaitlistOfferStep,
} from "@/shared/domain/events/registration-cancellation/steps";
import {
  CHANNEL_TO_CANCELLED_BY,
  type EventCancellationSideEffectInput,
  type EventCancellationSideEffectOutcomes,
  type SideEffectRegistration,
} from "@/shared/domain/events/registration-cancellation/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * 副作用チェーンの本体。refund を先に await し、残りを並列実行して outcome を
 * 集約 AuditLog に書く。個別 sub-effect の失敗は run*Step 内で完結し、throw を
 * ここまで伝播させない。
 * `applyEventRegistrationCancellationSideEffects` から `fireAndForget` 越しに
 * `after()` 内で実行される。
 */
export async function runEventCancellationSideEffectsAndFlushAudit(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  details: RegistrationEmailDetails;
}): Promise<void> {
  const { input, registration, details } = args;

  // MYPAGE-EVENT-02: refund 判定を先に走らせ、その結果 (skipped/ok/error) を
  // Notification 側のタイトル escalation と AuditLog metadata の
  // requiresRefund / wasPaid に反映する。
  // refund は決済系副作用のため他の副作用 (email/notification/audit) と並行させず、
  // 判定結果を後続に伝播する必要があるので独立 await する。
  const wasPaid =
    registration.paymentStatus === PaymentStatus.PAID ||
    registration.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;
  const requiresRefund = wasPaid && registration.stripePaymentIntentId !== null;
  const refund = await runRefundStep({
    input,
    registration,
    wasPaid,
    requiresRefund,
  });

  const [
    checkoutSessionExpire,
    customerEmail,
    adminEmail,
    notification,
    waitlistOffer,
  ] = await Promise.all([
    runCheckoutSessionExpireStep({
      registrationId: registration.id,
      sessionId: registration.stripeCheckoutSessionId,
    }),
    runCustomerEmailStep({ input, registration, details }),
    runAdminEmailStep({ input, registration, details }),
    runNotificationStep({ input, registration, requiresRefund }),
    runWaitlistOfferStep(input),
  ]);

  const outcomes: EventCancellationSideEffectOutcomes = {
    refund,
    checkoutSessionExpire,
    customerEmail,
    adminEmail,
    notification,
    waitlistOffer,
  };

  try {
    await createAuditLogRecord({
      ...(input.actorUserId ? { userId: input.actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: input.registrationId,
      newValue: {
        status: "CANCELLED",
        cancelledByType: CHANNEL_TO_CANCELLED_BY[input.channel],
      },
      metadata: {
        channel: input.channel,
        ip: input.request.ip,
        userAgent: input.request.userAgent,
        ...(input.request.tokenFingerprint
          ? { tokenFingerprint: input.request.tokenFingerprint }
          : {}),
        // MYPAGE-EVENT-02: reservation-symmetric forensics。
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
        operation: "auditLogEventRegistrationCancellation",
        registrationId: input.registrationId,
      },
    });
  }
}
