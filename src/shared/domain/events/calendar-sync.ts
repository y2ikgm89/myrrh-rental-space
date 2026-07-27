import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants/urls";
import { formatEventVenue } from "@/shared/domain/events/venue";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { EventSyncData } from "@/shared/lib/calendar-sync/types";

/** delete 失敗時の retry 振り分け用 prefix（reservation 側と同値） */
export const GCAL_DELETE_FAILED_PREFIX = "gcal_delete_failed:";

export async function getEventImportSyncToken(): Promise<string | null> {
  const settings = await prisma.settingsGoogleCalendar.findFirstOrThrow({
    where: { id: "singleton" },
    select: { eventImportSyncToken: true },
  });

  return settings.eventImportSyncToken;
}

export async function saveEventImportSyncToken(
  syncToken: string,
): Promise<void> {
  await prisma.settingsGoogleCalendar.update({
    where: { id: "singleton" },
    data: { eventImportSyncToken: syncToken },
  });
}

export async function clearEventImportSyncToken(): Promise<void> {
  await prisma.settingsGoogleCalendar.update({
    where: { id: "singleton" },
    data: { eventImportSyncToken: null },
  });
}

export type EventSyncContext = EventSyncData & {
  googleCalendarEventId: string | null;
};

export async function saveEventGoogleCalendarEventId(params: {
  slotId: string;
  googleCalendarEventId: string;
}): Promise<void> {
  await prisma.eventTimeSlot.update({
    where: { id: params.slotId },
    data: { googleCalendarEventId: params.googleCalendarEventId },
  });
}

export async function clearEventGoogleCalendarEventId(params: {
  googleCalendarEventId: string;
}): Promise<void> {
  await prisma.eventTimeSlot.updateMany({
    where: { googleCalendarEventId: params.googleCalendarEventId },
    data: { googleCalendarEventId: null },
  });
}

/**
 * GCal API 応答で発行された Meet URL を Event.meetingUrl に書き戻す。
 *
 * **first-write-wins semantics (Codex PR #1149 P1 fix)**: TIMED_ENTRY イベントは
 * スロット単位で GCal event が作成され、各スロットが独立した Meet URL を返す。
 * Event.meetingUrl は単一 field のため、単純 update すると最後に完了した非同期同期の
 * URL で上書きされ、他スロット登録者のメール/mypage/ICS で誤 URL が表示される。
 * `updateMany` + `meetingUrl: null` の WHERE で既存 URL が未設定のときのみ書き込む。
 *
 * TIMED_ENTRY + GOOGLE_MEET の禁止は `assertOnlineScheduleCompatibility` で create/update
 * 双方に validation を敷いているが、既存データや過去の migration 経路への防衛として
 * 本 helper 側でも first-write-wins を保証する（多重防御）。
 */
export async function writeBackMeetingUrl(params: {
  eventId: string;
  meetingUrl: string;
}): Promise<void> {
  await prisma.event.updateMany({
    where: { id: params.eventId, meetingUrl: null },
    data: { meetingUrl: params.meetingUrl },
  });
}

export async function markEventCalendarSyncError(params: {
  eventId: string;
  error: string;
}): Promise<void> {
  // GCAL-AUDIT-04: `Event.calendarSyncError` (additive migration) に永続化する。
  // 旧実装は logError のみで DB に残らず、admin dashboard に可視化されず
  // `/api/cron/calendar-sync-retry` の retry pool にも載らなかった。
  await prisma.event.updateMany({
    where: { id: params.eventId, deletedAt: null },
    data: { calendarSyncError: params.error },
  });

  logError(new Error(params.error), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "eventCalendarSync", eventId: params.eventId },
  });
}

/**
 * イベントの Google Calendar 同期エラーを解消する（全 slot が正常同期できた場合）。
 * `/api/cron/calendar-sync-retry` の retry 完了後に呼ぶ。
 */
export async function markEventCalendarSyncSuccess(
  eventId: string,
): Promise<void> {
  await prisma.event.updateMany({
    where: { id: eventId, deletedAt: null },
    data: { calendarSyncError: null },
  });
}

/**
 * `calendarSyncError` が残っている Event の id 一覧を返す
 * (`/api/cron/calendar-sync-retry` の event 側 retry pool)。
 */
