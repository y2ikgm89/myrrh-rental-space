/**
 * iCal (.ics) 生成 + Add to Calendar URL ヘルパー
 *
 * `ical-generator` v10 ベース。RFC 5545 準拠で UID 安定・SEQUENCE 管理・
 * METHOD:REQUEST/CANCEL・VTIMEZONE (Asia/Tokyo) をサポートする。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545
 * @module shared/lib/ical
 */

import { format } from "date-fns";
import ical, {
  ICalCalendarMethod,
  ICalEventBusyStatus,
  ICalEventStatus,
  type ICalCalendar,
} from "ical-generator";
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import { buildEventRegistrationUid, buildReservationUid } from "./uid";
import type {
  AddToCalendarUrls,
  CalendarEventInput,
  EventCalendarParams,
  ICalFeedEntry,
  ReservationCalendarParams,
} from "./types";

const PRODID = "-//Myrrh Rental Space//Reservation System//JP";
const DEFAULT_TIMEZONE = "Asia/Tokyo";

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
    timezone: {
      name: DEFAULT_TIMEZONE,
      generator: getVtimezoneComponent,
    },
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
  const formattedDate = format(params.startTime, "yyyy/MM/dd");
  const formattedStart = format(params.startTime, "HH:mm");
  const formattedEnd = format(params.endTime, "HH:mm");

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
// Event registration
// =============================================================================

function buildEventDescription(params: EventCalendarParams): string {
  const formattedDate = format(params.startTime, "yyyy/MM/dd");
  const formattedStart = format(params.startTime, "HH:mm");
  const formattedEnd = format(params.endTime, "HH:mm");

  return [
    `申込ID: ${params.registrationId.slice(0, 8).toUpperCase()}`,
    `イベント: ${params.eventTitle}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
    `参加人数: ${params.numberOfPeople}名`,
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
// iCal Feed (管理者購読)
// =============================================================================

export type ICalFeedParams = {
  readonly calendarName: string;
  readonly entries: readonly ICalFeedEntry[];
};

export function buildICalFeed(params: ICalFeedParams, _host: string): string {
  const cal = createCalendar(ICalCalendarMethod.PUBLISH, params.calendarName);
  for (const entry of params.entries) {
    const event = cal.createEvent({
      id: entry.uid,
      start: entry.startTime,
      end: entry.endTime,
      summary: entry.summary,
      description: entry.description,
      status: ICalEventStatus.CONFIRMED,
      busystatus: ICalEventBusyStatus.BUSY,
      sequence: entry.sequence,
    });
    if (entry.location !== undefined) event.location(entry.location);
  }
  return cal.toString();
}

// =============================================================================
// Add to Calendar URL Builders
// =============================================================================

function formatUtcCompact(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${formatUtcCompact(event.startTime)}/${formatUtcCompact(event.endTime)}`,
    details: event.description,
  });
  if (event.location !== undefined) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookWebUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: event.startTime.toISOString(),
    enddt: event.endTime.toISOString(),
    subject: event.summary,
    body: event.description,
  });
  if (event.location !== undefined) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export type BuildAddToCalendarUrlsParams = CalendarEventInput & {
  readonly icsDownloadUrl: string;
};

export function buildAddToCalendarUrls(
  params: BuildAddToCalendarUrlsParams,
): AddToCalendarUrls {
  return {
    google: buildGoogleCalendarUrl(params),
    outlookWeb: buildOutlookWebUrl(params),
    ics: params.icsDownloadUrl,
  };
}

export type {
  AddToCalendarUrls,
  CalendarEventInput,
  EventCalendarParams,
  ICalFeedEntry,
  ReservationCalendarParams,
} from "./types";
export { buildEventRegistrationUid, buildReservationUid } from "./uid";
