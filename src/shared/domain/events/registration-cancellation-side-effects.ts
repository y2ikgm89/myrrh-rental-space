/**
 * イベント参加申込キャンセル後の副作用を統一的に実行する。
 *
 * 会員（マイページ）/ ゲスト（メールリンク）/ 管理者（管理画面）の全キャンセル経路が
 * 同じ副作用チェーンを通ることを保証する SSoT。
 * 設計は `reservations/cancellation-side-effects.ts` と同型
 * （GCal 同期削除は EventRegistration にカレンダー同期フィールドが無いため対象外）。
 *
 * ## CRITIC-6 fix: 副作用 outcome を AuditLog に構造化記録する
 *
 * 以前は各副作用（顧客メール / 管理者メール / notification / audit / waitlist offer）
 * を個別に `fireAndForget` で束ねていたため、Resend suppression や外部 API 失敗が
 * silent no-op で握りつぶされ、キャンセル完了 UI と実挙動の乖離を検出できなかった。
 *
 * 現在は各副作用を run*Step ヘルパーに分離し、outcome (`ok / skipped / error`) を
 * 集約 AuditLog metadata (`sideEffects`) に 1 レコードで記録する
 * （予約側 `applyCancellationSideEffects` と同型）。
 * mypage レスポンス latency を維持するため、副作用チェーン全体を
 * `fireAndForget` で `after()` に委譲する。
 *
 * ## MYPAGE-EVENT-02 fix: 顧客セルフキャンセル時に自動 Stripe refund を発火する
 *
 * 従来はイベント側のみ手動対応必須で、`/mypage/events` からセルフキャンセルした
 * PAID 参加者は policy 内でも返金されず support ticket 経由に流れていた。
 * 現在は `reservations/cancellation-side-effects.ts` と対称に、
 * `paymentStatus === PAID | PARTIALLY_REFUNDED` かつ `stripePaymentIntentId` あり の
 * ときに `refundEventRegistrationPaymentCommand(actorType=AUTO_ON_CANCEL)` を発火する。
 * `Settings.refundPolicy` が configured なら tier ベースで返金額を算出し、
 * unset なら残額全額。invalid（JSON 破損）は fail-closed で自動返金 skip。
 * policy 適用結果が 0 円なら refund 全 skip し、admin 通知タイトルを
 * 「要返金確認」に昇格して手動対応を明示的に促す。
 *
 * 含まれる副作用:
 *   1. Stripe refund（`paymentStatus === PAID | PARTIALLY_REFUNDED` かつ
 *      `stripePaymentIntentId` あり のときのみ自動発火）。
 *      `Settings.refundPolicy` が configured なら tier ベース、unset なら残額全額。
 *      invalid は自動返金しない（fail-closed）。0 円なら refund 全 skip。
 *      MYPAGE-EVENT-02: 予約キャンセル (`reservations/cancellation-side-effects.ts`)
 *      と対称の挙動を保証する（従来はイベント側のみ手動対応必須で顧客誤解の原因）。
 *   2. Stripe Checkout Session の expire（open session からの後追い課金を防ぐ）
 *   3. 参加者向けキャンセル確認メール（CANCEL ICS 添付）
 *   4. 管理者向け管理者通知メール
 *   5. 管理者向け in-app 通知（channel 含む、PAID 自動返金時は要確認タイトルへ昇格）
 *   6. AuditLog 書き込み（actor / channel / IP / UA + sideEffects outcomes +
 *      requiresRefund / wasPaid を記録）
 *   7. FIFO 繰り上げ当選メール（`input.promoted` が非 null のときのみ。
 *      `applyEventRegistrationCancellation` が同一 tx 内で
 *      `offerNextWaitlistEntryCommand` を呼び、CONFIRMED または WAITLISTED_OFFERED
 *      由来のキャンセルで空いた枠に次の WAITLISTED を昇格させた場合に送る。
 *      WAITLISTED_OFFERED を対象に含める理由は MYPAGE-EVENT-03 を参照）
 *
 * 呼び出し条件:
 *   `applyEventRegistrationCancellation` が `success: true` を返した後にだけ呼ぶ。
 *   本関数は申込データの再取得を行うため、cancel transaction commit 後に呼ぶこと。
 *
 * @module shared/domain/events/registration-cancellation-side-effects
 */

