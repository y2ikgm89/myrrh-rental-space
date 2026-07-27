import "server-only";

import { runAutoRefundOnCancel } from "@/shared/domain/cancellation/run-auto-refund-on-cancel";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { refundEventRegistrationPaymentCommand } from "@/shared/domain/events/payment-commands";
import {
  getEventWaitlistOfferPaymentContext,
  getWaitlistEmailRegistration,
} from "@/shared/domain/events/waitlist-queries";
import { notifyEventWaitlistOfferedForRegistration } from "@/shared/domain/events/waitlist-admin-notification-side-effects";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import {
  channelLabel,
  mapEmailResultToOutcome,
} from "@/shared/domain/events/registration-cancellation/helpers";
import type { RegistrationEmailDetails } from "@/shared/domain/events/registration-cancellation/registration-data";
import type {
  EventCancellationEffectOutcome,
  EventCancellationSideEffectInput,
  SideEffectRegistration,
} from "@/shared/domain/events/registration-cancellation/types";
import {
  sendEventAdminNotification,
  sendEventRegistrationCancelled,
} from "@/shared/lib/email/event-emails";
import { sendEventWaitlistOffered } from "@/shared/lib/email/event-waitlist-emails";
import type {
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
} from "@/shared/lib/email/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";

/**
 * MYPAGE-EVENT-02: Stripe 自動返金ステップ。Reservation 側 (autoRefundStep 相当) と対称。
 *
 * - `paymentStatus === PAID | PARTIALLY_REFUNDED` かつ `stripePaymentIntentId` あり
 *   のときのみ実行し、それ以外は status="skipped" を返す。
 * - Policy が snapshot 経由で渡されればそれを使用、未渡し時は per-call で
 *   Settings.findUnique から取得する。
 * - Policy 適用結果 amount=0 は refund skip (Notification 側で「要返金確認」に昇格して
 *   運用側の判断を仰ぐ)。
 */
export async function runRefundStep(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  wasPaid: boolean;
  requiresRefund: boolean;
}): Promise<EventCancellationEffectOutcome> {
  const { input, registration, wasPaid, requiresRefund } = args;

  return runAutoRefundOnCancel({
    entityId: input.registrationId,
    operation: "autoRefundEventRegistrationOnCancel",
    channel: input.channel,
    wasPaid,
    requiresRefund,
    chargeBase: registration.paidAmount,
    startTime: registration.slot.startAt,
    ...(input.refundPolicySnapshot !== undefined
      ? { refundPolicySnapshot: input.refundPolicySnapshot }
      : {}),
    request: {
      ip: input.request.ip,
      userAgent: input.request.userAgent,
    },
    executeRefund: async ({ amount, request }) =>
      refundEventRegistrationPaymentCommand({
        registrationId: input.registrationId,
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        request,
        ...(amount !== undefined ? { amount } : {}),
      }),
  });
}

