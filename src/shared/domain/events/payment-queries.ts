import "server-only";

import { PaymentStatus, RegistrationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import { fromStripeUnitAmount } from "@/shared/lib/stripe-shared";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { refundOrphanedStripePaymentForCancelledEventRegistration } from "@/shared/domain/events/payment-commands";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import {
  REFUNDED_BY_TYPE,
  isValidRefundedByType,
} from "@/shared/lib/validations/enums/refund-attribution";

/**
 * EventRegistration の Stripe webhook から呼ばれる atomic PAID 遷移。
 * Reservation の claimReservationAsPaid と同型 (updateMany WHERE で claim)。
 *
 * Codex Cloud Review P1 (PR#1026, comment_id=3567019751): claim は
 * `status: CONFIRMED` も要求する。cancel 経路 (registration-cancel-core.ts) は
 * paymentStatus を触らず status のみ CANCELLED に遷移させるため、paymentStatus
 * だけで claim すると「pending checkout 中に cancel → Stripe 完了 webhook 到達」で
 * CANCELLED な行に PAID が焼き付き、返金導線なしで会計 mismatch を起こす。
 * count===0 の場合は呼び出し側 (webhook handler) が refund reconciliation を kick する。
 */
export async function claimEventRegistrationAsPaid(
  registrationId: string,
  data: { stripePaymentIntentId: string | null },
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
  });

  if (result.count > 0) {
    return true;
  }

  // count=0 の大半は無害 (重複 webhook 配信・既に PAID 等) だが、
  // status=CANCELLED での不一致だけは money-in-flight。自動返金で収束させる。
  const current = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      status: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
    },
  });

  if (current?.status !== RegistrationStatus.CANCELLED) {
    return false;
  }

  const paymentIntentId =
    data.stripePaymentIntentId ?? current.stripePaymentIntentId;

  if (!paymentIntentId) {
    logError(
      new Error(
        "claimEventRegistrationAsPaid: missing stripePaymentIntentId for a cancelled event registration",
      ),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "claimEventRegistrationAsPaid",
          registrationId,
          currentPaymentStatus: current.paymentStatus,
        },
      },
    );
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND,
        title:
          NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND],
        message: `イベント申込 ${registrationId} はキャンセル済みですが Stripe 決済が成立しました。PaymentIntent ID が不明なため自動返金できません（要確認）`,
        resourceType: "event-registration",
        resourceId: registrationId,
      }),
      {
        operation:
          "notifyEventRegistrationAutoRefundFailedMissingPaymentIntentId",
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: { registrationId },
      },
    );
    return false;
  }

  try {
    const refunded =
      await refundOrphanedStripePaymentForCancelledEventRegistration({
        registrationId,
        stripePaymentIntentId: paymentIntentId,
      });
    if (refunded.outcome === "refunded") {
      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND,
          title:
            NOTIFICATION_TYPE_LABELS[
              NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND
            ],
          message: `イベント申込 ${registrationId} はキャンセル済みですが Stripe 決済が成立したため、自動で全額返金しました（返金額: ${refunded.refundAmount ?? 0} 円）`,
          resourceType: "event-registration",
          resourceId: registrationId,
        }),
        {
          operation: "notifyEventRegistrationAutoRefundedAfterCancel",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            registrationId,
            stripePaymentIntentId: paymentIntentId,
            refundId: refunded.refundId,
          },
        },
      );
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.CRITICAL,
      context: {
        operation: "refundOrphanedStripePaymentForCancelledEventRegistration",
        registrationId,
        stripePaymentIntentId: paymentIntentId,
        currentPaymentStatus: current.paymentStatus,
      },
    });
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND,
        title:
          NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND],
        message: `イベント申込 ${registrationId} はキャンセル済みですが Stripe 決済が成立しました。自動返金に失敗しました（PaymentIntent: ${paymentIntentId}）。至急確認してください。`,
        resourceType: "event-registration",
        resourceId: registrationId,
      }),
      {
        operation: "notifyEventRegistrationAutoRefundFailedAfterCancel",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.CRITICAL,
        context: { registrationId, stripePaymentIntentId: paymentIntentId },
      },
    );
  }

  return false;
}

