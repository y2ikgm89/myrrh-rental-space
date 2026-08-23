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
import { formatEventVenueDisplay } from "@/shared/lib/events/venue";
import { buildEventRegistrationUid, buildReservationUid } from "./uid";
import type { EventCalendarParams, ReservationCalendarParams } from "./types";

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

/**
 * 定期予約（ReservationSeries）の RRULE master ICS は**意図的に置いていない**（監査 A-68）。
 *
 * 以前は `buildReservationSeriesCalendar` / `buildReservationSeriesCancelCalendar` が
 * 実装・テスト付きで存在したが、**本番から一度も呼ばれていなかった**。
 * JSDoc は「this-and-following scope の場合は cancellation-side-effects の
 * scope 判定側で分岐する」と書いていたが、**その分岐は存在しない**。
 *
 * 現行の振る舞いは「instance ごとに個別の ICS」で、これは動いている。
 * RRULE master に寄せるなら、scope（all / this-and-following）ごとの METHOD と
 * UNTIL の扱い、既送信分との UID 整合、calendar-sync との相互作用を
 * 同時に決める必要がある。helper だけを先に置くとまた同じ状態になる。
 */

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
} from "./types";

export {
  buildEventRegistrationUid,
  buildEventUid,
  buildReservationUid,
} from "./uid";
