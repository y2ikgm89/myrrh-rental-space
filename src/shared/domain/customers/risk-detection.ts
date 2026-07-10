import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus, RegistrationStatus } from "@generated/prisma/enums";
import {
  RISK_FLAG_REASON,
  type RiskFlagReason,
} from "@/shared/lib/validations/enums/helpers";

export type { RiskFlagReason };
export { RISK_FLAG_REASON };

const RAPID_BOOKING_WINDOW_MS = 24 * 60 * 60 * 1000;
const RAPID_BOOKING_THRESHOLD = 3;
const CANCELLATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANCELLATION_THRESHOLD = 3;
const NO_SHOW_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const NO_SHOW_THRESHOLD = 2;

export type DetectedRiskyCustomer = {
  readonly customerId: string;
  readonly reasons: readonly RiskFlagReason[];
};

/**
 * 不審な予約パターンを検知する(週次cronから呼ばれる)。
 *
 * 3パターンを個別に集計し、customerId単位でマージする:
 * - rapid_booking: 直近24時間で同一顧客が3件以上の予約/イベント申込を作成
 * - frequent_cancellation: 直近30日でキャンセル3回以上
 * - repeated_no_show: 直近90日でNO_SHOW2回以上(空間予約のみ。
 *   RegistrationStatusにNO_SHOW相当が存在しないためイベント申込には適用できない)
 *
 * ゲストのイベント申込(customerId: null)は検知対象外(Customer行を持たないため)。
 * NO_SHOWの発生日時を追跡する専用フィールドが無いため updatedAt を代替指標に使う
 * (NO_SHOWは終端ステータスでその後の更新が発生しにくいため実用上は十分だが、
 * 他の更新と偶発的に競合する可能性は残る、という既知の限界)。
 *
 * 自動でBLACKLIST化・予約拒否はしない。検知結果は `applyRiskFlagsCommand` で
 * Customer.flaggedForReviewAt/flagReasons に記録するのみで、最終判断は常に管理者。
 */
export async function detectSuspiciousCustomers(
  now: Date = new Date(),
): Promise<DetectedRiskyCustomer[]> {
  const rapidBookingSince = new Date(now.getTime() - RAPID_BOOKING_WINDOW_MS);
  const cancellationSince = new Date(now.getTime() - CANCELLATION_WINDOW_MS);
  const noShowSince = new Date(now.getTime() - NO_SHOW_WINDOW_MS);

  const [
    rapidReservations,
    rapidRegistrations,
    frequentReservationCancellations,
    frequentRegistrationCancellations,
    repeatedNoShows,
  ] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: rapidBookingSince }, deletedAt: null },
      _count: { _all: true },
      having: { customerId: { _count: { gte: RAPID_BOOKING_THRESHOLD } } },
    }),
    prisma.eventRegistration.groupBy({
      by: ["customerId"],
      where: {
        createdAt: { gte: rapidBookingSince },
        customerId: { not: null },
      },
      _count: { _all: true },
      having: { customerId: { _count: { gte: RAPID_BOOKING_THRESHOLD } } },
    }),
    prisma.reservation.groupBy({
      by: ["customerId"],
      where: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: { gte: cancellationSince },
        deletedAt: null,
      },
      _count: { _all: true },
      having: { customerId: { _count: { gte: CANCELLATION_THRESHOLD } } },
    }),
    prisma.eventRegistration.groupBy({
      by: ["customerId"],
      where: {
        status: RegistrationStatus.CANCELLED,
        cancelledAt: { gte: cancellationSince },
        customerId: { not: null },
      },
      _count: { _all: true },
      having: { customerId: { _count: { gte: CANCELLATION_THRESHOLD } } },
    }),
    prisma.reservation.groupBy({
      by: ["customerId"],
      where: {
        status: ReservationStatus.NO_SHOW,
        updatedAt: { gte: noShowSince },
        deletedAt: null,
      },
      _count: { _all: true },
      having: { customerId: { _count: { gte: NO_SHOW_THRESHOLD } } },
    }),
  ]);

  const reasonsByCustomer = new Map<string, Set<RiskFlagReason>>();

  const addReason = (
    customerId: string | null,
    reason: RiskFlagReason,
  ): void => {
    if (!customerId) return;
    const existing =
      reasonsByCustomer.get(customerId) ?? new Set<RiskFlagReason>();
    existing.add(reason);
    reasonsByCustomer.set(customerId, existing);
  };

  for (const row of rapidReservations) {
    addReason(row.customerId, RISK_FLAG_REASON.RAPID_BOOKING);
  }
  for (const row of rapidRegistrations) {
    addReason(row.customerId, RISK_FLAG_REASON.RAPID_BOOKING);
  }
  for (const row of frequentReservationCancellations) {
    addReason(row.customerId, RISK_FLAG_REASON.FREQUENT_CANCELLATION);
  }
  for (const row of frequentRegistrationCancellations) {
    addReason(row.customerId, RISK_FLAG_REASON.FREQUENT_CANCELLATION);
  }
  for (const row of repeatedNoShows) {
    addReason(row.customerId, RISK_FLAG_REASON.REPEATED_NO_SHOW);
  }

  return Array.from(reasonsByCustomer.entries()).map(
    ([customerId, reasons]) => ({
      customerId,
      reasons: Array.from(reasons),
    }),
  );
}

/**
 * 検知結果をCustomerレコードに反映する。既存のflagReasonsは上書きする
 * (常に「直近の検知結果」を表す設計。前回検知時の理由が今回の条件から
 * 外れていれば自然に消える)。
 */
export async function applyRiskFlagsCommand(
  detected: readonly DetectedRiskyCustomer[],
): Promise<number> {
  const now = new Date();
  let updated = 0;
  for (const { customerId, reasons } of detected) {
    const result = await prisma.customer.updateMany({
      where: { id: customerId },
      data: { flaggedForReviewAt: now, flagReasons: [...reasons] },
    });
    updated += result.count;
  }
  return updated;
}

/** 管理者による手動クリア(誤検知時に使う)。 */
export async function clearRiskFlagCommand(customerId: string): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: { flaggedForReviewAt: null, flagReasons: [] },
  });
}