import "server-only";

import { AuditAction, PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import { runAutoRefundOnCancel } from "@/shared/domain/cancellation/run-auto-refund-on-cancel";
import {
  getEventWaitlistOfferPaymentContext,
  getWaitlistEmailRegistration,
} from "@/shared/domain/events/waitlist-queries";
import { refundEventRegistrationPaymentCommand } from "@/shared/domain/events/payment-commands";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import { type RefundPolicyResolution } from "@/shared/domain/refund/policy";
import type { WaitlistPromotionOutcome } from "@/shared/domain/events/registration-cancel-core";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  sendEventAdminNotification,
  sendEventRegistrationCancelled,
} from "@/shared/lib/email/event-emails";
import { notifyEventWaitlistOfferedForRegistration } from "@/shared/domain/events/waitlist-admin-notification-side-effects";
import { sendEventWaitlistOffered } from "@/shared/lib/email/event-waitlist-emails";
import type { EmailResult } from "@/shared/lib/email/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  CANCELLED_BY,
  NOTIFICATION_TYPE,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";

export type EventCancelChannel =
  "admin" | "customer-mypage" | "customer-token" | "system";

export interface EventCancellationSideEffectInput {
  registrationId: string;
  /** どこから / 誰がキャンセルしたか。AuditLog metadata と通知タイトル分岐に使う。 */
  channel: EventCancelChannel;
  /** AuditLog.userId に書く。会員セルフキャンセルでは値あり、ゲスト/管理者では null。 */
  actorUserId: string | null;
  /** リクエスト由来のコンテキスト（監査・フォレンジック用）。 */
  request: {
    ip: string | null;
    userAgent: string | null;
    /** ステートレストークン経路でのみ意味を持つ。SHA-256 の先頭 16 文字。 */
    tokenFingerprint?: string | null;
  };
  /**
   * `applyEventRegistrationCancellation` の戻り値 `promoted` をそのまま渡す。
   * CONFIRMED または WAITLISTED_OFFERED 由来のキャンセルで空いた枠に FIFO
   * 先頭の WAITLISTED が昇格した場合のみ非 null。呼び出し側（3 つの cancel
   * 経路すべて）はドメインコマンドの戻り値を素通しするだけでよい（このヘルパー
   * 内部で「昇格していたら繰り上げ当選メールを送る」判断まで完結させる SSoT）。
   */
  promoted: WaitlistPromotionOutcome;
  /**
   * MYPAGE-EVENT-02: 呼出側が `Settings.refundPolicy` を事前に取得済ならその snapshot を
   * 渡す（`reservations/cancellation-side-effects.ts` の同名フィールドと同型契約）。
   *
   * - 省略 (undefined) → 従前どおり per-call で `Settings.findUnique` を実行
   * - `RefundPolicyResolution` → その snapshot を使用
   */
  refundPolicySnapshot?: RefundPolicyResolution;
}

// -----------------------------------------------------------------------------
// CRITIC-6: 副作用 outcome 型と集約 metadata 形式
// -----------------------------------------------------------------------------

/** 単一副作用の実行結果。予約側と同型（reservations/cancellation-side-effects.ts）。 */
export type EventCancellationEffectOutcome = {
  status: "ok" | "skipped" | "error";
  reason?: string;
  detail?: Record<string, string | number | boolean | null>;
};

/** 全副作用の outcome を並べた集約構造。AuditLog metadata.sideEffects に格納される。 */
export type EventCancellationSideEffectOutcomes = {
  refund: EventCancellationEffectOutcome;
  checkoutSessionExpire: EventCancellationEffectOutcome;
  customerEmail: EventCancellationEffectOutcome;
  adminEmail: EventCancellationEffectOutcome;
  notification: EventCancellationEffectOutcome;
  waitlistOffer: EventCancellationEffectOutcome;
};

const CHANNEL_TO_CANCELLED_BY: Record<EventCancelChannel, CancelledByType> = {
  admin: CANCELLED_BY.ADMIN,
  "customer-mypage": CANCELLED_BY.CUSTOMER_MYPAGE,
  "customer-token": CANCELLED_BY.CUSTOMER_TOKEN,
  system: CANCELLED_BY.SYSTEM,
};

