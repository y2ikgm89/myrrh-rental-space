import "server-only";

import { PaymentStatus, ReservationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { MS_PER_MINUTE } from "@/shared/lib/date-format";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import { getStripeClient } from "@/shared/lib/stripe";

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
 * - クーポン usageCount の戻し
 * - Stripe Checkout Session の expire（open な session からの後追い課金を防ぐ）
 * - GCal / メール / 通知 / SmartLock / 集約 AuditLog
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
      paymentInitiatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      customerId: true,
      spaceId: true,
      paymentInitiatedAt: true,
      couponId: true,
      stripeCheckoutSessionId: true,
    },
  });

  if (candidates.length === 0) {
    return { expired: [], total: 0 };
  }

  const candidateIds = candidates.map((r) => r.id);
  const candidateById = new Map(candidates.map((r) => [r.id, r]));

  // 2) atomic claim: WHERE で全条件を再 assert し、race で条件を外れたものは自動除外
  const claimed = await prisma.reservation.updateMany({
    where: {
      id: { in: candidateIds },
      deletedAt: null,
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
      paymentStatus: PaymentStatus.PENDING,
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

  const settled = await prisma.reservation.findMany({
    where: {
      id: { in: candidateIds },
      status: ReservationStatus.CANCELLED,
      cancelledByType: CANCELLED_BY.SYSTEM,
      cancelledAt: now,
    },
    select: { id: true, customerId: true, spaceId: true },
  });

  const expiredLogs: ExpiredReservationLog[] = settled.map((row) => {
    const candidate = candidateById.get(row.id);
    const initiatedAt = candidate?.paymentInitiatedAt;
    const ageMinutes = initiatedAt
      ? Math.floor((now.getTime() - initiatedAt.getTime()) / MS_PER_MINUTE)
      : PENDING_RESERVATION_EXPIRY_MINUTES;
    return {
      id: row.id,
      customerId: row.customerId,
      spaceId: row.spaceId,
      ageMinutes,
    };
  });

  // 3) claim 成功分の副作用。クーポン戻しは applyCancellation と同型で先に行い、
  //    Stripe session expire + cancellation side effects を予約単位で発火する。
  //    AuditLog は side effects 側の集約レコードが SSoT（旧: 本関数内の単純 UPDATE 監査）。
  for (const log of expiredLogs) {
    const candidate = candidateById.get(log.id);
    if (!candidate) continue;

    if (candidate.couponId) {
      try {
        await prisma.coupon.updateMany({
          where: { id: candidate.couponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "pendingExpiryCouponDecrement",
            reservationId: log.id,
            couponId: candidate.couponId,
          },
        });
      }
    }

    if (candidate.stripeCheckoutSessionId) {
      await expireCheckoutSessionBestEffort({
        reservationId: log.id,
        sessionId: candidate.stripeCheckoutSessionId,
      });
    }

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

  return { expired: expiredLogs, total: claimed.count };
}

async function expireCheckoutSessionBestEffort(input: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  try {
    const stripeSettings = await assertStripeCredentialsConfigured();
    const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
    if (!client) return;
    await client.checkout.sessions.expire(input.sessionId);
  } catch (error) {
    // 既に expired / completed の session は Stripe が reject する。
    // cron の CANCELLED claim は既に成功しているため、expire 失敗は観測のみ。
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "pendingExpiryExpireCheckoutSession",
        reservationId: input.reservationId,
        sessionId: input.sessionId,
      },
    });
  }
}
