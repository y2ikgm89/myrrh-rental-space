import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  CalendarSyncMethod,
  PaymentStatus,
  ReservationStatus,
} from "@generated/prisma/enums";
import {
  ACTIVE_RESERVATION_STATUSES,
  CANCELLED_BY,
} from "@/shared/lib/validations/enums/helpers";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { formatDateTimeFull, formatTimeShort } from "@/shared/lib/date-format";
import { lockSpaceForTransaction } from "./space-locks";

/**
 * `deleteCalendarSync` が GCal イベント削除に失敗したときの `calendarSyncError` prefix。
 *
 * `googleCalendarEventId` を保持したまま（イベントは GCal 上にまだ存在するため）
 * エラーを記録する。retry 経路 (`retryFailedSyncs`) はこの prefix の有無で
 * 「削除を再試行すべきか」「作成/更新を再試行すべきか」を判定する (SSoT)。
 */
export const GCAL_DELETE_FAILED_PREFIX = "gcal_delete_failed:";

/**
 * GCal 上でイベントが削除されたことを検知した際の自動キャンセル理由（SSoT）。
 * `cancelReservationFromCalendar` の DB claim と、呼出側 (`inbound.ts`) が
 * `applyCancellationSideEffects` に渡す `cancellationReason` を一致させる。
 */
export const GCAL_DELETE_CANCELLATION_REASON =
  "Google Calendar 上でイベントが削除されたため自動キャンセル";

export type FailedCalendarSyncReservation = {
  id: string;
  status: ReservationStatus;
  startTime: Date;
  endTime: Date;
  notes: string | null;
  totalPrice: number | null;
  guestEmail: string | null;
  googleCalendarEventId: string | null;
  calendarSyncError: string | null;
  space: {
    name: string;
    lineAddress: string;
  };
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type CalendarSyncReservationRecord = {
  id: string;
  status: ReservationStatus;
  startTime: Date;
  endTime: Date;
  calendarSyncedAt: Date | null;
  spaceId: string;
  notes: string | null;
  guestEmail: string | null;
  /** GCAL-AUDIT-11: PAID/PARTIALLY_REFUNDED/PENDING は時間変更を拒否する判定に使う。 */
  paymentStatus: PaymentStatus;
  space: {
    name: string;
  };
  customer: {
    lastName: string;
    firstName: string;
    email: string;
  };
};

export async function markReservationCalendarSyncSuccess(input: {
  reservationId: string;
  eventId: string;
}): Promise<void> {
  await prisma.reservation.update({
    where: { id: input.reservationId, deletedAt: null },
    data: {
      googleCalendarEventId: input.eventId,
      calendarSyncedAt: new Date(),
      calendarSyncError: null,
    },
  });
}

export async function markReservationCalendarSyncUpdated(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: {
      calendarSyncedAt: new Date(),
      calendarSyncError: null,
    },
  });
}

export async function markReservationCalendarSyncError(input: {
  reservationId: string;
  error: string;
}): Promise<void> {
  await prisma.reservation.update({
    where: { id: input.reservationId, deletedAt: null },
    data: {
      calendarSyncError: input.error,
    },
  });
}

export async function clearReservationCalendarEvent(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId, deletedAt: null },
    data: {
      googleCalendarEventId: null,
      calendarSyncError: null,
    },
  });
}