export async function getFailedCalendarSyncEventIds(
  limit: number = 50,
): Promise<string[]> {
  const rows = await prisma.event.findMany({
    where: { deletedAt: null, calendarSyncError: { not: null } },
    select: { id: true },
    take: limit,
  });
  return rows.map((r) => r.id);
}

export async function getEventCalendarSyncError(
  eventId: string,
): Promise<string | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { calendarSyncError: true },
  });
  return event?.calendarSyncError ?? null;
}

/**
 * イベント → GCal outbound sync 対象のスロットを取得する。
 *
 * GCAL-OUTBOUND-08 (DRAFT event outbound policy): `status: PUBLISHED` を
 * where 句に含める clean-break 変更。DRAFT のイベントは共有カレンダーに
 * 一切同期しない（下書き段階のタイトル・日時が誤って公開カレンダーを汚染する
 * のを防ぐ）。この関数は `syncEventOutbound` (create/duplicate/update/publish
 * 共通の outbound エントリポイント) と `retryFailedEventCalendarSyncs`
 * (cron retry) の両方から呼ばれる唯一の SSoT のため、ここで gate すれば
 * 両経路とも自動的に DRAFT を除外する。
 *
 * PUBLISHED → DRAFT の遷移は `EVENT_STATUS_TRANSITIONS` 上そもそも許可されて
 * いない（PUBLISHED は CANCELLED / ARCHIVED にしか遷移できない）ため、
 * 「一度同期された PUBLISHED イベントが DRAFT に戻って sync 対象から漏れる」
 * ケースは発生しない。CANCELLED / ARCHIVED への遷移時の GCal 削除は
 * `deleteEventOutbound` (cancelEvent / archiveEvent / deleteEvent) が
 * status に関わらず既存 slot の `googleCalendarEventId` を直接読んで処理する
 * ため、本 gate の影響を受けない。
 */
export async function getEventSlotsForCalendarSync(
  eventId: string,
): Promise<EventSyncContext[]> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null, status: EventStatus.PUBLISHED },
    select: {
      id: true,
      title: true,
      slug: true,
      descriptionPlainText: true,
      addressDetail: true,
      format: true,
      meetingUrl: true,
      meetingProvider: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      slots: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          googleCalendarEventId: true,
        },
        orderBy: { startAt: "asc" as const },
      },
    },
  });

  if (!event) return [];

  const location = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });
  const publicUrl = `${getAppUrl()}/events/${event.slug}`;

  return event.slots.map((slot) => ({
    eventId: event.id,
    slotId: slot.id,
    title: event.title,
    descriptionPlainText: event.descriptionPlainText,
    startTime: slot.startAt,
    endTime: slot.endAt,
    location,
    publicUrl,
    googleCalendarEventId: slot.googleCalendarEventId,
    meetingProvider: event.meetingProvider,
  }));
}

/** cancel / delete / unpublish 前に GCal 削除対象 ID を一括取得する */
export async function getGoogleCalendarEventIdsByEventIds(
  eventIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (eventIds.length === 0) return new Map();

  const slots = await prisma.eventTimeSlot.findMany({
    where: {
      eventId: { in: [...eventIds] },
      googleCalendarEventId: { not: null },
      event: { deletedAt: null },
    },
    select: { eventId: true, googleCalendarEventId: true },
  });

  const map = new Map<string, string[]>();
  for (const slot of slots) {
    if (slot.googleCalendarEventId === null) continue;
    const existing = map.get(slot.eventId) ?? [];
    existing.push(slot.googleCalendarEventId);
    map.set(slot.eventId, existing);
  }
  return map;
}

/** delete retry 用: PUBLISHED 以外のイベントも slot GCal ID を返す */
export async function getEventGoogleCalendarEventIdsForDelete(
  eventId: string,
): Promise<string[]> {
  const slots = await prisma.eventTimeSlot.findMany({
    where: {
      eventId,
      googleCalendarEventId: { not: null },
      event: { deletedAt: null },
    },
    select: { googleCalendarEventId: true },
  });

  return slots.flatMap((slot) =>
    slot.googleCalendarEventId !== null ? [slot.googleCalendarEventId] : [],
  );
}
