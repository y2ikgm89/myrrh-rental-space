import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

/**
 * series の master GCal event に対する RRULE UNTIL 打ち切り
 * (`patchGcalMasterUntil`、`this-and-following` scope) が失敗したときの
 * `calendarSyncError` prefix (GCAL-OUTBOUND-07)。
 *
 * `${PREFIX}${untilIso}|${message}` の形式でエンコードする。`untilIso` は
 * 再試行時に `patchGcalMasterUntil` へそのまま渡す UNTIL 値 (ISO 8601)。
 * この prefix を持つ series instance は `retryFailedSeriesMasterOperations`
 * が拾って再試行する。
 */
export const GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX =
  "gcal_series_master_patch_failed:";

/**
 * series の master GCal event 削除 (`deleteGcalMaster`、`series-all` scope) が
 * 失敗したときの `calendarSyncError` prefix (GCAL-OUTBOUND-07)。
 * `${PREFIX}${message}` の形式。
 */
export const GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX =
  "gcal_series_master_delete_failed:";

/**
 * GCAL-RETRY-04: standalone retry pool から除外した series-child のうち
 * `calendarSyncError` が残る series の一意な seriesId 一覧を返す。
 *
 * `retryFailedSeriesCalendarSyncs` が per-series に `fetchEventInstances` →
 * `writeBackInstanceGoogleCalendarEventIds` を再試行する対象を絞る用途。
 * Prisma に `distinct` findMany を使う (groupBy より index 相性が良い)。
 */
export async function getFailedCalendarSyncSeriesIds(
  limit: number = 50,
): Promise<string[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      googleCalendarEventId: null,
      calendarSyncError: { not: null },
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      deletedAt: null,
      seriesId: { not: null },
    },
    select: { seriesId: true },
    distinct: ["seriesId"],
    // **公平な順序を与える（監査 A-34）。** `take` だけで `orderBy` が無いと、
    // どの行が選ばれるかは実行計画と物理順まかせになる。恒久失敗する行が上限を
    // 埋める限り、新しく失敗した行は一度も再試行されないまま滋留する。
    // `markReservationCalendarSyncError` が失敗のたび `updatedAt` を更新するので、
    // 昇順＝「最後に触ってから一番長い行」から回す。waitlist / receipt-backfill と同型。
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  return rows.map((r) => r.seriesId).filter((id): id is string => id !== null);
}

/**
 * series master レベルの GCal 操作 (`patchGcalMasterUntil` / `deleteGcalMaster`)
 * が失敗し、typed prefix (`GCAL_SERIES_MASTER_*_FAILED_PREFIX`) 付きの
 * `calendarSyncError` を持つ instance が存在する series の一意な seriesId
 * 一覧を返す (GCAL-OUTBOUND-07)。
 *
 * `getFailedCalendarSyncSeriesIds` (instance 自身の create/update/write-back 失敗)
 * とは独立した retry pool。series master 操作失敗時、対象 instance は自身の
 * `googleCalendarEventId` (child event) を既に持っているため、
 * `googleCalendarEventId: null` を主条件にする既存クエリでは拾えない。
 */
export async function getSeriesIdsWithMasterOperationFailure(
  limit: number = 50,
): Promise<string[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      seriesId: { not: null },
      deletedAt: null,
      OR: [
        {
          calendarSyncError: {
            startsWith: GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX,
          },
        },
        {
          calendarSyncError: {
            startsWith: GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX,
          },
        },
      ],
    },
    select: { seriesId: true },
    distinct: ["seriesId"],
    // **公平な順序を与える（監査 A-34）。** `take` だけで `orderBy` が無いと、
    // どの行が選ばれるかは実行計画と物理順まかせになる。恒久失敗する行が上限を
    // 埋める限り、新しく失敗した行は一度も再試行されないまま滋留する。
    // `markReservationCalendarSyncError` が失敗のたび `updatedAt` を更新するので、
    // 昇順＝「最後に触ってから一番長い行」から回す。waitlist / receipt-backfill と同型。
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  return rows.map((r) => r.seriesId).filter((id): id is string => id !== null);
}

/**
 * 指定 series のうち、series master 操作失敗の typed prefix を持つ
 * instance (id + calendarSyncError) を返す (GCAL-OUTBOUND-07)。
 *
 * 呼出側 (`retryFailedSeriesMasterOperations`) はこの一覧から代表 1 件の
 * `calendarSyncError` を復号して再試行内容 (patch の UNTIL 値 / delete) を
 * 判定し、成功後は全件の `calendarSyncError` をクリアする。
 */
