import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  CalendarSyncMethod,
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  ACTIVE_RESERVATION_STATUSES,
  CANCELLED_BY,
} from "@/shared/lib/validations/enums/helpers";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { getSpaceRatePlans } from "@/shared/domain/spaces/rate-plan-queries";
import { checkSpaceOverlap } from "@/shared/domain/spaces/overlap";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";
import { formatDateTimeFull, formatTimeShort } from "@/shared/lib/date-format";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { buildPricingSettings, getReservationSettings } from "./payloads";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
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
  /** GCAL-AUDIT-11: 決済確定/保留/返金済/失敗は時間変更を拒否する判定に使う。 */
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

export async function getCalendarSyncRuntimeState(): Promise<{
  twoWaySyncEnabled: boolean;
  syncToken: string | null;
  lastSyncedAt: Date | null;
  syncMethod: CalendarSyncMethod;
  webhookChannelId: string | null;
  webhookExpiration: Date | null;
}> {
  const settings = await prisma.settingsGoogleCalendar.findUnique({
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
  await prisma.settingsGoogleCalendar.update({
    where: { id: "singleton" },
    data: { googleCalendarLastSyncedAt: new Date() },
  });
}

export async function saveCalendarSyncToken(syncToken: string): Promise<void> {
  await prisma.settingsGoogleCalendar.update({
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
  await prisma.settingsGoogleCalendar.update({
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
  const preClaim = await prisma.reservation.findFirst({
    where: { id: input.reservationId, deletedAt: null },
    select: {
      paymentStatus: true,
      stripeCheckoutSessionId: true,
    },
  });

  const syncNote = `[Google Calendarで削除] ${formatDateTimeFull(new Date())}`;
  const newNotes = input.existingNotes
    ? `${input.existingNotes}\n${syncNote}`
    : syncNote;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
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

  if (
    result.cancelled &&
    preClaim?.paymentStatus === PaymentStatus.PENDING &&
    preClaim.stripeCheckoutSessionId
  ) {
    await expireOpenCheckoutSessionBestEffort({
      sessionId: preClaim.stripeCheckoutSessionId,
      context: { reservationId: input.reservationId },
    });
  }

  return result;
}

export type ApplyCalendarTimeChangeResult =
  | { success: true }
  | {
      success: false;
      reason: "overlap";
      conflictingReservation: {
        id: string;
        startTime: Date;
        endTime: Date;
      };
    }
  | { success: false; reason: "payment_race" }
  | { success: false; reason: "pricing_unavailable" };

export async function applyCalendarTimeChange(input: {
  reservationId: string;
  spaceId: string;
  existingNotes: string | null;
  startTime: Date;
  endTime: Date;
}): Promise<ApplyCalendarTimeChangeResult> {
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    return { success: false, reason: "pricing_unavailable" };
  }

  const ratePlans = await getSpaceRatePlans(input.spaceId);
  const reservationSettings = buildPricingSettings(
    await getReservationSettings(),
  );

  return prisma.$transaction(async (tx) => {
    await lockSpaceForTransaction(tx, input.spaceId);

    const reservation = await tx.reservation.findFirst({
      where: {
        id: input.reservationId,
        deletedAt: null,
        paymentStatus: PaymentStatus.UNPAID,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      select: {
        id: true,
        taxRate: true,
        coupon: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            discountValue: true,
            maxDiscountAmount: true,
            canCombineWithDurationDiscount: true,
            validFrom: true,
            validUntil: true,
          },
        },
      },
    });

    if (!reservation) {
      return { success: false as const, reason: "payment_race" as const };
    }

    const space = await tx.space.findUnique({
      where: { id: input.spaceId },
      select: {
        hourlyPrice: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
        taxRateType: true,
      },
    });

    if (!space) {
      return {
        success: false as const,
        reason: "pricing_unavailable" as const,
      };
    }

    const overlap = await checkSpaceOverlap(
      {
        spaceId: input.spaceId,
        startTime: input.startTime,
        endTime: input.endTime,
        excludeReservationId: input.reservationId,
      },
      tx,
    );

    if (overlap.hasOverlap) {
      const conflictLabel =
        overlap.type === "event" ? "重複イベント枠ID" : "重複予約ID";
      const rejectionNote =
        `[カレンダー同期エラー] ${formatDateTimeFull(new Date())}\n` +
        `時間変更が重複のため拒否されました。\n` +
        `試行時間: ${formatDateTimeFull(input.startTime)} - ${formatTimeShort(input.endTime)}\n` +
        `${conflictLabel}: ${overlap.conflictId.slice(0, 8).toUpperCase()}`;

      const newNotes = input.existingNotes
        ? `${input.existingNotes}\n\n${rejectionNote}`
        : rejectionNote;

      await tx.reservation.update({
        where: { id: input.reservationId },
        data: {
          notes: newNotes,
          calendarSyncError: `Time change rejected: overlapping ${overlap.type}`,
        },
      });

      return {
        success: false as const,
        reason: "overlap" as const,
        conflictingReservation: {
          id: overlap.conflictId,
          startTime: overlap.startTime,
          endTime: overlap.endTime,
        },
      };
    }

    const coupon = reservation.coupon;
    const couponForCalc =
      coupon &&
      new Date(coupon.validFrom) <= input.startTime &&
      (!coupon.validUntil || new Date(coupon.validUntil) >= input.endTime)
        ? {
            id: coupon.id,
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            discountValue: coupon.discountValue,
            maxDiscountAmount: coupon.maxDiscountAmount,
            canCombineWithDurationDiscount:
              coupon.canCombineWithDurationDiscount,
          }
        : null;

    const pricing = calculateReservationPricing({
      startDateTime: input.startTime,
      endDateTime: input.endTime,
      space: {
        hourlyPrice: space.hourlyPrice,
        discountType: space.discountType,
        discountValue: space.discountValue,
        durationDiscountOverride: space.durationDiscountOverride,
        taxRateType: space.taxRateType,
      },
      ratePlans,
      reservationSettings,
      coupon: couponForCalc,
      holidayJudge: isJapaneseHoliday,
    });

    const taxRate = reservation.taxRate ? Number(reservation.taxRate) : 0;
    const taxAmount = Math.round((pricing.totalPrice * taxRate) / 100);

    const updated = await tx.reservation.updateMany({
      where: {
        id: input.reservationId,
        deletedAt: null,
        paymentStatus: PaymentStatus.UNPAID,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      data: {
        startTime: input.startTime,
        endTime: input.endTime,
        basePrice: pricing.basePrice,
        totalPrice: pricing.totalPrice,
        rateBreakdownJson: asPrismaInputJsonValue(
          pricing.rateBreakdown,
          "料金内訳の生成に失敗しました",
        ),
        spaceDiscountAmount: pricing.spaceDiscountAmount,
        durationDiscountAmount: pricing.durationDiscountAmount,
        couponDiscountAmount: pricing.couponDiscountAmount,
        taxAmount,
        totalPriceWithTax: pricing.totalPrice + taxAmount,
        priceOverriddenBy: null,
        couponId: pricing.appliedCoupon?.id ?? null,
        calendarSyncedAt: new Date(),
        calendarSyncError: null,
        icsSequence: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return { success: false as const, reason: "payment_race" as const };
    }

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
