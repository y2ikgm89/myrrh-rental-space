import "server-only";

import { PaymentStatus, ReservationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import { fromStripeUnitAmount } from "@/shared/lib/stripe-shared";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { refundOrphanedStripePaymentForCancelledReservation } from "@/shared/domain/reservations/payment-commands";
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
  // STRIPE-02 (HIGH): status ガード追加。cancel-core.ts の cancel path は
  // status=CANCELLED に flip するが paymentStatus は UNPAID/PENDING のまま残す
  // (payment-commands.ts:82-92 コメント明示)。ここで status ガード無しだと、
  // Stripe Checkout URL が cancel 後も生きているため顧客が古いタブに戻って決済完了 →
  // webhook 到達 → paymentStatus=PENDING に一致 count=1 で PAID に flip →
  // status=CANCELLED / paymentStatus=PAID の不整合ペア焼き付き (自動返金導線なし
  // で silent 会計 mismatch)。events/payment-commands.ts:548
  // (claimEventRegistrationAsPaid) が status: CONFIRMED を含めているのと対称化。
  // createCheckoutSessionCommand の Codex P1 (PR#1022) と同型の status guard。
  const result = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
  });

  if (result.count === 0) {
    // count=0 の大半は無害 (重複 webhook 配信・既に PAID 等の想定内 no-op) だが、
    // status=CANCELLED での不一致だけは「Stripe 側は課金成功したのに DB は
    // キャンセル済みのまま」という money-in-flight を意味し自動返金導線が無い。
    // clean-break: 自動返金で即時収束させ、運用が追えるよう通知を残す。
    const current = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        status: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
      },
    });
    if (current?.status === ReservationStatus.CANCELLED) {
      const paymentIntentId =
        data.stripePaymentIntentId ?? current.stripePaymentIntentId;

      if (!paymentIntentId) {
        logError(
          new Error(
            "claimReservationAsPaid: missing stripePaymentIntentId for a cancelled reservation",
          ),
          {
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.CRITICAL,
            context: {
              operation: "claimReservationAsPaid",
              reservationId,
              currentPaymentStatus: current.paymentStatus,
            },
          },
        );
        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_REFUND,
            title:
              NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
            message: `予約 ${reservationId} はキャンセル済みですが Stripe 決済が成立しました。PaymentIntent ID が不明なため自動返金できません（要確認）`,
            resourceType: "reservation",
            resourceId: reservationId,
          }),
          {
            operation:
              "notifyReservationAutoRefundFailedMissingPaymentIntentId",
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.HIGH,
            context: { reservationId },
          },
        );
        return null;
      }

      try {
        const refunded =
          await refundOrphanedStripePaymentForCancelledReservation({
            reservationId,
            stripePaymentIntentId: paymentIntentId,
          });
        if (refunded.outcome === "refunded") {
          fireAndForget(
            createNotificationCommand({
              type: NOTIFICATION_TYPE.RESERVATION_REFUND,
              title:
                NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
              message: `予約 ${reservationId} はキャンセル済みですが Stripe 決済が成立したため、自動で全額返金しました（返金額: ${refunded.refundAmount ?? 0} 円）`,
              resourceType: "reservation",
              resourceId: reservationId,
            }),
            {
              operation: "notifyReservationAutoRefundedAfterCancel",
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.MEDIUM,
              context: {
                reservationId,
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
            operation: "refundOrphanedStripePaymentForCancelledReservation",
            reservationId,
            stripePaymentIntentId: paymentIntentId,
            currentPaymentStatus: current.paymentStatus,
          },
        });
        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_REFUND,
            title:
              NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
            message: `予約 ${reservationId} はキャンセル済みですが Stripe 決済が成立しました。自動返金に失敗しました（PaymentIntent: ${paymentIntentId}）。至急確認してください。`,
            resourceType: "reservation",
            resourceId: reservationId,
          }),
          {
            operation: "notifyReservationAutoRefundFailedAfterCancel",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.CRITICAL,
            context: { reservationId, stripePaymentIntentId: paymentIntentId },
          },
        );
        throw error;
      }
    }
    return null;
  }

  // claim 成功後にメール送信用の relation 付きデータを取得
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: PAYMENT_EMAIL_SELECT,
  });
}

/**
 * Stripe Checkout fulfill 前の amount_total 照合用。
 * Checkout Session 作成時に Stripe へ渡した税込合計 (`totalPriceWithTax`) を返す。
 */
