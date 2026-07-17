/**
 * iCal 型定義
 *
 * @module shared/lib/ical/types
 */

import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";

/** Add to Calendar ボタン用の 3 プロバイダ URL */
export type AddToCalendarUrls = {
  /** Google Calendar 追加リンク（`calendar.google.com/calendar/render`） */
  readonly google: string;
  /** Outlook Web 追加リンク（`outlook.live.com/calendar/0/deeplink/compose`） */
  readonly outlookWeb: string;
  /** .ics ダウンロード URL（Apple Calendar / Outlook デスクトップ / その他） */
  readonly ics: string;
};

/** ICS 生成の共通入力 */
export type CalendarEventInput = {
  readonly summary: string;
  readonly description: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/** 予約 ICS 生成パラメータ */
export type ReservationCalendarParams = {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly customerName: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly notes?: string;
  readonly sequence: number;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/**
 * 予約 series (定期予約 master) ICS 生成パラメータ
 *
 * `.repeating(rrule)` で master VEVENT に RRULE を貼り付ける (RFC 5545)。
 * `dtstart` + `duration` から VEVENT の DTSTART/DTEND を導出。各 instance を
 * 個別 VEVENT として並べない (occurrence は受信側カレンダーが RRULE から展開)。
 */
export type ReservationSeriesCalendarParams = {
  readonly seriesId: string;
  readonly spaceName: string;
  readonly customerName: string;
  /** RFC 5545 RRULE (e.g. `FREQ=WEEKLY;BYDAY=TU;COUNT=10`)。`RRULE:` prefix は不要。 */
  readonly rrule: string;
  /** master VEVENT の DTSTART (絶対時刻 UTC)。 */
  readonly dtstart: Date;
  /** 1 instance あたりの予約時間 (分)。series 全体で固定。 */
  readonly duration: number;
  readonly location?: string;
  readonly notes?: string;
  readonly sequence: number;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/** イベント申込 ICS 生成パラメータ */
export type EventCalendarParams = {
  readonly registrationId: string;
  readonly eventTitle: string;
  readonly customerName: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly quantity: number;
  readonly sequence: number;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
  readonly format: EventFormatValue;
  readonly meetingUrl: string | null;
};