export async function getFailedCalendarSyncReservations(
  limit: number = 50,
): Promise<FailedCalendarSyncReservation[]> {
  // GCAL-RETRY-04: seriesId != null の instance は standalone retry pool から除外する。
  // 単発の syncReservationToCalendar (RRULE 無し createCalendarEvent) を series-child に
  // 適用すると master 側の RRULE 展開と時刻二重の GCal 招待になり、series-all bulk cancel
  // で master 削除しても孤児化する。series 側は retryFailedSeriesCalendarSyncs 経由で
  // fetchEventInstances + write-back のみを再試行する。
  //
  // GCAL-RETRY-05: `googleCalendarEventId: null` 固定だった旧 where 句は create 失敗
  // (eventId 未発行) しか拾えず、update / delete 失敗 (eventId は既存のまま) を
  // retry pool から取りこぼしていた。`calendarSyncError IS NOT NULL` を主条件にし、
  // create 対象 (ACTIVE かつ eventId 無し) と delete 対象 (CANCELLED かつ
  // `GCAL_DELETE_FAILED_PREFIX` エラー、eventId 有り) の両方を拾う。update 失敗は
  // ACTIVE かつ eventId 有りの行として同じ主条件に自然に含まれる。
  // 呼出側 (`retryFailedStandaloneCalendarSyncs`) が `googleCalendarEventId` の有無と
  // エラー prefix で create / update / delete を分岐する。
  const rows = await prisma.reservation.findMany({
    where: {
      calendarSyncError: { not: null },
      deletedAt: null,
      seriesId: null,
      OR: [
        { status: { in: [...ACTIVE_RESERVATION_STATUSES] } },
        {
          status: ReservationStatus.CANCELLED,
          calendarSyncError: { startsWith: GCAL_DELETE_FAILED_PREFIX },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      notes: true,
      totalPrice: true,
      guestEmail: true,
      googleCalendarEventId: true,
      calendarSyncError: true,
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
        },
      },
    },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    startTime: r.startTime,
    endTime: r.endTime,
    notes: r.notes,
    totalPrice: r.totalPrice,
    guestEmail: r.guestEmail,
    googleCalendarEventId: r.googleCalendarEventId,
    calendarSyncError: r.calendarSyncError,
    space: {
      name: r.space.name,
      lineAddress: formatSpaceLineAddress(
        r.space.location.address,
        r.space.addressDetail,
      ),
    },
    customer: r.customer,
  }));
}

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
    take: limit,
  });
  return rows.map((r) => r.seriesId).filter((id): id is string => id !== null);
}

export async function getCalendarSyncRuntimeState(): Promise<{
  twoWaySyncEnabled: boolean;
  syncToken: string | null;
  lastSyncedAt: Date | null;
  syncMethod: CalendarSyncMethod;
  webhookChannelId: string | null;
  webhookExpiration: Date | null;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarLastSyncedAt: true,
      googleCalendarSyncToken: true,
      googleCalendarTwoWaySyncEnabled: true,
      googleCalendarSyncMethod: true,
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookExpiration: true,
    },
  });

  return {
    twoWaySyncEnabled: settings?.googleCalendarTwoWaySyncEnabled ?? false,
    syncToken: settings?.googleCalendarSyncToken ?? null,
    lastSyncedAt: settings?.googleCalendarLastSyncedAt ?? null,
    syncMethod:
      settings?.googleCalendarSyncMethod ?? CalendarSyncMethod.polling,
    webhookChannelId: settings?.googleCalendarWebhookChannelId ?? null,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  };
}

/**
 * カレンダー同期の完了時刻を記録する。
 *
 * GCAL-AUDIT-09: 旧実装は同期開始時に呼んでいたため、fetch/処理が失敗しても
 * `lastSyncedAt` が進み、直後の throttle 判定 (`SYNC_MIN_INTERVAL_SECONDS`) が
 * 失敗直後の即時リトライを不当にブロックしていた。呼出側 (`syncFromCalendar`)
 * は全変更処理が成功した (`errors.length === 0`) ときのみ本関数を呼ぶ契約に変更した。
 */
export async function recordCalendarSyncCompleted(): Promise<void> {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: { googleCalendarLastSyncedAt: new Date() },
  });
}

export async function saveCalendarSyncToken(syncToken: string): Promise<void> {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarSyncToken: syncToken,
    },
  });
}

/**
 * syncToken が 410 Gone（`fullSyncRequired`）で期限切れになった際、永続化済み
 * token をクリアする。呼出側 (`fetchCalendarChanges`) がクリア後に `null` token で
 * フルシンクをやり直す。
 */
export async function clearCalendarSyncToken(): Promise<void> {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: { googleCalendarSyncToken: null },
  });
}

export async function getReservationByCalendarEventId(
  eventId: string,
): Promise<CalendarSyncReservationRecord | null> {
  return prisma.reservation.findFirst({
    where: {
      googleCalendarEventId: eventId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      calendarSyncedAt: true,
      spaceId: true,
      notes: true,
      guestEmail: true,
      paymentStatus: true,
      space: { select: { name: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          companyName: true,
          email: true,
        },
      },
    },
  });
}