export async function runCustomerEmailStep(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  details: RegistrationEmailDetails;
  renderContext: EventEmailRenderContext;
}): Promise<EventCancellationEffectOutcome> {
  const { input, registration, details, renderContext } = args;
  try {
    const result = await sendEventRegistrationCancelled(
      {
        registrationId: registration.id,
        customerName: registration.name,
        customerEmail: registration.email,
        eventTitle: registration.event.title,
        eventStartTime: details.startTime,
        eventEndTime: details.endTime,
        location: details.location ?? undefined,
        quantity: registration.quantity,
        icsSequence: registration.icsSequence,
        format: details.format,
        meetingUrl: details.meetingUrl,
      },
      renderContext,
    );
    return mapEmailResultToOutcome(result);
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendEventCancellationEmails",
        registrationId: input.registrationId,
        channel: input.channel,
        recipient: "customer",
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runAdminEmailStep(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  details: RegistrationEmailDetails;
  adminDelivery: EventAdminNotificationDelivery & { enabled: boolean };
}): Promise<EventCancellationEffectOutcome> {
  const { input, registration, details, adminDelivery } = args;
  if (!adminDelivery.enabled) {
    return { status: "skipped", reason: "disabled" };
  }
  try {
    const result = await sendEventAdminNotification(
      {
        registrationId: registration.id,
        eventId: registration.eventId,
        participantName: registration.name,
        participantEmail: registration.email,
        eventTitle: registration.event.title,
        eventStartTime: details.startTime,
        quantity: registration.quantity,
        currentRegistrations: details.confirmedCount,
        capacity: details.capacity,
      },
      "cancellation",
      adminDelivery,
    );
    return mapEmailResultToOutcome(result);
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendEventCancellationEmails",
        registrationId: input.registrationId,
        channel: input.channel,
        recipient: "admin",
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

/**
 * 管理者 in-app 通知。MYPAGE-EVENT-02: `requiresRefund` が true のときは
 * 「PAID イベント申込のキャンセル — 要返金確認」タイトルに昇格して手動対応を促す
 * (Reservation 側の同型パターン)。返金 policy=0% で skip したケースでも同じ
 * タイトルにする。
 */
export async function runNotificationStep(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  requiresRefund: boolean;
}): Promise<EventCancellationEffectOutcome> {
  const { input, registration, requiresRefund } = args;
  try {
    const title = requiresRefund
      ? "PAID イベント申込のキャンセル — 要返金確認"
      : `イベント申込キャンセル（${channelLabel(input.channel)}）`;
    await createNotificationCommand({
      type: NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL,
      title,
      message: `${registration.name}様が「${registration.event.title}」の申込をキャンセルしました`,
      resourceType: "event",
      resourceId: registration.eventId,
    });
    return { status: "ok", detail: { escalated: requiresRefund } };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "createEventCancellationNotification",
        registrationId: input.registrationId,
        channel: input.channel,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

export async function runWaitlistOfferStep(
  input: EventCancellationSideEffectInput,
): Promise<EventCancellationEffectOutcome> {
  // 6. FIFO 繰り上げ当選メール（cancel が CONFIRMED / WAITLISTED_OFFERED 由来で、
  //    空いた枠に次の WAITLISTED を昇格させた場合のみ）。
  //
  // cron の期限切れ自動昇格・管理者の手動昇格（adminPromoteWaitlistEntryAction）は
  // 昇格したら必ずオファーメールを送る契約になっている。キャンセル駆動の自動昇格
  // （`applyEventRegistrationCancellation` が同一 tx 内で呼ぶ
  // `offerNextWaitlistEntryCommand`）だけこの送信が欠けていると、繰り上げ当選者は
  // 自分が当選したことを知る手段が無いまま 24h の確定期限を迎えて無為に
  // 期限切れになる。email が null（waitlist 登録は公開フォーム側で必須のため実運用
  // では発生しない想定）の場合は静かに skip する。
  if (input.promoted === null) {
    return { status: "skipped", reason: "no_promotion" };
  }

  const promotedRegistrationId = input.promoted.id;
  const promotedEmail = input.promoted.email;
  const promotedExpiresAt = input.promoted.expiresAt;

  if (promotedEmail === null) {
    try {
      await notifyEventWaitlistOfferedForRegistration(promotedRegistrationId);
    } catch (err) {
      const normalized = normalizeError(err);
      logError(normalized, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "createEventWaitlistOfferedNotification",
          registrationId: promotedRegistrationId,
          channel: input.channel,
        },
      });
    }
    return { status: "skipped", reason: "promoted_no_email" };
  }

  try {
    const [registration, paymentContext] = await Promise.all([
      getWaitlistEmailRegistration(promotedRegistrationId),
      getEventWaitlistOfferPaymentContext(promotedRegistrationId),
    ]);
    if (!registration || !paymentContext) {
      // 昇格させた行が直後の別操作（管理者の手動 expire 等）で消えた極端な race。
      // 状態遷移自体（昇格）は既に成功しているためロールバックせず、メール送信のみ
      // 諦めて非致命的にログする。
      logError(
        new Error(
          `Waitlist offer payment context not found after cancel-driven promote: registration ${promotedRegistrationId}`,
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "applyEventRegistrationCancellationSideEffects",
            registrationId: promotedRegistrationId,
          },
        },
      );
      return { status: "skipped", reason: "payment_context_missing" };
    }

    const result = await sendEventWaitlistOffered({
      registration,
      to: promotedEmail,
      expiresAt: promotedExpiresAt,
      paymentContext,
    });
    if (result.ok) {
      try {
        await notifyEventWaitlistOfferedForRegistration(promotedRegistrationId);
      } catch (err) {
        const normalized = normalizeError(err);
        logError(normalized, {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "createEventWaitlistOfferedNotification",
            registrationId: promotedRegistrationId,
            channel: input.channel,
          },
        });
      }
      return {
        status: "ok",
        detail: {
          messageId: result.messageId,
          promotedRegistrationId,
        },
      };
    }
    if (result.reason === "disabled" || result.reason === "suppressed") {
      return {
        status: "skipped",
        reason: "disabled_or_suppressed",
        detail: { promotedRegistrationId },
      };
    }
    return {
      status: "error",
      reason: result.error,
      detail: { promotedRegistrationId },
    };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendEventWaitlistOfferedOnCancelPromote",
        registrationId: input.registrationId,
        promotedRegistrationId,
        channel: input.channel,
      },
    });
    return {
      status: "error",
      reason: normalized.message,
      detail: { promotedRegistrationId },
    };
  }
}

export async function runCheckoutSessionExpireStep(args: {
  registrationId: string;
  sessionId: string | null;
}): Promise<EventCancellationEffectOutcome> {
  if (!args.sessionId) {
    return { status: "skipped", reason: "noCheckoutSession" };
  }

  try {
    await expireOpenCheckoutSessionBestEffort({
      sessionId: args.sessionId,
      context: { registrationId: args.registrationId },
    });
    return { status: "ok", detail: { sessionId: args.sessionId } };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "expireCheckoutSessionOnEventCancel",
        registrationId: args.registrationId,
        sessionId: args.sessionId,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}
