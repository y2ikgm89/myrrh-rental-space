import "server-only";

import {
  AuditAction,
  PaymentStatus,
  ReservationStatus,
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
  PAYMENT_STATUSES_EXCLUDED_FROM_FAILED_CLAIM_RESERVATION,
  PAYMENT_STATUSES_SAVE_PAYMENT_INTENT,
} from "@/shared/domain/payment/payment-status-guards";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { refundOrphanedStripePaymentForCancelledReservation } from "@/shared/domain/reservations/payment-commands";
import { fetchReservationEmailData } from "@/shared/domain/reservations/payloads";
import { sendReservationRefundEmail } from "@/shared/domain/email/lib-dispatch";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import {
  acquirePaymentRefundAdvisoryLock,
  claimRefundSettlement,
  PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import type { Prisma } from "@generated/prisma/client";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

const PAYMENT_EMAIL_SELECT = {
  id: true,
  spaceId: true,
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
} as const satisfies Prisma.ReservationSelect;

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
      paymentStatus: { in: [...PAYMENT_STATUSES_CLAIMABLE_FOR_PAID] },
    },
    data: buildPaidClaimUpdateData({
      stripePaymentIntentId: data.stripePaymentIntentId,
    }),
  });

  if (result.count === 0) {
    const current = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        status: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
      },
    });
    await handlePaidClaimMissWithOrphanRefund({
      entityId: reservationId,
      webhookPaymentIntentId: data.stripePaymentIntentId,
      current,
      cancelledStatus: ReservationStatus.CANCELLED,
      operation: "claimReservationAsPaid",
      refundOrphan: ({ stripePaymentIntentId }) =>
        refundOrphanedStripePaymentForCancelledReservation({
          reservationId,
          stripePaymentIntentId,
        }),
      notifications: {
        missingPaymentIntent: {
          type: NOTIFICATION_TYPE.RESERVATION_REFUND,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
          message: `予約 ${reservationId} はキャンセル済みですが Stripe 決済が成立しました。PaymentIntent ID が不明なため自動返金できません（要確認）`,
          resourceType: "reservation",
          resourceId: reservationId,
        },
        refunded: (refundAmount) => ({
          type: NOTIFICATION_TYPE.RESERVATION_REFUND,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
          message: `予約 ${reservationId} はキャンセル済みですが Stripe 決済が成立したため、自動で全額返金しました（返金額: ${refundAmount} 円）`,
          resourceType: "reservation",
          resourceId: reservationId,
        }),
        refundFailed: (paymentIntentId) => ({
          type: NOTIFICATION_TYPE.RESERVATION_REFUND,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
          message: `予約 ${reservationId} はキャンセル済みですが Stripe 決済が成立しました。自動返金に失敗しました（PaymentIntent: ${paymentIntentId}）。至急確認してください。`,
          resourceType: "reservation",
          resourceId: reservationId,
        }),
      },
      notifyContext: {
        missingPaymentIntentOperation:
          "notifyReservationAutoRefundFailedMissingPaymentIntentId",
        refundedOperation: "notifyReservationAutoRefundedAfterCancel",
        refundFailedOperation: "notifyReservationAutoRefundFailedAfterCancel",
      },
      rethrowRefundFailure: true,
    });
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
        notIn: [...PAYMENT_STATUSES_EXCLUDED_FROM_FAILED_CLAIM_RESERVATION],
      },
    },
    data: buildFailedClaimUpdateData(),
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
      paymentStatus: { in: [...PAYMENT_STATUSES_SAVE_PAYMENT_INTENT] },
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

  await applyStripeChargeRefundIdempotent({
    chargeAmount,
    amountRefunded,
    currency,
    latestRefund,
    createRefundRecord: async (refundData) => {
      await prisma.refund.create({
        data: {
          reservationId,
          ...refundData,
        },
      });
    },
    updatePaymentStatus: async (newStatus) => {
      await prisma.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          ...buildChargeRefundPaymentStatusWhere(),
        },
        data: { paymentStatus: newStatus },
      });
    },
  });
}

/**
 * 呼び出し元が必ず単発で残額全額を請求する自動返金経路。STRIPE_DASHBOARD
 * (Stripe ダッシュボード経由の手動返金) は ADMIN と同じく人間が任意額を
 * 指定しうるため、ここには含めない (Codex review, PR #1666)。
 */
const AUTOMATED_FULL_REFUND_TYPES: readonly string[] = [
  REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
  REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
  REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
];

