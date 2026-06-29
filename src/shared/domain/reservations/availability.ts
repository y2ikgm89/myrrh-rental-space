import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  formatJstDateOnly,
  formatJstDateString,
  parseJstDateOnly,
} from "@/shared/lib/date-format";
import {
  ACTIVE_RESERVATION_STATUSES,
  BLOCKED_DATE_SCOPE,
} from "@/shared/lib/validations/enums/helpers";
import {
  parseBusinessHours,
  type BusinessHours,
} from "@/shared/lib/json-validators";
import type {
  OverlapCheckParams,
  OverlapCheckResult,
  PrismaTransactionClient,
} from "@/shared/lib/reservation/types";

export type DateBlockedResult =
  { blocked: true; reason: string | null } | { blocked: false };

/**
 * 指定日が臨時休業 / 急な休み（BlockedDate）かを 3 階層 cascade で判定する。
 *
 * GLOBAL / LOCATION（locationId 一致）/ SPACE（spaceId 一致）のいずれかが
 * 該当すれば blocked（additive、override なし）。`date` は JST カレンダー日付
 * （"YYYY-MM-DD"）で、`@db.Date`（UTC 深夜保持）と `parseJstDateOnly` で整合する。
 * reason は GLOBAL → LOCATION → SPACE の優先度で返す。
 */
export async function isDateBlocked(
  spaceId: string,
  locationId: string,
  date: string,
  tx?: PrismaTransactionClient,
): Promise<DateBlockedResult> {
  const client = tx ?? prisma;
  const target = parseJstDateOnly(date);

  const blocked = await client.blockedDate.findFirst({
    where: {
      startDate: { lte: target },
      endDate: { gte: target },
      OR: [
        { scope: BLOCKED_DATE_SCOPE.GLOBAL },
        { scope: BLOCKED_DATE_SCOPE.LOCATION, locationId },
        { scope: BLOCKED_DATE_SCOPE.SPACE, spaceId },
      ],
    },
    orderBy: { scope: "asc" }, // GLOBAL → LOCATION → SPACE の優先度で reason を採用
    select: { reason: true },
  });

  return blocked
    ? { blocked: true, reason: blocked.reason }
    : { blocked: false };
}

/**
 * blocked date への予約を物理的に防止する。blocked なら DomainError(CONFLICT)。
 * 公開予約作成フローで `ensureNoOverlap` と並べて呼ぶ（管理画面は override 許容のため対象外）。
 */
export async function ensureDateNotBlocked(
  spaceId: string,
  locationId: string,
  date: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const result = await isDateBlocked(spaceId, locationId, date, tx);
  if (result.blocked) {
    throw new DomainError(
      result.reason
        ? `選択された日付は休業日です（${result.reason}）。別の日付をお選びください。`
        : "選択された日付は休業日です。別の日付をお選びください。",
      "CONFLICT",
    );
  }
}

/** スペースの所属拠点 ID を取得（blocked date cascade 判定用、PK lookup） */
export async function getSpaceLocationIdQuery(
  spaceId: string,
): Promise<string | null> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { locationId: true },
  });
  return space?.locationId ?? null;
}

export type BlockedDateRange = {
  readonly startDate: string;
  readonly endDate: string;
  readonly reason: string | null;
};

/**
 * 公開カレンダー grey-out 用に、スペースに適用される blocked date 範囲を
 * 3 階層 cascade（GLOBAL + 所属 LOCATION + SPACE）でまとめて取得する。
 * 終了日が今日（JST）以降の範囲のみ返す（過去の休業は表示不要）。
 */
export async function getBlockedDateRangesForSpace(
  spaceId: string,
): Promise<BlockedDateRange[]> {
  const locationId = await getSpaceLocationIdQuery(spaceId);

  const todayJst = formatJstDateString(new Date());
  const todayUtcMidnight = parseJstDateOnly(todayJst);

  const rows = await prisma.blockedDate.findMany({
    where: {
      endDate: { gte: todayUtcMidnight },
      OR: [
        { scope: BLOCKED_DATE_SCOPE.GLOBAL },
        ...(locationId !== null
          ? [{ scope: BLOCKED_DATE_SCOPE.LOCATION, locationId }]
          : []),
        { scope: BLOCKED_DATE_SCOPE.SPACE, spaceId },
      ],
    },
    orderBy: { startDate: "asc" },
    select: { startDate: true, endDate: true, reason: true },
  });

  return rows.map((row) => ({
    startDate: formatJstDateOnly(row.startDate),
    endDate: formatJstDateOnly(row.endDate),
    reason: row.reason,
  }));
}

export async function getBusinessHoursSettingsQuery(): Promise<BusinessHours | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { businessHours: true },
  });

  if (!settings?.businessHours) {
    return null;
  }

  return parseBusinessHours(settings.businessHours);
}

/**
 * 予約ルール設定（予約枠の刻み・最小/最大予約時間）を取得する。
 * 列は NOT NULL ＋ DB default のため通常は値が入るが、行欠損時は schema 既定にフォールバック。
 */
export async function getReservationRuleSettings(): Promise<{
  defaultTimeSlot: number;
  minReservationDuration: number;
  maxReservationDuration: number;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      defaultTimeSlot: true,
      minReservationDuration: true,
      maxReservationDuration: true,
    },
  });

  return {
    defaultTimeSlot: settings?.defaultTimeSlot ?? 60,
    minReservationDuration: settings?.minReservationDuration ?? 60,
    maxReservationDuration: settings?.maxReservationDuration ?? 480,
  };
}

export async function checkReservationOverlapQuery(
  params: OverlapCheckParams,
  tx?: PrismaTransactionClient,
): Promise<OverlapCheckResult> {
  const { spaceId, startTime, endTime, excludeReservationId } = params;
  const client = tx ?? prisma;

  const overlappingReservation = await client.reservation.findFirst({
    where: {
      spaceId,
      deletedAt: null,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      ...(excludeReservationId && { id: { not: excludeReservationId } }),
      AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  if (!overlappingReservation) {
    return { hasOverlap: false };
  }

  return {
    hasOverlap: true,
    conflictingReservation: overlappingReservation,
  };
}

export async function getReservationsForDateQuery(
  spaceId: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<Array<{ startTime: Date; endTime: Date }>> {
  return prisma.reservation.findMany({
    where: {
      spaceId,
      deletedAt: null,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      startTime: { gte: dateStart, lte: dateEnd },
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });
}