export type CancelReservationFromCalendarResult = {
  /** true = atomic claim 成功（CONFIRMED/PENDING → CANCELLED）。呼出側はこの後
   * `applyCancellationSideEffects` を呼んで副作用チェーンを発火すること。 */
  cancelled: boolean;
};

/**
 * Google Calendar 上でイベントが削除されたことを検知した際、DB 側の予約を
 * atomic claim で CANCELLED に遷移させる（GCAL-AUDIT-03）。
 *
 * GCal 側の削除が正本（source of truth）であるため、顧客キャンセル期限等の
 * デッドラインチェックは行わない（客がキャンセル不可期間でも GCal 側の削除は
 * 常に反映する）。`ACTIVE_RESERVATION_STATUSES`（PENDING/CONFIRMED）以外は
 * 対象外（既に終端状態）。
 *
 * DB 更新のみを担当し、返金・メール・通知・SmartLock 等の副作用は担当しない
 * （呼出側 `inbound.ts` が claim 成功時に `applyCancellationSideEffects` を呼ぶ、
 * `pending-expiry.ts` と同型の分離）。
 */
export async function cancelReservationFromCalendar(input: {
  reservationId: string;
  existingNotes: string | null;
}): Promise<CancelReservationFromCalendarResult> {
  const syncNote = `[Google Calendarで削除] ${formatDateTimeFull(new Date())}`;
  const newNotes = input.existingNotes
    ? `${input.existingNotes}\n${syncNote}`
    : syncNote;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.reservation.updateMany({
      where: {
        id: input.reservationId,
        deletedAt: null,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: now,
        cancelledByType: CANCELLED_BY.SYSTEM,
        cancellationReason: GCAL_DELETE_CANCELLATION_REASON,
        icsSequence: { increment: 1 },
        googleCalendarEventId: null,
        calendarSyncedAt: now,
        calendarSyncError: null,
        notes: newNotes,
      },
    });

    if (claimed.count === 0) {
      return { cancelled: false };
    }

    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: { couponId: true },
    });

    if (reservation?.couponId) {
      await tx.coupon.updateMany({
        where: { id: reservation.couponId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }

    return { cancelled: true };
  });
}

export async function applyCalendarTimeChange(input: {
  reservationId: string;
  spaceId: string;
  existingNotes: string | null;
  startTime: Date;
  endTime: Date;
}): Promise<
  | { success: true }
  | {
      success: false;
      conflictingReservation: {
        id: string;
        startTime: Date;
        endTime: Date;
      };
    }
> {
  return prisma.$transaction(async (tx) => {
    await lockSpaceForTransaction(tx, input.spaceId);

    const overlappingReservation = await tx.reservation.findFirst({
      where: {
        spaceId: input.spaceId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        id: { not: input.reservationId },
        deletedAt: null,
        AND: [
          { startTime: { lt: input.endTime } },
          { endTime: { gt: input.startTime } },
        ],
      },
      select: { id: true, startTime: true, endTime: true },
    });

    if (overlappingReservation) {
      const rejectionNote =
        `[カレンダー同期エラー] ${formatDateTimeFull(new Date())}\n` +
        `時間変更が重複のため拒否されました。\n` +
        `試行時間: ${formatDateTimeFull(input.startTime)} - ${formatTimeShort(input.endTime)}\n` +
        `重複予約ID: ${overlappingReservation.id.slice(0, 8).toUpperCase()}`;

      const newNotes = input.existingNotes
        ? `${input.existingNotes}\n\n${rejectionNote}`
        : rejectionNote;

      await tx.reservation.update({
        where: { id: input.reservationId },
        data: {
          notes: newNotes,
          calendarSyncError: "Time change rejected: overlapping reservation",
        },
      });

      return {
        success: false as const,
        conflictingReservation: overlappingReservation,
      };
    }

    await tx.reservation.update({
      where: { id: input.reservationId, deletedAt: null },
      data: {
        startTime: input.startTime,
        endTime: input.endTime,
        calendarSyncedAt: new Date(),
        calendarSyncError: null,
      },
    });

    return { success: true as const };
  });
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
 * (calendar-sync/outbound.ts) が GCal child ID との突合を行う際の入力にする。
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
 * calendar-sync/outbound.ts から呼ばれる placement gate 対応の domain helper。
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
 * 呼出は `shared/lib/calendar-sync/series-outbound.ts` 経由 (placement gate)。
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