/**
 * refund.updated (status → "succeeded") webhook 確定時に呼ぶ、konbini /
 * customer_balance 等の非同期返金の後日確定処理。
 *
 * `createRefundRecordIdempotent` 系の各 refund 作成経路は、Stripe が同期的に
 * 確定できない返金 (status !== "succeeded") では paymentStatus を書き換えずに
 * 温存する (silent false-positive な返金完了通知を防ぐため)。この関数が
 * webhook 確定後にその「保留していた」paymentStatus 反映と返金完了メール送信を行う。
 *
 * ## 冪等性の設計 (Codex review, PR #1666)
 *
 * 唯一の権威ある冪等性ゲートは、tx 内で行う **この refund 単位の Refund.status
 * claim**（非終端状態 → "succeeded"）である。entity (Reservation) 側の
 * paymentStatus を claim に使わないのは、部分返金では遷移先
 * (PARTIALLY_REFUNDED) が遷移前と同値になり得て非単調なため、webhook の
 * at-least-once 再配信のたびに完了 AuditLog・返金完了メールが重複実行されて
 * しまうから。claim (Refund.status 遷移) と entity 側の paymentStatus 反映は
 * 同一 tx 内で atomic に行い、claim 成功後にプロセスが落ちても DB 上は
 * 「未着手」に巻き戻る (tx 全体が rollback される) ため、再配信は安全に
 * 最初からやり直せる。tx 確定後の AuditLog 書込・メール送信のみ tx 外
 * (audit-log の hash-chain 書込は独自の serializable tx を持つため同一 tx に
 * ネストできない) — この区間でのクラッシュは稀な残存リスクとして許容する
 * (webhook 再配信では claim が既に消費済みのため再実行されない＝欠落はしても
 * 重複はしない)。
 *
 * `refundedByType` で分岐する:
 * - ADMIN と STRIPE_DASHBOARD (管理者手動返金 / Stripe ダッシュボード経由の
 *   手動返金。Stripe 側で発生する返金は attribution 不明時もここに fallback
 *   する) はどちらも部分返金しうるため、累積 **確定済み (status="succeeded")**
 *   額が totalPriceWithTax に到達したかで REFUNDED / PARTIALLY_REFUNDED を
 *   判定する。入口は PAID/PARTIALLY_REFUNDED のみ
 * - AUTO_*(自動返金全般: on-cancel / capacity-race / amount-mismatch) は
 *   呼び出し元が必ず単発で残額全額を請求するため、常に単発全額返金として扱う。
 *   入口となる paymentStatus は UNPAID/PENDING/PAID/PARTIALLY_REFUNDED の
 *   いずれもあり得るため、「まだ REFUNDED になっていない」ことのみを
 *   WHERE 条件にし、無条件で REFUNDED に確定する
 *
 * 累積額の集計は status="succeeded" の行のみに限定する (pending/requires_action
 * な別の進行中 refund を含めない)。`resolveRefundAmount` 側の「請求可能残額」計算
 * (`REFUND_AGGREGATE_EXCLUDED_STATUSES` = failed/canceled のみ除外) とは目的が
 * 異なり、そちらは二重返金防止のため未確定額も予約済み残高として含める必要が
 * ある一方、ここでの目的は「実際に完了した金額」なので未確定額を含めると、
 * 他の進行中 refund が後で failed になった場合に取り戻せない REFUNDED 誤確定を
 * 招く。
 *
 * ## soft-delete された予約への確定 (Codex review, PR #1669)
 *
 * settlement 確定前に予約が soft-delete される (`deleteReservationCommand` は
 * paymentStatus を問わず削除できるため、PAID のまま delete され得る) と、
 * entity 側 updateMany は `deletedAt: null` 述語で claim できない。この場合でも
 * Refund.status の claim 自体は既に成功済み (Stripe 側で返金は実際に完了) のため、
 * reservation の paymentStatus 反映は諦めつつ、完了 AuditLog・返金完了メールは
 * 必ず出す (`sendReservationRefundEmail` は「更新」「キャンセル」と独立した
 * 重要取引通知として非 gate で常時送信する契約、Cluster H #8)。AuditLog の
 * `newValue.paymentStatus` は entity が実際に到達した場合のみ記録し、
 * 到達していない (soft-delete 等) 場合は返金額のみを記録する。
 *
 * @returns true = 今回このコマンドが claim に成功した (email 送信・AuditLog 記録は
 *          常に実行される。reservation 側の paymentStatus 反映自体は soft-delete
 *          等で行われないこともある)。false = 既に確定済み (webhook 重複配送・
 *          re-try) で idempotent に no-op、または対象予約が消失済み。
 */
