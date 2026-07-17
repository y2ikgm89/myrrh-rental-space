/**
 * iCal (.ics) 生成 SSoT（server-only）
 *
 * `ical-generator` v11 ベース。RFC 5545 準拠で UID 安定・SEQUENCE 管理・
 * METHOD:REQUEST/CANCEL をサポートする。日時は UTC (`Z`) で出力し、Cloud Run
 * など server timezone が UTC の環境でも絶対時刻がずれないようにする。
 * `ical-generator` は `node:fs` / `node:path` に依存するため本モジュールは
 * server-only として保護する。
 *
 * Client Component から URL ビルダーのみ使う場合は {@link "./urls"} から
 * サブパス import する（`@/shared/lib/ical/urls`）。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545
 * @module shared/lib/ical
 */

import "server-only";

import ical, {
  ICalCalendarMethod,
  ICalEventBusyStatus,
  ICalEventStatus,
  type ICalCalendar,
} from "ical-generator";
import { formatJstYmd, formatTimeShort } from "@/shared/lib/date-format";
import { formatEventVenueDisplay } from "@/shared/domain/events/venue";
import {
  buildEventRegistrationUid,
  buildReservationSeriesUid,
  buildReservationUid,
} from "./uid";
import type {
  EventCalendarParams,
  ReservationCalendarParams,
  ReservationSeriesCalendarParams,
} from "./types";

const PRODID = "-//Myrrh Rental Space//Reservation System//JP";

// =============================================================================
// Calendar factory
// =============================================================================

function createCalendar(
  method: ICalCalendarMethod,
  name?: string,
): ICalCalendar {
  const cal = ical({
    prodId: PRODID,
    method,
  });
  if (name !== undefined) cal.name(name);
  return cal;
}

// =============================================================================
// Reservation
// =============================================================================

function buildReservationDescription(
  params: ReservationCalendarParams,
): string {
  const formattedDate = formatJstYmd(params.startTime);
  const formattedStart = formatTimeShort(params.startTime);
  const formattedEnd = formatTimeShort(params.endTime);

  const lines = [
    `予約ID: ${params.reservationId.slice(0, 8).toUpperCase()}`,
    `スペース: ${params.spaceName}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
  ];
  if (params.notes !== undefined && params.notes.length > 0) {
    lines.push(`備考: ${params.notes}`);
  }
  return lines.join("\n");
}

export function buildReservationCalendar(
  params: ReservationCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.REQUEST);
  const event = cal.createEvent({
    id: buildReservationUid(params.reservationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: `【予約】${params.spaceName}`,
    description: buildReservationDescription(params),
    status: ICalEventStatus.CONFIRMED,
    busystatus: ICalEventBusyStatus.BUSY,
    sequence: params.sequence,
  });
  if (params.location !== undefined) event.location(params.location);
  if (params.url !== undefined) event.url(params.url);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

export function buildReservationCancelCalendar(
  params: ReservationCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.CANCEL);
  const event = cal.createEvent({
    id: buildReservationUid(params.reservationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: `【キャンセル】${params.spaceName}`,
    description: buildReservationDescription(params),
    status: ICalEventStatus.CANCELLED,
    sequence: params.sequence,
  });
  if (params.location !== undefined) event.location(params.location);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

// =============================================================================
// Reservation series (Phase B.2 task 15)
// =============================================================================

function buildReservationSeriesDescription(
  params: ReservationSeriesCalendarParams,
): string {
  const formattedDate = formatJstYmd(params.dtstart);
  const formattedStart = formatTimeShort(params.dtstart);
  const endDate = new Date(params.dtstart.getTime() + params.duration * 60_000);
  const formattedEnd = formatTimeShort(endDate);

  const lines = [
    `series ID: ${params.seriesId.slice(0, 8).toUpperCase()}`,
    `スペース: ${params.spaceName}`,
    `初回日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
    `繰返し: ${params.rrule}`,
  ];
  if (params.notes !== undefined && params.notes.length > 0) {
    lines.push(`備考: ${params.notes}`);
  }
  return lines.join("\n");
}

/**
 * 定期予約 (ReservationSeries) の RFC 5545 master ICS を生成する。
 *
 * 各 instance を個別 VEVENT で並べず、`event.repeating(rrule)` により RRULE を
 * master VEVENT に貼り付ける。受信側カレンダー (Google Calendar / Apple Calendar
 * / Outlook) が RRULE から occurrence を展開するのが業界標準の recurring event
 * 表現 (spec §5)。UID は series 全体で単一 (`reservation-series-<id>@<host>`)。
 */
