import "server-only";

import {
  AuditAction,
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  applyStripeChargeRefundIdempotent,
  buildChargeRefundPaymentStatusWhere,
  handlePaidClaimMissWithOrphanRefund,
} from "@/shared/domain/payment/payment-claim-orchestration";
import {
  buildFailedClaimUpdateData,
  buildPaidClaimUpdateData,
  PAYMENT_STATUSES_CLAIMABLE_FOR_PAID,
  PAYMENT_STATUSES_EXCLUDED_FROM_FAILED_CLAIM_EVENT,
} from "@/shared/domain/payment/payment-status-guards";
import { refundOrphanedStripePaymentForCancelledEventRegistration } from "@/shared/domain/events/payment-commands";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import { REFUND_AGGREGATE_EXCLUDED_STATUSES } from "@/shared/domain/payment/stripe-refund-orchestration";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

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
      paymentStatus: { in: [...PAYMENT_STATUSES_CLAIMABLE_FOR_PAID] },
    },
    data: buildPaidClaimUpdateData({
      stripePaymentIntentId: data.stripePaymentIntentId,
    }),
  });

  if (result.count > 0) {
    return true;
  }

  const current = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      status: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      eventId: true,
    },
  });

  if (!current) {
    return false;
  }

  const eventResourceLink = {
    resourceType: "event" as const,
    resourceId: current.eventId,
  };

  await handlePaidClaimMissWithOrphanRefund({
    entityId: registrationId,
    webhookPaymentIntentId: data.stripePaymentIntentId,
    current,
    cancelledStatus: RegistrationStatus.CANCELLED,
    operation: "claimEventRegistrationAsPaid",
    refundOrphan: ({ stripePaymentIntentId }) =>
      refundOrphanedStripePaymentForCancelledEventRegistration({
        registrationId,
        stripePaymentIntentId,
      }),
    notifications: {
      missingPaymentIntent: {
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND,
        title:
          NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND],
        message: `イベント申込 ${registrationId} はキャンセル済みですが Stripe 決済が成立しました。PaymentIntent ID が不明なため自動返金できません（要確認）`,
        ...eventResourceLink,
      },
      refunded: (refundAmount) => ({
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND,
        title:
          NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND],
        message: `イベント申込 ${registrationId} はキャンセル済みですが Stripe 決済が成立したため、自動で全額返金しました（返金額: ${refundAmount} 円）`,
        ...eventResourceLink,
      }),
      refundFailed: (paymentIntentId) => ({
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND,
        title:
          NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND],
        message: `イベント申込 ${registrationId} はキャンセル済みですが Stripe 決済が成立しました。自動返金に失敗しました（PaymentIntent: ${paymentIntentId}）。至急確認してください。`,
        ...eventResourceLink,
      }),
    },
    notifyContext: {
      missingPaymentIntentOperation:
        "notifyEventRegistrationAutoRefundFailedMissingPaymentIntentId",
      refundedOperation: "notifyEventRegistrationAutoRefundedAfterCancel",
      refundFailedOperation:
        "notifyEventRegistrationAutoRefundFailedAfterCancel",
    },
    rethrowRefundFailure: false,
  });

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
        notIn: [...PAYMENT_STATUSES_EXCLUDED_FROM_FAILED_CLAIM_EVENT],
      },
    },
    data: buildFailedClaimUpdateData(),
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

  await applyStripeChargeRefundIdempotent({
    chargeAmount,
    amountRefunded,
    currency,
    latestRefund,
    createRefundRecord: async (refundData) => {
      await prisma.refund.create({
        data: {
          eventRegistrationId: registrationId,
          ...refundData,
        },
      });
    },
    updatePaymentStatus: async (newStatus) => {
      await prisma.eventRegistration.updateMany({
        where: {
          id: registrationId,
          ...buildChargeRefundPaymentStatusWhere(),
        },
        data: { paymentStatus: newStatus },
      });
    },
  });
}

/**
 * refund.updated (status → "succeeded") webhook 確定時に呼ぶ、konbini /
 * customer_balance 等の非同期返金の後日確定処理。
 * Reservation 側 `finalizeSettledReservationRefund` と同型
 * (events 側は返金完了メール送信の仕組み自体が現状無いため paymentStatus 反映のみ、
 * refundedByType による ADMIN(部分返金対応) / AUTO_*(常に単発全額) の分岐も同様。
 * 詳細は reservations 側の docstring 参照、Codex review PR #1665)。
 *
 * @returns true = 今回このコマンドが確定処理を行った。false = 既に確定済み
 *          (webhook 重複配送・re-try) で idempotent に no-op、または対象申込が
 *          消失済み。
 */
export async function finalizeSettledEventRegistrationRefund(
  registrationId: string,
  stripeRefundId: string,
  refundedByType: string,
): Promise<boolean> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { paidAmount: true },
  });
  if (!registration || registration.paidAmount === null) {
    return false;
  }

  const aggregate = await prisma.refund.aggregate({
    where: {
      eventRegistrationId: registrationId,
      status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
    },
    _sum: { amount: true },
  });
  const cumulativeSettled = aggregate._sum.amount ?? 0;
  const isAdminPartialRefund = refundedByType === REFUNDED_BY_TYPE.ADMIN;
  const willBeFullyRefunded = isAdminPartialRefund
    ? cumulativeSettled >= registration.paidAmount
    : true;

  const updated = await prisma.eventRegistration.updateMany({
    where: isAdminPartialRefund
      ? {
          id: registrationId,
          paymentStatus: {
            in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
          },
        }
      : {
          id: registrationId,
          paymentStatus: { not: PaymentStatus.REFUNDED },
        },
    data: {
      paymentStatus: willBeFullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED,
    },
  });
  if (updated.count === 0) {
    return false;
  }

  // 保留していた完了状態への遷移が今回確定した事実を append-only 証跡に残す
  // (Codex review, PR #1665: pending 時点の AuditLog は状態未確定である旨のみ記録し、
  // 確定した完了遷移はここで別エントリとして記録する)。webhook 起点のため userId
  // は付与しない。
  await createAuditLogRecord({
    action: AuditAction.UPDATE,
    resource: "event-registration",
    resourceId: registrationId,
    newValue: {
      paymentStatus: willBeFullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED,
      refundedAmount: cumulativeSettled,
    },
    metadata: {
      operation: "finalizeSettledEventRegistrationRefund",
      stripeRefundId,
      cumulativeAmount: cumulativeSettled,
    },
  });

  return true;
}