export async function finalizeSettledReservationRefund(
  reservationId: string,
  stripeRefundId: string,
  thisRefundAmount: number,
  refundedByType: string,
): Promise<boolean> {
  const claimResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(tx, "reservation", reservationId);

    const claimedCount = await claimRefundSettlement(tx, stripeRefundId);
    if (claimedCount === 0) {
      return null;
    }

    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { totalPriceWithTax: true },
    });
    if (!reservation || reservation.totalPriceWithTax === null) {
      return null;
    }

    const aggregate = await tx.refund.aggregate({
      where: { reservationId, status: "succeeded" },
      _sum: { amount: true },
    });
    const cumulativeSettled = aggregate._sum.amount ?? 0;

    const isAutomatedFullRefund =
      AUTOMATED_FULL_REFUND_TYPES.includes(refundedByType);
    const willBeFullyRefunded = isAutomatedFullRefund
      ? true
      : cumulativeSettled >= reservation.totalPriceWithTax;

    const targetPaymentStatus = willBeFullyRefunded
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;

    const updated = await tx.reservation.updateMany({
      where: isAutomatedFullRefund
        ? {
            id: reservationId,
            deletedAt: null,
            paymentStatus: { not: PaymentStatus.REFUNDED },
          }
        : {
            id: reservationId,
            deletedAt: null,
            paymentStatus: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
            },
          },
      data: { paymentStatus: targetPaymentStatus },
    });

    let entityUpdated = updated.count > 0;
    if (!entityUpdated) {
      // Refund.status の claim (この関数の権威あるゲート) が成功していても、
      // entity 側 updateMany が 0 件になる理由は2通りある: (a) 既に他経路で
      // target 状態に到達済み (idempotent、無害)、(b) settlement 確定前に
      // 予約が soft-delete される等で entity が到達不能状態になった。
      // 現在値を読み直し、(a) なら entityUpdated=true 相当として扱い実態と
      // 一致させる。(b) を含むそれ以外は entityUpdated=false のまま次へ進む
      // (Codex review, PR #1667: soft-delete でも claim 自体は既に成功済みの
      // ため、reservation 側の反映可否と無関係に返金確定の事実は保存・通知する
      // 必要がある — Cluster H #8 の「返金は独立した重要取引通知、非gateで
      // 常時送信」契約に反しないよう、ここで早期 return して通知ごと握り潰さない、
      // PR #1669 の Codex 追加指摘)。
      const current = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { paymentStatus: true, deletedAt: true },
      });
      entityUpdated =
        current !== null &&
        current.deletedAt === null &&
        current.paymentStatus === targetPaymentStatus;
    }

    return { willBeFullyRefunded, cumulativeSettled, entityUpdated };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  if (claimResult === null) {
    return false;
  }
  const { willBeFullyRefunded, cumulativeSettled, entityUpdated } = claimResult;

  // newValue の paymentStatus は entity が実際に target に到達した場合のみ記録する
  // (soft-delete 等で到達していないのに偽って記録しない、Codex review PR #1667)。
  // ただし返金自体 (Refund.status="succeeded") は claim 済みで確定した事実のため、
  // AuditLog 自体・返金完了メールは entityUpdated に関わらず必ず出す
  // (Codex review, PR #1669: reservation 側の反映可否と、Stripe が実際に返金した
  // という事実の通知は独立)。
  await createAuditLogRecord({
    action: AuditAction.UPDATE,
    resource: "reservation",
    resourceId: reservationId,
    newValue: entityUpdated
      ? {
          paymentStatus: willBeFullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
          refundedAmount: cumulativeSettled,
        }
      : { refundedAmount: cumulativeSettled },
    metadata: {
      operation: "finalizeSettledReservationRefund",
      stripeRefundId,
      refundAmount: thisRefundAmount,
      cumulativeAmount: cumulativeSettled,
      entityUpdated,
    },
  });

  const emailData = await fetchReservationEmailData(reservationId);
  if (emailData) {
    await sendReservationRefundEmail({
      reservationId: emailData.reservationId,
      customerEmail: emailData.customerEmail,
      customerName: emailData.customerName,
      spaceName: emailData.spaceName,
      startTime: emailData.startTime,
      endTime: emailData.endTime,
      refundAmount: thisRefundAmount,
      cumulativeRefundAmount: cumulativeSettled,
      originalTotal: emailData.totalPriceWithTax ?? emailData.totalPrice ?? 0,
      isFullyRefunded: willBeFullyRefunded,
      refundId: stripeRefundId,
      ...(emailData.userId != null ? { userId: emailData.userId } : {}),
    });
  }

  return true;
}