export function buildReservationSeriesCalendar(
  params: ReservationSeriesCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.REQUEST);
  const endTime = new Date(params.dtstart.getTime() + params.duration * 60_000);
  const event = cal.createEvent({
    id: buildReservationSeriesUid(params.seriesId, host),
    start: params.dtstart,
    end: endTime,
    summary: `【定期予約】${params.spaceName}`,
    description: buildReservationSeriesDescription(params),
    status: ICalEventStatus.CONFIRMED,
    busystatus: ICalEventBusyStatus.BUSY,
    sequence: params.sequence,
  });
  event.repeating(params.rrule);
  if (params.location !== undefined) event.location(params.location);
  if (params.url !== undefined) event.url(params.url);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

/**
 * 定期予約 (series-all scope) キャンセルの ICS を生成する。
 *
 * METHOD:CANCEL + STATUS:CANCELLED + 同じ master UID + RRULE 保持で、受信側
 * カレンダーが「master + 全 occurrence」を連動削除する (spec §5)。
 * this-and-following scope の場合は master UID を保ったまま RRULE の UNTIL
 * を打ち切りに更新した REQUEST を送るのが本来だが、その経路は `cancellation-side-effects`
 * の scope 判定側で分岐する (本 helper は series-all の master 全削除専用)。
 */
export function buildReservationSeriesCancelCalendar(
  params: ReservationSeriesCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.CANCEL);
  const endTime = new Date(params.dtstart.getTime() + params.duration * 60_000);
  const event = cal.createEvent({
    id: buildReservationSeriesUid(params.seriesId, host),
    start: params.dtstart,
    end: endTime,
    summary: `【定期予約キャンセル】${params.spaceName}`,
    description: buildReservationSeriesDescription(params),
    status: ICalEventStatus.CANCELLED,
    sequence: params.sequence,
  });
  event.repeating(params.rrule);
  if (params.location !== undefined) event.location(params.location);
  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

// =============================================================================
// Event registration
// =============================================================================

function buildEventDescription(params: EventCalendarParams): string {
  const formattedDate = formatJstYmd(params.startTime);
  const formattedStart = formatTimeShort(params.startTime);
  const formattedEnd = formatTimeShort(params.endTime);

  return [
    `申込ID: ${params.registrationId.slice(0, 8).toUpperCase()}`,
    `イベント: ${params.eventTitle}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
    `参加人数: ${params.quantity}名`,
  ].join("\n");
}

export function buildEventCalendar(
  params: EventCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.REQUEST);
  const event = cal.createEvent({
    id: buildEventRegistrationUid(params.registrationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: params.eventTitle,
    description: buildEventDescription(params),
    status: ICalEventStatus.CONFIRMED,
    busystatus: ICalEventBusyStatus.BUSY,
    sequence: params.sequence,
  });

  // LOCATION: use formatEventVenueDisplay to determine primary location
  const venueDisplay = formatEventVenueDisplay({
    format: params.format,
    meetingUrl: params.meetingUrl,
    location: params.location ? { name: params.location } : null,
  });
  if (venueDisplay.primary !== null) {
    event.location(venueDisplay.primary);
  }

  // URL: set if meetingUrl is provided
  if (params.meetingUrl !== null) {
    event.url(params.meetingUrl);
  } else if (params.url !== undefined) {
    event.url(params.url);
  }

  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

export function buildEventCancelCalendar(
  params: EventCalendarParams,
  host: string,
): string {
  const cal = createCalendar(ICalCalendarMethod.CANCEL);
  const event = cal.createEvent({
    id: buildEventRegistrationUid(params.registrationId, host),
    start: params.startTime,
    end: params.endTime,
    summary: `【中止】${params.eventTitle}`,
    description: buildEventDescription(params),
    status: ICalEventStatus.CANCELLED,
    sequence: params.sequence,
  });

  // LOCATION: use formatEventVenueDisplay to determine primary location
  const venueDisplay = formatEventVenueDisplay({
    format: params.format,
    meetingUrl: params.meetingUrl,
    location: params.location ? { name: params.location } : null,
  });
  if (venueDisplay.primary !== null) {
    event.location(venueDisplay.primary);
  }

  // URL: set if meetingUrl is provided
  if (params.meetingUrl !== null) {
    event.url(params.meetingUrl);
  }

  if (
    params.organizerName !== undefined &&
    params.organizerEmail !== undefined
  ) {
    event.organizer({
      name: params.organizerName,
      email: params.organizerEmail,
    });
  }
  return cal.toString();
}

// =============================================================================
// Re-exports
// =============================================================================

// Client-safe URL builders（Server 側も barrel 経由で使いたい場合のため re-export）
export {
  buildAddToCalendarUrls,
  buildGoogleCalendarUrl,
  buildOutlookWebUrl,
  type BuildAddToCalendarUrlsParams,
} from "./urls";

export type {
  AddToCalendarUrls,
  CalendarEventInput,
  EventCalendarParams,
  ReservationCalendarParams,
  ReservationSeriesCalendarParams,
} from "./types";

export {
  buildEventRegistrationUid,
  buildEventUid,
  buildReservationSeriesUid,
  buildReservationUid,
} from "./uid";