/**
 * EventRegistration の webhook expired/failed 経路。
 * PAID / REFUNDED / FAILED は上書きしない。
 *
 * `sessionId` 一致必須（Task 9 で追加。Reservation の `claimReservationAsFailed`
 * と同型、Codex PR #1043 P1 対応と同じ理由）。
 * `createWaitlistOfferCheckoutSessionCommand` は 24h offer window 内の再決済
 * （FAILED → PENDING）を許容するため、stale な旧 session の expired/failed webhook
 * が「新しい checkout で作られた PENDING session」を巻き込んで誤って FAILED に
 * 上書きするのを防ぐ。この関数は Task 9 で初めて webhook から呼ばれる
 * （PR#9/10 時点では未配線だった）ため、配線と同時にガードを追加している。
 */
export async function claimEventRegistrationAsFailed(
  registrationId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      stripeCheckoutSessionId: sessionId,
      paymentStatus: {
        notIn: [
          PaymentStatus.PAID,
          PaymentStatus.REFUNDED,
          PaymentStatus.FAILED,
        ],
      },
    },
    data: { paymentStatus: PaymentStatus.FAILED },
  });
  return result.count > 0;
}

/**
 * Stripe Checkout fulfill 前の amount_total 照合用。
 * `paidAmount` (checkout settle 時に書込) を優先し、未設定なら ticket.price × quantity。
 */
export async function getEventRegistrationCheckoutExpectedAmount(
  registrationId: string,
): Promise<number | null> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      paidAmount: true,
      quantity: true,
      ticket: { select: { price: true } },
    },
  });
  if (!registration) return null;

  if (registration.paidAmount != null && registration.paidAmount > 0) {
    return registration.paidAmount;
  }

  const computed = registration.ticket.price * registration.quantity;
  return computed > 0 ? computed : null;
}

/**
 * 非同期決済 (konbini / customer_balance) の `checkout.session.completed` で
 * `payment_status !== "paid"` のとき、PaymentIntent ID のみ保存する
 * (Reservation の `savePaymentIntentId` と同型)。
 *
 * `checkout.session.async_payment_succeeded` の event-registration 配線は
 * Fix commit（レビュー Important #2）で追加済み: 非同期決済が成功すると
 * `fulfillEventRegistrationPaymentAtomically` が呼ばれ `claimEventRegistrationAsPaid`
 * が最終的な `stripePaymentIntentId` を確定させる（新しい webhook payload の
 * `session.payment_intent` から独立して再取得するため、ここで保存した値を
 * 読み返すわけではない）。この関数が保存する ID は PENDING 期間中の admin
 * 可視性のための中間状態。`update`（存在しない id で throw）ではなく
 * `updateMany` を使い、想定外の race（該当行なし）で webhook 全体が
 * 500 化しないようにする。
 */
export async function saveEventRegistrationPaymentIntentId(
  registrationId: string,
  paymentIntentId: string,
): Promise<void> {
  await prisma.eventRegistration.updateMany({
    where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
    data: { stripePaymentIntentId: paymentIntentId },
  });
}

/**
 * 領収書発行通知の detailUrl 分岐用（会員 mypage / ゲスト status）。
 * webhook は claim が boolean のみ返すため、notify 直前に customerId を読む。
 */
export async function findEventRegistrationForReceiptNotify(
  registrationId: string,
): Promise<{ customerId: string | null } | null> {
  return prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { customerId: true },
  });
}

/**
 * stripePaymentIntentId で EventRegistration を検索
 * (`findReservationByPaymentIntent` の event 対称版)。
 */
export async function findEventRegistrationByPaymentIntent(
  paymentIntentId: string,
) {
  return prisma.eventRegistration.findFirst({
    where: {
      stripePaymentIntentId: paymentIntentId,
      event: { deletedAt: null },
    },
    select: { id: true, paymentStatus: true, paidAmount: true },
  });
}

/**
 * Waitlist capacity-race orphan: confirm が EXPIRED 化した後、Stripe retry /
 * dedup 再入で webhook が戻ってきたときに拾う。
 *
 * `status=EXPIRED` + `paymentStatus=PENDING` のみ。PAID/REFUNDED は対象外。
 */
