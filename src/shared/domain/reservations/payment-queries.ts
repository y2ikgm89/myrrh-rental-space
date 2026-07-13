import "server-only";

import { PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

const PAYMENT_EMAIL_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  totalPrice: true,
  notes: true,
  paymentStatus: true,
  status: true,
  icsSequence: true,
  userId: true,
  guestEmail: true,
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
 * 決済完了の atomic claim: 未払い / 決済待ちの予約のみを PAID に遷移させる。
 *
 * Stripe webhook は `checkout.session.completed` と `async_payment_succeeded` を
 * 並行配信しうる（公式仕様）。`findUnique → update` の 2 ステップでは race window が
 * 残るため、`updateMany({ where: { paymentStatus: { in: [UNPAID, PENDING] } } })`
 * の **WHERE 条件** 自体で claim する（PostgreSQL の単一 UPDATE は atomic）。
 * FAILED / REFUNDED などの終端状態は webhook の順序揺れで PAID に戻さない。
 *
 * @returns claim 成功時のみ予約データを返す。既に PAID / FAILED / REFUNDED
 *   （重複配信 / 既処理 / 終端状態）または予約が存在しない場合は `null` を返し、
 *   呼び出し元はメール送信や cache invalidate を skip する。
 */
export async function claimReservationAsPaid(
  reservationId: string,
  data: {
    stripePaymentIntentId: string | null;
  },
) {
  const result = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
  });

  if (result.count === 0) {
    return null;
  }

  // claim 成功後にメール送信用の relation 付きデータを取得
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: PAYMENT_EMAIL_SELECT,
  });
}

/**
 * 決済失敗の atomic claim: PAID / REFUNDED 以外の予約のみ FAILED に遷移させる。
 *
 * ## Session 一致必須 (Codex PR #1043 P1)
 *
 * `sessionId` を WHERE に含めることで「stale webhook が別 session を巻き込んで FAILED
 * にする」race を封殺する。具体シナリオ:
 *
 * 1. OLD session: `checkout.session.expired` 発火 → FAILED
 * 2. 顧客が再決済 (`createCheckoutSessionCommand`) → `stripeCheckoutSessionId`
 *    が NEW session id に置換、paymentStatus は FAILED→PENDING に巻き戻し
 * 3. Stripe が OLD session の expired webhook を再配信 (at-least-once 契約)
 * 4. **旧実装**: reservationId のみで claim → NEW session の PENDING が FAILED に飛ぶ
 * 5. NEW session の `checkout.session.completed` 到着 → `claimReservationAsPaid` は
 *    FAILED を accept しない → 顧客は支払ったのに reservation は FAILED のまま停滞、
 *    会計 mismatch (Stripe 側 charge あり × DB 側 unpaid) が焼き付く
 *
 * 修正: WHERE に `stripeCheckoutSessionId: sessionId` を追加。OLD session の webhook が
 * 届いても NEW session と id が一致せず count=0 の no-op になる。
 *
 * @returns claim 成功時 `true`。既に PAID / REFUNDED や予約不在、または session id
 *   不一致 (stale webhook) で no-op の場合 `false`。
 */
export async function claimReservationAsFailed(
  reservationId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      // Session 一致必須。stale webhook が別 session に飛び火して PENDING を
      // FAILED に巻き込むのを防ぐ (Codex PR #1043 P1)。
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
 * 返金完了の atomic claim: REFUNDED 以外の予約のみ REFUNDED に遷移させる。
 *
 * @returns claim 成功時 `true`。既に REFUNDED または予約不在で no-op の場合 `false`。
 */
export async function claimReservationAsRefunded(
  reservationId: string,
): Promise<boolean> {
  const result = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      paymentStatus: { not: PaymentStatus.REFUNDED },
    },
    data: { paymentStatus: PaymentStatus.REFUNDED },
  });
  return result.count > 0;
}
