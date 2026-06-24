/**
 * iCal (.ics) 生成 SSoT（server-only）
 *
 * `ical-generator` v10 + `@touch4it/ical-timezones` ベース。RFC 5545 準拠で
 * UID 安定・SEQUENCE 管理・METHOD:REQUEST/CANCEL・VTIMEZONE (Asia/Tokyo) を
 * サポートする。`ical-generator` は `node:fs` / `node:path` に依存するため
 * 本モジュールは server-only として保護する。
 *
 * Client Component から URL ビルダーのみ使う場合は {@link "./urls"} から
 * サブパス import する（`@/shared/lib/ical/urls`）。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545
 * @module shared/lib/ical
 */

import "server-only";

import { format } from "date-fns";
import ical, {
  ICalCalendarMethod,
  ICalEventBusyStatus,
  ICalEventStatus,
  type ICalCalendar,
} from "ical-generator";
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import { buildEventRegistrationUid, buildReservationUid } from "./uid";
import type { EventCalendarParams, ReservationCalendarParams } from "./types";

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
} from "./types";

export {
  buildEventRegistrationUid,
  buildEventUid,
  buildReservationUid,
} from "./uid";
