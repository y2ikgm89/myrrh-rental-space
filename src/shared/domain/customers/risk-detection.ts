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
const RAPID_BOOKING_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
// クエリ取得範囲はLOOKBACKにさらにWINDOW分(24時間)を加える。LOOKBACK境界の
// 直前で始まったバースト(例: 前回スキャンの4時間前に2件、今回スキャンの
// 2時間前に3件目)は、LOOKBACK境界だけで切ると前回・今回のどちらのスキャンでも
// 完全な形で見えない(前回は3件目が未来でまだ存在せず、今回は最初の2件が
// LOOKBACK境界の外に出てしまう)。1window分手前まで遡って取得することで、
// 境界をまたぐバーストも1回のスキャンで捉えられるようにする。
const RAPID_BOOKING_QUERY_LOOKBACK_MS =
  RAPID_BOOKING_LOOKBACK_MS + RAPID_BOOKING_WINDOW_MS;
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
 *
 * クエリ取得範囲は `RAPID_BOOKING_QUERY_LOOKBACK_MS`(スキャン対象期間+1window分)
 * だが、報告対象はスキャン対象期間(`reportCutoffMs` 以降)で完結したバーストに
 * 限定する。`windowEnd`(バースト最後のタイムスタンプ)が `reportCutoffMs` より
 * 前のバーストは、前回のスキャン時点で既に全件揃っていたはずなので今回は
 * 報告しない(でなければ同じバーストを複数回のスキャンで報告し続けてしまう、
 * かつクエリ範囲を広げた分だけ古いバーストまで拾ってしまう)。
 */
function hasReportableBurstWithinWindow(
  timestampsMs: readonly number[],
  windowMs: number,
  threshold: number,
  reportCutoffMs: number,
): boolean {
  if (timestampsMs.length < threshold) return false;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  for (let i = 0; i + threshold - 1 < sorted.length; i++) {
    const windowStart = sorted[i];
    const windowEnd = sorted[i + threshold - 1];
    if (windowStart === undefined || windowEnd === undefined) continue;
    if (windowEnd - windowStart <= windowMs && windowEnd >= reportCutoffMs) {
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
 *   24時間以内に3件以上収まる区間がある。クエリ取得範囲は直近7日+24時間分
 *   （`RAPID_BOOKING_QUERY_LOOKBACK_MS`）に広げ、報告対象はバースト終了時刻が
 *   直近7日以内（`rapidBookingReportCutoffMs`）のものに限定する。7日境界を
 *   固定境界にすると、境界の直前に始まったバーストが前回・今回どちらの
 *   スキャンでも完全な形で見えず検知漏れになるため（cutoffだけ動かす方式）
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
  const rapidBookingQueryLookbackSince = new Date(
    now.getTime() - RAPID_BOOKING_QUERY_LOOKBACK_MS,
  );
  const rapidBookingReportCutoffMs = now.getTime() - RAPID_BOOKING_LOOKBACK_MS;
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
      where: {
        createdAt: { gte: rapidBookingQueryLookbackSince },
        deletedAt: null,
      },
      select: { customerId: true, createdAt: true },
    }),
    prisma.eventRegistration.findMany({
      where: {
        createdAt: { gte: rapidBookingQueryLookbackSince },
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
      hasReportableBurstWithinWindow(
        timestamps,
        RAPID_BOOKING_WINDOW_MS,
        RAPID_BOOKING_THRESHOLD,
        rapidBookingReportCutoffMs,
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
