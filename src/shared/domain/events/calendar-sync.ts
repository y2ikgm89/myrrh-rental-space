import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants/urls";
import { formatEventVenue } from "@/shared/domain/events/venue";
import type { EventSyncData } from "@/shared/lib/calendar-sync/types";

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
  // Event モデルには calendarSyncError カラムがないため logError のみで記録
  logError(new Error(params.error), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "eventCalendarSync", eventId: params.eventId },
  });
}

export async function getEventSlotsForCalendarSync(
  eventId: string,
): Promise<EventSyncContext[]> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
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
