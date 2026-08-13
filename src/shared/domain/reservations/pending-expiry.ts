import "server-only";

import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { MS_PER_MINUTE } from "@/shared/lib/date-format";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";

/**
 * PENDING 予約の fail-safe 有効期限（分）。**checkout 開始時刻** (Reservation.paymentInitiatedAt)
 * からこの分数を超えて `paymentStatus = PENDING` のまま残っている予約を cron が自動 CANCELLED
 * 遷移させる。
 *
 * Stripe Checkout Session の既定 expiration (24h) より短く、実運用の
 * 「決済に迷って離脱」パターンを吸収する余地を持たせて 60 分を採用。
 * `createCheckoutSessionCommand` の UNPAID/FAILED → PENDING claim (payment-commands.ts)
 * と、`checkout.session.expired` webhook (`claimReservationAsFailed`) の
 * どちらも届かないケース (webhook 未設定、ネットワーク断、Stripe 側障害) に
 * 対する最終セーフティネット。
 *
 * 予約作成時刻 (createdAt) ではなく checkout 開始時刻で判定するため、予約作成から時間を
 * おいて決済を開始したケース (Codex P1: PR#1042) を誤爆せず、FAILED → PENDING の
 * 再 checkout でも refresh される。
 */
export const PENDING_RESERVATION_EXPIRY_MINUTES = 60;

interface ExpiredReservationLog {
  readonly id: string;
  readonly customerId: string;
  readonly spaceId: string;
  readonly ageMinutes: number;
}

interface ExpirePendingReservationsResult {
  readonly expired: readonly ExpiredReservationLog[];
  readonly total: number;
}

/**
 * `paymentStatus = PENDING` のまま `PENDING_RESERVATION_EXPIRY_MINUTES` を超えた予約を
 * CANCELLED に遷移させて空き枠（DB EXCLUDE 制約）を解放する。
 *
 * claim 成功後の副作用（SSoT = `applyCancellationSideEffects`）:
 * - クーポン usageCount の戻し（tx 内で完了済み）
 * - GCal / メール / 通知 / SmartLock / 集約 AuditLog
 * - Stripe Checkout Session の expire（`applyCancellationSideEffects` 内）
 *
 * `applyCancellation` は PENDING を拒否するため使わない。本 cron が PENDING を
 * CANCELLED に claim した直後に副作用を発火する。
 *
 * cron から呼ぶ想定 (`/api/cron/pending-reservation-expire`)。他経路からは呼ばない。
 */
export async function expireStalePendingReservationsCommand(): Promise<ExpirePendingReservationsResult> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - PENDING_RESERVATION_EXPIRY_MINUTES * MS_PER_MINUTE,
  );
  const cancellationReason = `PENDING が ${PENDING_RESERVATION_EXPIRY_MINUTES} 分を経過したため自動キャンセル`;

  // 1) 対象候補を select（副作用・監査用メタを確保）
  const candidates = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
      paymentStatus: PaymentStatus.PENDING,
      // PENDING で `stripePaymentIntentId` が入っているのは、非同期決済
      // （konbini / customer_balance）の `checkout.session.completed` が
      // `payment_status !== "paid"` で届き、`savePaymentIntentId` が PaymentIntent
      // だけ保存した状態に限られる（カード決済は completed 時点で "paid" なので
      // fulfill 経路に入りここを通らない）。これは「客が払込票を受け取り、これから
      // 支払う」であって放置ではない。ここで CANCELLED にすると、数日後に支払われた
      // 時点で `async_payment_succeeded` が届き、キャンセル済み予約への自動返金が
      // 走る。枠も失われ、入金と返金の履歴だけが残る。
      //
      // 枠が永久に埋まることはない: 払込票が期限切れになると Stripe が
      // `checkout.session.async_payment_failed` を送り `claimReservationAsFailed` が
      // FAILED に落とすので、通常の failed 経路で回収される。
      //
      // `createCheckoutSessionCommand` の再決済 claim は `stripePaymentIntentId` を
      // null に戻す。これがないと、非同期決済が失敗したあとカードで再決済して離脱した
      // 予約に前回の PaymentIntent が残り、この判定が誤って「支払い中」と見なす。
      stripePaymentIntentId: null,
      paymentInitiatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      customerId: true,
      spaceId: true,
      paymentInitiatedAt: true,
      couponId: true,
    },
  });

  if (candidates.length === 0) {
    return { expired: [], total: 0 };
  }

  const expiredLogs: ExpiredReservationLog[] = [];

  // 2) 予約ごとに atomic claim + coupon decrement を同一 tx で実行する。
  //    旧実装は bulk updateMany の後に coupon を別クエリで戻しており、
  //    プロセスクラッシュで usageCount が strand する余地があった。
  for (const candidate of candidates) {
    const initiatedAt = candidate.paymentInitiatedAt;
    const ageMinutes = initiatedAt
      ? Math.floor((now.getTime() - initiatedAt.getTime()) / MS_PER_MINUTE)
      : PENDING_RESERVATION_EXPIRY_MINUTES;

    const claimed = await prisma.$transaction(async (tx) => {
      await lockSpaceForTransaction(tx, candidate.spaceId);

      const updateResult = await tx.reservation.updateMany({
        where: {
          id: candidate.id,
          deletedAt: null,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: PaymentStatus.PENDING,
          // 候補抽出と同じ述語を claim でも再強制する。候補 select から
          // claim までの間に非同期決済の `checkout.session.completed` が届いて
          // PaymentIntent が入った行を、ここで取りこぼさないため。
          stripePaymentIntentId: null,
          paymentInitiatedAt: { lt: cutoff },
        },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: now,
          cancelledByType: CANCELLED_BY.SYSTEM,
          cancellationReason,
          icsSequence: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        return false;
      }

      if (candidate.couponId) {
        await tx.coupon.updateMany({
          where: { id: candidate.couponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }

      return true;
    }, RESERVATION_WRITE_TX_OPTIONS);

    if (claimed) {
      expiredLogs.push({
        id: candidate.id,
        customerId: candidate.customerId,
        spaceId: candidate.spaceId,
        ageMinutes,
      });
    }
  }

  // 3) claim 成功分の副作用。クーポン戻しは上記 tx 内で完了済み。
  for (const log of expiredLogs) {
    try {
      await applyCancellationSideEffects({
        reservationId: log.id,
        cancellationReason,
        channel: "system",
        actorUserId: null,
        request: { ip: null, userAgent: null },
        awaitCompletion: true,
      });
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "pendingExpirySideEffects",
          reservationId: log.id,
        },
      });
    }
  }

  return { expired: expiredLogs, total: expiredLogs.length };
}
