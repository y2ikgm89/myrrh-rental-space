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
// cron実行間隔(週次)をカバーするスキャン対象期間。rapid_bookingは「直近24時間の
// バースト」を検知したいが、cronは週1回しか走らないため、直近24時間だけを見ると
// 週の早い時点(例: 実行が月曜9時なら火曜〜日曜)のバーストを永久に見逃す。
// 直近7日分を取得し、その中の任意の24時間ウィンドウでバーストが無いかを
// スライディングウィンドウで判定する。
const RAPID_BOOKING_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CANCELLATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANCELLATION_THRESHOLD = 3;
const NO_SHOW_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const NO_SHOW_THRESHOLD = 2;

export type DetectedRiskyCustomer = {
  readonly customerId: string;
  readonly reasons: readonly RiskFlagReason[];
};

/**
 * ソート不問のタイムスタンプ配列に対し、`windowMs` 以内に `threshold` 件以上が
 * 収まる区間が存在するかを判定する(スライディングウィンドウ)。
 * 予約作成 + イベント申込作成のタイムスタンプを合算した配列を渡すことで、
 * 「予約2件+申込1件で合計3件」のような混在バーストも検知できる。
 */
function hasBurstWithinWindow(
  timestampsMs: readonly number[],
  windowMs: number,
  threshold: number,
): boolean {
  if (timestampsMs.length < threshold) return false;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  for (let i = 0; i + threshold - 1 < sorted.length; i++) {
    const windowStart = sorted[i];
    const windowEnd = sorted[i + threshold - 1];
    if (windowStart === undefined || windowEnd === undefined) continue;
    if (windowEnd - windowStart <= windowMs) {
      return true;
    }
  }
  return false;
}

function groupTimestampsByCustomer(
  rows: readonly { customerId: string | null; createdAt: Date }[],
): Map<string, number[]> {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const arr = grouped.get(row.customerId) ?? [];
    arr.push(row.createdAt.getTime());
    grouped.set(row.customerId, arr);
  }
  return grouped;
}

/**
 * 不審な予約パターンを検知する(週次cronから呼ばれる)。
 *
 * 3パターンを個別に集計し、customerId単位でマージする:
 * - rapid_booking: 予約+イベント申込を合算した作成タイムスタンプの中に、
 *   24時間以内に3件以上収まる区間がある(直近7日分をスキャンし、cronの実行間隔を
 *   跨いでもバーストを見逃さない。日付境界固定ではなくスライディングウィンドウ)
 * - frequent_cancellation: 予約+イベント申込のキャンセルを合算して直近30日で3回以上
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
  const rapidBookingLookbackSince = new Date(
    now.getTime() - RAPID_BOOKING_LOOKBACK_MS,
  );
  const cancellationSince = new Date(now.getTime() - CANCELLATION_WINDOW_MS);
  const noShowSince = new Date(now.getTime() - NO_SHOW_WINDOW_MS);

  const [
    reservationCreations,
    registrationCreations,
    reservationCancellations,
    registrationCancellations,
    repeatedNoShows,
  ] = await Promise.all([
    prisma.reservation.findMany({
      where: { createdAt: { gte: rapidBookingLookbackSince }, deletedAt: null },
      select: { customerId: true, createdAt: true },
    }),
    prisma.eventRegistration.findMany({
      where: {
        createdAt: { gte: rapidBookingLookbackSince },
        customerId: { not: null },
      },
      select: { customerId: true, createdAt: true },
    }),
    prisma.reservation.groupBy({
      by: ["customerId"],
      where: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: { gte: cancellationSince },
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.eventRegistration.groupBy({
      by: ["customerId"],
      where: {
        status: RegistrationStatus.CANCELLED,
        cancelledAt: { gte: cancellationSince },
        customerId: { not: null },
      },
      _count: { _all: true },
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

  // rapid_booking: 予約+申込のタイムスタンプを顧客単位で合算し、スライディング
  // ウィンドウで24時間以内3件以上のバーストが無いかを判定する。
  const timestampsByCustomer = groupTimestampsByCustomer([
    ...reservationCreations,
    ...registrationCreations,
  ]);
  for (const [customerId, timestamps] of timestampsByCustomer) {
    if (
      hasBurstWithinWindow(
        timestamps,
        RAPID_BOOKING_WINDOW_MS,
        RAPID_BOOKING_THRESHOLD,
      )
    ) {
      addReason(customerId, RISK_FLAG_REASON.RAPID_BOOKING);
    }
  }

  // frequent_cancellation: 予約キャンセル数 + 申込キャンセル数を顧客単位で合算
  // してから閾値判定する(個別テーブルでは閾値未満でも合計で超える場合がある)。
  const cancellationCountByCustomer = new Map<string, number>();
  for (const row of [
    ...reservationCancellations,
    ...registrationCancellations,
  ]) {
    if (!row.customerId) continue;
    cancellationCountByCustomer.set(
      row.customerId,
      (cancellationCountByCustomer.get(row.customerId) ?? 0) + row._count._all,
    );
  }
  for (const [customerId, count] of cancellationCountByCustomer) {
    if (count >= CANCELLATION_THRESHOLD) {
      addReason(customerId, RISK_FLAG_REASON.FREQUENT_CANCELLATION);
    }
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
