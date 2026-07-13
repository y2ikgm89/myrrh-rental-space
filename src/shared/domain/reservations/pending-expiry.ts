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
 * 冪等・at-least-once 安全:
 * - `updateMany` の WHERE で status / paymentStatus / paymentInitiatedAt / deletedAt を
 *   全て assert し、race で他経路（顧客の checkout / webhook / 管理者操作）が状態を進めて
 *   いた予約は自動的に対象外になる
 * - claim 対象を先に select してから updateMany の WHERE で id in [...] で
 *   claim する 2 段構え。監査ログ用のメタ情報 (spaceId / customerId / 年齢) を
 *   claim 後にも安定して取れる
 *
 * 判定軸 (Codex P1 対応):
 * - `paymentStatus: PENDING`: PAID/REFUNDED は自動除外され、terminal な決済状態を
 *   巻き戻さない
 * - `status: PENDING | CONFIRMED`: 公開経路の予約は `status = CONFIRMED` + `paymentStatus = PENDING`
 *   で作成される (`createPublicReservationCommand`)。admin 経路の PENDING も救う
 * - `paymentInitiatedAt: { lt: cutoff }`: checkout 開始時刻を cutoff の基準とする。予約作成
 *   から時間をおいて checkout を開始したケース (createdAt < cutoff でも checkout はまだ生きている)
 *   の誤爆を防ぐ
 *
 * cron から呼ぶ想定 (`/api/cron/pending-reservation-expire`)。他経路からは呼ばない。
 */
export async function expireStalePendingReservationsCommand(): Promise<ExpirePendingReservationsResult> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - PENDING_RESERVATION_EXPIRY_MINUTES * MS_PER_MINUTE,
  );

  // 1) 対象候補を select（監査ログ用の spaceId / customerId / paymentInitiatedAt を確保）
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