export async function getSeriesMasterOperationFailureInstances(
  seriesId: string,
): Promise<{ id: string; calendarSyncError: string }[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      seriesId,
      deletedAt: null,
      OR: [
        {
          calendarSyncError: {
            startsWith: GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX,
          },
        },
        {
          calendarSyncError: {
            startsWith: GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX,
          },
        },
      ],
    },
    select: { id: true, calendarSyncError: true },
  });
  return rows.flatMap((r) =>
    r.calendarSyncError !== null
      ? [{ id: r.id, calendarSyncError: r.calendarSyncError }]
      : [],
  );
}

// =============================================================================
// ReservationSeries → GCal 同期 (Phase B.2 task 16)
// =============================================================================

/**
 * Series → GCal 同期に必要な最小データを取得する。placement gate で
 * shared/lib からの prisma 直呼を避けるため domain 側に配置。
 */
export type ReservationSeriesCalendarSyncData = {
  id: string;
  rrule: string;
  dtstart: Date;
  duration: number;
  spaceName: string;
  spaceAddressDetail: string | null;
  locationAddress: string;
  customerLastName: string;
  customerFirstName: string;
  customerEmail: string;
};

export async function getSeriesForCalendarSync(
  seriesId: string,
): Promise<ReservationSeriesCalendarSyncData | null> {
  const series = await prisma.reservationSeries.findUnique({
    where: { id: seriesId, deletedAt: null },
    select: {
      id: true,
      rrule: true,
      dtstart: true,
      duration: true,
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: {
        select: { lastName: true, firstName: true, email: true },
      },
    },
  });
  if (!series) return null;
  return {
    id: series.id,
    rrule: series.rrule,
    dtstart: series.dtstart,
    duration: series.duration,
    spaceName: series.space.name,
    spaceAddressDetail: series.space.addressDetail,
    locationAddress: series.space.location.address,
    customerLastName: series.customer.lastName,
    customerFirstName: series.customer.firstName,
    customerEmail: series.customer.email,
  };
}

/**
 * Series の未削除 instance の `Reservation.startTime` を読み取り、呼出側
 * (reservation-calendar-outbound.ts) が GCal child ID との突合を行う際の入力にする。
 */
export async function getSeriesInstanceStartTimes(
  seriesId: string,
): Promise<{ id: string; startTime: Date }[]> {
  return prisma.reservation.findMany({
    where: { seriesId, deletedAt: null },
    select: { id: true, startTime: true },
  });
}

/**
 * GCal child ID を各 Reservation.googleCalendarEventId に write-back する。
 * reservation-calendar-outbound.ts から呼ばれる placement gate 対応の domain helper。
 */
export async function markSeriesInstanceCalendarSyncSuccess(input: {
  reservationId: string;
  googleCalendarEventId: string;
}): Promise<void> {
  await prisma.reservation.update({
    where: { id: input.reservationId, deletedAt: null },
    data: {
      googleCalendarEventId: input.googleCalendarEventId,
      calendarSyncedAt: new Date(),
      calendarSyncError: null,
    },
  });
}

/**
 * ReservationSeries に紐づく Google Calendar master event ID を取得する
 * (Phase B.2.1 Task 5)。
 *
 * bulk cancel 経路 (`applyBulkCancellationSideEffects`) が master event に対する
 * scope 別操作 (`this-and-following` → UNTIL 更新、`series-all` → 削除) を
 * 発火するかどうかの gate として使う。null なら master GCal 操作は no-op。
 *
 * 呼出は `shared/domain/reservations/series-calendar-outbound.ts` 経由 (placement gate)。
 */
export async function getSeriesGcalMasterEventId(
  seriesId: string,
): Promise<string | null> {
  const series = await prisma.reservationSeries.findUnique({
    where: { id: seriesId },
    select: { googleCalendarMasterEventId: true },
  });
  return series?.googleCalendarMasterEventId ?? null;
}

/**
 * ReservationSeries に Google Calendar master event ID を永続化する
 * (Phase B.2.1 Task 5)。
 *
 * `syncReservationSeriesToCalendar` が master event 作成に成功した直後に呼び出し、
 * 以降の bulk cancel 経路が master event を操作できるようにする。
 * soft-deleted (`deletedAt IS NOT NULL`) の series は対象外 (where 句 gate)。
 */
export async function markSeriesMasterEventCreated(input: {
  seriesId: string;
  masterEventId: string;
}): Promise<void> {
  await prisma.reservationSeries.update({
    where: { id: input.seriesId, deletedAt: null },
    data: { googleCalendarMasterEventId: input.masterEventId },
  });
}