export async function findExpiredPendingWaitlistOfferRegistration(
  registrationId: string,
): Promise<{ id: string } | null> {
  return prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: RegistrationStatus.EXPIRED,
      paymentStatus: PaymentStatus.PENDING,
      event: { deletedAt: null },
    },
    select: { id: true },
  });
}

/**
 * Paid Checkout Session 到達後に fulfill できず返金が必要な waitlist offer を拾う。
 * confirm の CONFLICT / 再読込 race 後の webhook retry 用。
 */
export async function findWaitlistOfferRegistrationNeedingRefundAfterPaidSession(
  registrationId: string,
): Promise<{ id: string; status: RegistrationStatus } | null> {
  return prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: {
        in: [RegistrationStatus.EXPIRED, RegistrationStatus.WAITLISTED_OFFERED],
      },
      paymentStatus: {
        in: [PaymentStatus.UNPAID, PaymentStatus.PENDING],
      },
      event: { deletedAt: null },
    },
    select: { id: true, status: true },
  });
}

/**
 * 返金コマンド前提の EXPIRED 化。WAITLISTED_OFFERED + unpaid/pending のみ対象。
 */
export async function expireWaitlistOfferForRefundIfNeeded(
  registrationId: string,
): Promise<void> {
  await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.WAITLISTED_OFFERED,
      paymentStatus: {
        in: [PaymentStatus.UNPAID, PaymentStatus.PENDING],
      },
    },
    data: { status: RegistrationStatus.EXPIRED },
  });
}

/**
 * `charge.refunded` webhook から呼ぶ event registration 版の idempotent refund 反映。
 *
 * Reservation 側 `applyChargeRefundIdempotent` (payment-queries.ts) の対称版:
 * - Stripe charge の `amount` / `amount_refunded` で partial/full を判定
 * - Refund child table への idempotent write (`stripeRefundId @unique`)
 * - EventRegistration.paymentStatus を PARTIALLY_REFUNDED / REFUNDED に atomic 遷移
 */
export async function applyEventChargeRefundIdempotent(input: {
  readonly registrationId: string;
  readonly chargeAmount: number;
  readonly amountRefunded: number;
  readonly currency: string;
  readonly latestRefund: {
    readonly id: string;
    readonly amount: number;
    /**
     * Stripe refund.metadata.initiator: app 側 refund path が仕込んだ RefundedByType。
     * webhook が先着した race で attribution 復元用。無ければ "STRIPE_DASHBOARD" fallback。
     */
    readonly metadata?: Record<string, string | undefined> | null | undefined;
  } | null;
}): Promise<void> {
  const {
    registrationId,
    chargeAmount,
    amountRefunded,
    currency,
    latestRefund,
  } = input;

  if (latestRefund) {
    // Reservation 側と同型: 単一 create + catch(P2002) で真 atomic idempotent (PR #1146
    // Codex P2 追加対応、Prisma upsert issue #20229 回避)。Stripe unit_amount からアプリ
    // 単位への逆変換 (PR #1130 P2、PR #1126 P1 と同型) も継続。
    // Reservation 側 payment-queries と同型: Stripe refund.metadata.initiator が
    // 既知の RefundedByType なら attribution を復元、無い / 未知なら
    // "STRIPE_DASHBOARD" fallback (webhook 先着 race の mislabel を防ぐ)。
    const initiatorMeta = latestRefund.metadata?.["initiator"];
    const refundedByType = isValidRefundedByType(initiatorMeta)
      ? initiatorMeta
      : REFUNDED_BY_TYPE.STRIPE_DASHBOARD;
    try {
      await prisma.refund.create({
        data: {
          eventRegistrationId: registrationId,
          amount: fromStripeUnitAmount(latestRefund.amount, currency),
          stripeRefundId: latestRefund.id,
          refundedByType,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error, "stripeRefundId")) throw error;
    }
  }

  const isFullRefund = amountRefunded >= chargeAmount;
  const newStatus = isFullRefund
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;

  await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      },
    },
    data: { paymentStatus: newStatus },
  });
}
