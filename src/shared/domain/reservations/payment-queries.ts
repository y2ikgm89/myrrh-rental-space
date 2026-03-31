import "server-only";

import { PaymentStatus } from "@/shared/db/enums";
import { prisma } from "@/shared/db/prisma";

const PAYMENT_EMAIL_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  totalPrice: true,
  notes: true,
  paymentStatus: true,
  customer: {
    select: {
      email: true,
      lastName: true,
      firstName: true,
    },
  },
  space: {
    select: {
      name: true,
      location: {
        select: { name: true },
      },
    },
  },
} as const;

/**
 * 予約の現在の paymentStatus を取得（べき等性チェック用）
 */
export async function getReservationPaymentStatus(reservationId: string) {
  return prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: { id: true, paymentStatus: true },
  });
}

/**
 * 決済完了: paymentStatus → PAID
 * べき等性: 呼び出し元で現在のステータスを事前チェックすること
 */
export async function updateReservationPaymentCompleted(
  reservationId: string,
  data: {
    stripePaymentIntentId: string | null;
  },
) {
  return prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
    select: PAYMENT_EMAIL_SELECT,
  });
}

/**
 * 決済失敗: paymentStatus → FAILED
 */
export async function markReservationPaymentFailed(reservationId: string) {
  return prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: { paymentStatus: PaymentStatus.FAILED },
  });
}

/**
 * stripePaymentIntentId で予約を検索
 */
export async function findReservationByPaymentIntent(paymentIntentId: string) {
  return prisma.reservation.findFirst({
    where: {
      stripePaymentIntentId: paymentIntentId,
      deletedAt: null,
    },
    select: { id: true, paymentStatus: true },
  });
}

/**
 * 非同期決済の PaymentIntent ID のみ保存（paymentStatus は PENDING のまま）
 * checkout.session.completed で payment_status === "unpaid" の場合に使用
 */
export async function savePaymentIntentId(
  reservationId: string,
  paymentIntentId: string,
) {
  return prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: { stripePaymentIntentId: paymentIntentId },
  });
}

/**
 * 返金完了: paymentStatus → REFUNDED
 */
export async function markReservationRefunded(reservationId: string) {
  return prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: { paymentStatus: PaymentStatus.REFUNDED },
  });
}