export async function getReservationCheckoutExpectedAmount(
  reservationId: string,
): Promise<number | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: { totalPriceWithTax: true },
  });
  if (
    !reservation ||
    reservation.totalPriceWithTax === null ||
    reservation.totalPriceWithTax <= 0
  ) {
    return null;
  }
  return reservation.totalPriceWithTax;
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

  if (result.count > 0) {
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_PAYMENT_FAILED,
        title:
          NOTIFICATION_TYPE_LABELS[
            NOTIFICATION_TYPE.RESERVATION_PAYMENT_FAILED
          ],
        message: `予約 ${reservationId} の決済が失敗しました`,
        resourceType: "reservation",
        resourceId: reservationId,
      }),
      {
        operation: "notifyReservationPaymentFailed",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: { reservationId, sessionId },
      },
    );
  }

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
 * 非同期決済の PaymentIntent ID のみ保存（paymentStatus は PENDING のまま）。
 * `checkout.session.completed` で `payment_status !== "paid"` の場合に使用。
 *
 * Event の `saveEventRegistrationPaymentIntentId` と同型の `updateMany` guard:
 * - `paymentStatus` が UNPAID / PENDING の行のみ更新（PAID 等への stale webhook 上書き防止）
 * - `stripeCheckoutSessionId` 一致必須（`claimReservationAsFailed` と同型。OLD session の
 *   `checkout.session.completed` が NEW session へ PI を書き込む race を封殺）
 *
 * 該当行なし（race / 既処理 / session 不一致）は count=0 の no-op。webhook 全体を 500 化しない。
 */
export async function savePaymentIntentId(
  reservationId: string,
  paymentIntentId: string,
  sessionId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      stripeCheckoutSessionId: sessionId,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] },
    },
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
 * @param input.currency            `charge.currency` (ISO 4217、Refund.amount を app 単位で
 *                                  保存するための逆変換に使用)
 * @param input.latestRefund        `charge.refunds?.data[0]` から取り出した最新 refund の id と amount
 *                                  (webhook payload の refunds は default で 10 件まで含まれる;
 *                                  無い場合は paymentStatus 遷移のみで Refund child 書込は skip)
 */
export async function applyChargeRefundIdempotent(input: {
  readonly reservationId: string;
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
    reservationId,
    chargeAmount,
    amountRefunded,
    currency,
    latestRefund,
  } = input;

  if (latestRefund) {
    // Refund child への真 atomic な idempotent write (PR #1146 Codex P2 追加対応):
    // Prisma の `upsert({where, create, update: {}})` は SELECT+INSERT に compile される
    // ため並行 create で `refunds_stripeRefundId_key` 一意制約違反が依然発生する
    // (Prisma issue #20229)。 単一 `create` + `catch (P2002)` で idempotent success 化する
    // (INSERT statement 自体は PostgreSQL レベルで atomic なので race window なし)。
    // 既存 = command 経由で先書きされているケース。silent skip で書込主体・金額を保持する
    // belt-and-suspenders 契約は不変。
    //
    // `Refund.amount` は app 単位 (JPY 円 / USD ドル) 保存 (PR #1126 P1 対応)。JPY
    // (zero-decimal) では偶然一致するが、USD/EUR 等では 100 倍で保存されて後続の refund
    // 集計・残額判定が壊れるため Stripe unit_amount からの逆変換が必須。
    try {
      // Stripe refund.metadata.initiator に app 側が仕込んだ attribution が
      // あればそれを使う (webhook が command 側の書込より先着した race で
      // AUTO_ON_CANCEL / ADMIN の refund が "STRIPE_DASHBOARD" と mislabel
      // されるのを防ぐ)。metadata が空 / 未知値なら真の Stripe Dashboard 発行として扱う。
      const initiatorMeta = latestRefund.metadata?.["initiator"];
      const refundedByType = isValidRefundedByType(initiatorMeta)
        ? initiatorMeta
        : REFUNDED_BY_TYPE.STRIPE_DASHBOARD;
      await prisma.refund.create({
        data: {
          reservationId,
          amount: fromStripeUnitAmount(latestRefund.amount, currency),
          stripeRefundId: latestRefund.id,
          refundedByType,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error, "stripeRefundId")) throw error;
      // P2002 on stripeRefundId = 別経路 (command / 並行 webhook) が先着書込済 = idempotent success
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