interface SideEffectRegistration {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  quantity: number;
  icsSequence: number;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  paidAmount: number | null;
  event: { title: string };
  slot: { startAt: Date };
}

async function fetchRegistrationForSideEffects(
  registrationId: string,
): Promise<SideEffectRegistration | null> {
  return prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      quantity: true,
      icsSequence: true,
      // MYPAGE-EVENT-02: PAID / PARTIALLY_REFUNDED 判定・Stripe refund 起票・
      // policy tier 計算 (slot.startAt = イベント開始時刻) に必要なフィールドを追加。
      paymentStatus: true,
      stripePaymentIntentId: true,
      stripeCheckoutSessionId: true,
      paidAmount: true,
      event: { select: { title: true } },
      slot: { select: { startAt: true } },
    },
  });
}

function channelLabel(channel: EventCancelChannel): string {
  switch (channel) {
    case "admin":
      return "管理者";
    case "customer-mypage":
      return "顧客（マイページ）";
    case "customer-token":
      return "顧客（メールリンク）";
    case "system":
      return "システム（自動）";
  }
}

function mapEmailResultToOutcome(
  result: EmailResult,
): EventCancellationEffectOutcome {
  if (result.ok) {
    return { status: "ok", detail: { messageId: result.messageId } };
  }
  if (result.reason === "disabled" || result.reason === "suppressed") {
    return { status: "skipped", reason: "disabled_or_suppressed" };
  }
  return { status: "error", reason: result.error };
}

// -----------------------------------------------------------------------------
// 個別副作用ヘルパー: 実行 + outcome capture。throw しない (orchestrator 保護)。
// -----------------------------------------------------------------------------

type RegistrationEmailDetails = NonNullable<
  Awaited<ReturnType<typeof getEventRegistrationDetailsForEmail>>
>;

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
async function runRefundStep(args: {
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

async function runCustomerEmailStep(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  details: RegistrationEmailDetails;
}): Promise<EventCancellationEffectOutcome> {
  const { input, registration, details } = args;
  try {
    const result = await sendEventRegistrationCancelled({
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
    });
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

async function runAdminEmailStep(args: {
  input: EventCancellationSideEffectInput;
  registration: SideEffectRegistration;
  details: RegistrationEmailDetails;
}): Promise<EventCancellationEffectOutcome> {
  const { input, registration, details } = args;
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
async function runNotificationStep(args: {
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

async function runWaitlistOfferStep(
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

async function runCheckoutSessionExpireStep(args: {
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

async function runEventCancellationSideEffectsAndFlushAudit(args: {
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

/**
 * キャンセル後の副作用統一実行。
 *
 * registration / details fetch 以外は `fireAndForget` で `after()` に委譲するため、
 * 呼び出し側の response latency は fetch 時間のみ（従来と同じ）。
 * 全副作用の outcome は集約 AuditLog metadata (`sideEffects`) に記録され、
 * Resend suppression / waitlist offer メール未達 / Stripe refund 失敗などが
 * 「完了表示 vs 実挙動」の乖離としてカスタマーサポート起点で観測可能になる
 * (CRITIC-6 + MYPAGE-EVENT-02)。
 */
export async function applyEventRegistrationCancellationSideEffects(
  input: EventCancellationSideEffectInput,
): Promise<void> {
  const [registration, details] = await Promise.all([
    fetchRegistrationForSideEffects(input.registrationId),
    getEventRegistrationDetailsForEmail(input.registrationId),
  ]);

  if (!registration || !details) {
    logError(
      new Error(
        `Cancellation side effects skipped: event registration ${input.registrationId} not found after cancel`,
      ),
      {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "applyEventRegistrationCancellationSideEffects",
          registrationId: input.registrationId,
        },
      },
    );
    return;
  }

  fireAndForget(
    runEventCancellationSideEffectsAndFlushAudit({
      input,
      registration,
      details,
    }),
    {
      operation: "applyEventRegistrationCancellationSideEffects",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        registrationId: input.registrationId,
        channel: input.channel,
      },
    },
  );
}
