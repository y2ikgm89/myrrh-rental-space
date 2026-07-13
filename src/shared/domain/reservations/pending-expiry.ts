import "server-only";

import { AuditAction } from "@generated/prisma/enums";
import { PaymentStatus, ReservationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { MS_PER_MINUTE } from "@/shared/lib/date-format";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";

/**
 * PENDING 予約の fail-safe 有効期限（分）。この分数を超えて残った PENDING は
 * cron が自動 CANCELLED 遷移させる。
 *
 * Stripe Checkout Session の既定 expiration (24h) より短く、実運用の
 * 「決済に迷って離脱」パターンを吸収する余地を持たせて 60 分を採用。
 * `createCheckoutSessionCommand` の UNPAID→PENDING claim (payment-commands.ts)
 * と、`checkout.session.expired` webhook (`claimReservationAsFailed`) の
 * どちらも届かないケース (webhook 未設定、ネットワーク断、Stripe 側障害) に
 * 対する最終セーフティネット。
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
 * PENDING 状態のまま `PENDING_RESERVATION_EXPIRY_MINUTES` を超えた予約を CANCELLED に
 * 遷移させて空き枠（DB EXCLUDE 制約）を解放する。
 *
 * 冪等・at-least-once 安全:
 * - `updateMany` の WHERE で status/paymentStatus/createdAt/deletedAt を全て assert し、
 *   race で他経路（顧客の checkout / webhook / 管理者操作）が状態を進めていた予約は
 *   自動的に対象外になる
 * - `paymentStatus` は PAID/REFUNDED を除外（万一の PAID/PENDING mismatch や、
 *   webhook 遅延で PAID になった予約を巻き戻さない）
 * - claim 対象を先に select してから updateMany の WHERE で id in [...] で
 *   claim する 2 段構え。監査ログ用のメタ情報 (spaceId / customerId / 年齢) を
 *   claim 後にも安定して取れる
 *
 * cron から呼ぶ想定 (`/api/cron/pending-reservation-expire`)。他経路からは呼ばない。
 */
export async function expireStalePendingReservationsCommand(): Promise<ExpirePendingReservationsResult> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - PENDING_RESERVATION_EXPIRY_MINUTES * MS_PER_MINUTE,
  );

  // 1) 対象候補を select（監査ログ用の spaceId / customerId / createdAt を確保）
  const candidates = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      status: ReservationStatus.PENDING,
      createdAt: { lt: cutoff },
      paymentStatus: {
        notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
      },
    },
    select: {
      id: true,
      customerId: true,
      spaceId: true,
      createdAt: true,
    },
  });

  if (candidates.length === 0) {
    return { expired: [], total: 0 };
  }

  const candidateIds = candidates.map((r) => r.id);

  // 2) atomic claim: WHERE で全条件を再 assert し、race で条件を外れたものは自動除外
  const claimed = await prisma.reservation.updateMany({
    where: {
      id: { in: candidateIds },
      deletedAt: null,
      status: ReservationStatus.PENDING,
      createdAt: { lt: cutoff },
      paymentStatus: {
        notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
      },
    },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: now,
      cancelledByType: CANCELLED_BY.SYSTEM,
      cancellationReason: `PENDING が ${PENDING_RESERVATION_EXPIRY_MINUTES} 分を経過したため自動キャンセル`,
      icsSequence: { increment: 1 },
    },
  });

  // claim 数が候補数より少なくても race による自然な減少で異常ではない
  // (webhook が同時刻に PAID / FAILED / CANCELLED を確定させた等)。
  // 監査ログには「claim 成功した」ものだけを載せる — updateMany は行を返さないので
  // 「候補として発見し、かつ claim 対象条件を満たすと直後に再確認できた」ものだけを
  // ログ対象とし、race 敗北した予約は含めない (別経路のログに任せる)。
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
    const candidate = candidates.find((c) => c.id === row.id);
    const ageMinutes = candidate
      ? Math.floor(
          (now.getTime() - candidate.createdAt.getTime()) / MS_PER_MINUTE,
        )
      : PENDING_RESERVATION_EXPIRY_MINUTES;
    return {
      id: row.id,
      customerId: row.customerId,
      spaceId: row.spaceId,
      ageMinutes,
    };
  });

  // 3) 監査ログ (`AuditLog` chain) を予約単位で書き込む。cron の userId は null。
  //    hash chain の直列化契約に従い await で逐次記録する (並行書込禁止)。
  for (const log of expiredLogs) {
    try {
      await createAuditLogRecord({
        action: AuditAction.UPDATE,
        resource: "reservation",
        resourceId: log.id,
        newValue: {
          status: "CANCELLED" satisfies ReservationStatus,
          cancelledByType: CANCELLED_BY.SYSTEM,
          cancellationReason: `PENDING expired after ${PENDING_RESERVATION_EXPIRY_MINUTES} minutes`,
        },
        metadata: {
          channel: "cron:pending-reservation-expire",
          expiryMinutes: PENDING_RESERVATION_EXPIRY_MINUTES,
          ageMinutes: log.ageMinutes,
        },
      });
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "auditLogPendingExpiry",
          reservationId: log.id,
        },
      });
    }
  }

  return { expired: expiredLogs, total: claimed.count };
}
