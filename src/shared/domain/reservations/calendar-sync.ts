import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  CalendarSyncMethod,
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

/**
 * `deleteCalendarSync` が GCal イベント削除に失敗したときの `calendarSyncError` prefix。
 *
 * `googleCalendarEventId` を保持したまま（イベントは GCal 上にまだ存在するため）
 * エラーを記録する。retry 経路 (`retryFailedSyncs`) はこの prefix の有無で
 * 「削除を再試行すべきか」「作成/更新を再試行すべきか」を判定する (SSoT)。
 */
export const GCAL_DELETE_FAILED_PREFIX = "gcal_delete_failed:";

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
  /** series-child かどうか。create を回してよいかの判定に使う（GCAL-RETRY-07）。 */
  seriesId: string | null;
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

/*
 * GCAL-WRITEBACK-01: 以下 4 つの write-back は `update` + `deletedAt: null` では
 * なく `updateMany`（deletedAt 述語なし）で書く。
 *
 * これらが書き込むのは**外部システムで既に起きたこと**の記録であって、予約が
 * 生きているかどうかとは無関係。`deletedAt: null` を付けると、soft-delete 済みの
 * 行に対して 0 件マッチ → P2025 になり、**成功した GCal 操作が「失敗」として
 * 記録される**。
 *
 * 実際に主経路で起きていた（監査 F-123）: admin が GCal 同期済み予約を削除すると
 * `deleteReservationCommand` が先に `deletedAt` を commit し、その後の
 * `afterSuccess` で GCal 削除が走る。削除自体は成功するのに直後の
 * `clearReservationCalendarEvent` が P2025 で落ち、catch の
 * `markReservationCalendarSyncError` も同じ述語でまた落ちるので、監査 metadata
 * には「gcal 削除失敗」だけが残る。この監査 metadata は
 * 「完了表示と実挙動の乖離を support 起点で観測する」ために置かれたもの
 * （`cancellation/apply-instance-side-effects.ts` の CRITIC-6）で、主経路で
 * 毎回反転させると信号として死ぬ。
 *
 * 4 つとも同じ形にしてある。到達するのは今のところ 2 つだけだが、片方だけ
 * `update` のまま残すと「こちらが正しい形」に見えて次の人が戻す。
 * `reminder-commands.ts` が同じ罠を `updateMany` で回避済み。
 */

export async function markReservationCalendarSyncSuccess(input: {
  reservationId: string;
  eventId: string;
}): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: input.reservationId },
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
  await prisma.reservation.updateMany({
    where: { id: reservationId },
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
  await prisma.reservation.updateMany({
    where: { id: input.reservationId },
    data: {
      calendarSyncError: input.error,
    },
  });
}

export async function clearReservationCalendarEvent(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: reservationId },
    data: {
      googleCalendarEventId: null,
      calendarSyncError: null,
    },
  });
}

export async function getFailedCalendarSyncReservations(
  limit: number = 50,
): Promise<FailedCalendarSyncReservation[]> {
  // GCAL-RETRY-04: 危険なのは series-child に対する **standalone create** だけ。
  // 単発の syncReservationToCalendar (RRULE 無し createCalendarEvent) を series-child に
  // 適用すると master 側の RRULE 展開と時刻二重の GCal 招待になり、series-all bulk cancel
  // で master 削除しても孤児化する。
  //
  // GCAL-RETRY-07: そのため旧実装は where 句で `seriesId: null` を要求していたが、
  // それは create 以外も一緒に落としていた（監査 F-61）。eventId を持つ series-child は
  // **既存 child event への update / delete** なので master の RRULE 展開とは衝突しない。
  // にもかかわらず 3 pool 全部から漏れていた:
  //
  // - standalone pool: この `seriesId: null` で除外
  // - series pool (`getFailedCalendarSyncSeriesIds`): `googleCalendarEventId: null` を
  //   要求するので、eventId が残っている行は対象外
  // - series master pool: `gcal_series_master_*` prefix しか拾わない
  //
  // 結果、this-only キャンセルの GCal 削除が 503/429 で失敗すると、キャンセル済み
  // 予約の child event が共有カレンダーに恒久的に残り、スタッフはその枠を埋まって
  // いると誤認し続けた。自動復旧は起こらず、`calendarSyncError` を表示する admin
  // 画面も無いので検知経路も無い。
  //
  // create を回さない判定は呼び出し側 (`retryFailedStandaloneCalendarSyncs`) の
  // 1 箇所に置く。where 句と分岐の両方に置くと、どちらが契約なのか読めなくなる。
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
      seriesId: true,
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
    seriesId: r.seriesId,
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
      settings?.googleCalendarSyncMethod ?? CalendarSyncMethod.POLLING,
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
