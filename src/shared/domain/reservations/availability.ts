import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { ACTIVE_EVENT_STATUSES } from "@/shared/domain/spaces/overlap";
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

/**
 * 複数スペースの blocked date（GLOBAL/LOCATION/SPACE 3 階層 cascade）を
 * 1 クエリでまとめて判定する（`isDateBlocked` の N+1 回避版）。
 * `/spaces` 一覧の空き時間帯検索のように、ページ内の複数スペースを
 * まとめて判定したい read 専用ユースケース向け。書込経路の
 * `ensureDateNotBlocked` はスペース単体判定のままでよい（変更しない）。
 */
export async function getBlockedSpaceIdsForDate(
  date: string,
  spaces: readonly { spaceId: string; locationId: string }[],
): Promise<ReadonlySet<string>> {
  if (spaces.length === 0) return new Set();
  const target = parseJstDateOnly(date);
  const locationIds = Array.from(new Set(spaces.map((s) => s.locationId)));
  const spaceIds = spaces.map((s) => s.spaceId);

  // SPACE scope は spaceId で絞らず全件取得し、下の loop で `spaces` との交差を
  // アプリ側で取る。`spaceId: { in: spaceIds } }` にすると spaceIds の長さが
  // 呼び出し元の候補件数（/spaces の facet 該当件数）に比例して IN 句が肥大化する。
  // SPACE scope の BlockedDate 行自体は運用上まれ（個別スペースの臨時休業）なので、
  // 全件取得の方が呼び出し元の規模に依存せず軽い。
  const rows = await prisma.blockedDate.findMany({
    where: {
      startDate: { lte: target },
      endDate: { gte: target },
      OR: [
        { scope: BLOCKED_DATE_SCOPE.GLOBAL },
        { scope: BLOCKED_DATE_SCOPE.LOCATION, locationId: { in: locationIds } },
        { scope: BLOCKED_DATE_SCOPE.SPACE },
      ],
    },
    select: { scope: true, locationId: true, spaceId: true },
  });

  if (rows.some((r) => r.scope === BLOCKED_DATE_SCOPE.GLOBAL)) {
    return new Set(spaceIds);
  }

  const blockedLocationIds = new Set(
    rows
      .filter((r) => r.scope === BLOCKED_DATE_SCOPE.LOCATION)
      .map((r) => r.locationId),
  );
  const blockedSpaceIdsDirect = new Set(
    rows
      .filter((r) => r.scope === BLOCKED_DATE_SCOPE.SPACE)
      .map((r) => r.spaceId),
  );

  const result = new Set<string>();
  for (const s of spaces) {
    if (
      blockedSpaceIdsDirect.has(s.spaceId) ||
      blockedLocationIds.has(s.locationId)
    ) {
      result.add(s.spaceId);
    }
  }
  return result;
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
  const settings = await prisma.settingsOrganization.findUnique({
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
  const settings = await prisma.settingsReservation.findUnique({
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

/**
 * 公開空き枠表示用: 指定日に Space を占有する EventTimeSlot を返す。
 * `checkSpaceOverlap` / DB CONSTRAINT TRIGGER と同じ ACTIVE_EVENT_STATUSES 契約。
 */
export async function getEventSlotsForDateQuery(
  spaceId: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<Array<{ startTime: Date; endTime: Date }>> {
  const slots = await prisma.eventTimeSlot.findMany({
    where: {
      event: {
        spaceId,
        deletedAt: null,
        status: { in: [...ACTIVE_EVENT_STATUSES] },
      },
      AND: [{ startAt: { lt: dateEnd } }, { endAt: { gt: dateStart } }],
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });
  return slots.map((slot) => ({
    startTime: slot.startAt,
    endTime: slot.endAt,
  }));
}
