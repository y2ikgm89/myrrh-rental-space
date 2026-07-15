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
          PaymentStatus.PARTIALLY_REFUNDED,
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

/**
 * `charge.refunded` webhook から呼ぶ、部分/全額返金対応の idempotent 反映処理。
 *
 * Codex P1 (PR #1125, comment 3588489513) 対応。旧実装 (`claimReservationAsRefunded`) は
 * partial refund でも fire する `charge.refunded` event に対して常に REFUNDED へ flip する
 * ため、`refundReservationPaymentCommand` が PARTIALLY_REFUNDED に設定した状態を
 * 上書きし追加返金経路を潰していた。
 *
 * 修正: Stripe charge の `amount` / `amount_refunded` で partial/full を判定し、
 * paymentStatus を PARTIALLY_REFUNDED / REFUNDED に atomic 遷移する。
 * Refund child table は `stripeRefundId @unique` で idempotent 書込 (command 経由で
 * 先書きされている場合は skip、Dashboard 手動 refund 経路のみ書込)。
 *
 * @param input.reservationId       対象予約 ID
 * @param input.chargeAmount        `charge.amount` (実 charge 額、Stripe unit_amount 単位)
 * @param input.amountRefunded      `charge.amount_refunded` (累積返金額、Stripe unit_amount 単位)
 * @param input.latestRefund        `charge.refunds?.data[0]` から取り出した最新 refund の id と amount
 *                                  (webhook payload の refunds は default で 10 件まで含まれる;
 *                                  無い場合は paymentStatus 遷移のみで Refund child 書込は skip)
 */
export async function applyChargeRefundIdempotent(input: {
  readonly reservationId: string;
  readonly chargeAmount: number;
  readonly amountRefunded: number;
  readonly latestRefund: {
    readonly id: string;
    readonly amount: number;
  } | null;
}): Promise<void> {
  const { reservationId, chargeAmount, amountRefunded, latestRefund } = input;

  if (latestRefund) {
    // Refund child への idempotent write。command 経由で先書きされている場合は skip
    // (`refundReservationPaymentCommand` 内でも同 stripeRefundId が既存なら skip する belt-and-suspenders)。
    const existing = await prisma.refund.findUnique({
      where: { stripeRefundId: latestRefund.id },
    });
    if (!existing) {
      // command 経由でない = Stripe Dashboard から手動 refund の想定 (refundedByType=STRIPE_DASHBOARD)
      await prisma.refund.create({
        data: {
          reservationId,
          amount: latestRefund.amount,
          stripeRefundId: latestRefund.id,
          refundedByType: "STRIPE_DASHBOARD",
        },
      });
    }
  }

  const isFullRefund = amountRefunded >= chargeAmount;
  const newStatus = isFullRefund
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;

  // paymentStatus 遷移 (updateMany の WHERE で status guard、REFUNDED を PARTIALLY_REFUNDED に
  // 巻き戻すことは絶対にしない)。
  await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      },
    },
    data: { paymentStatus: newStatus },
  });
}
