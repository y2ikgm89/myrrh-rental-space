/**
 * iCal 型定義
 *
 * @module shared/lib/ical/types
 */

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

/** イベント申込 ICS 生成パラメータ */
export type EventCalendarParams = {
  readonly registrationId: string;
  readonly eventTitle: string;
  readonly customerName: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly numberOfPeople: number;
  readonly sequence: number;
  readonly url?: string;
  readonly organizerName?: string;
  readonly organizerEmail?: string;
};

/** iCal フィード（管理者購読用）の 1 エントリ */
export type ICalFeedEntry = {
  readonly uid: string;
  readonly summary: string;
  readonly description: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location?: string;
  readonly sequence: number;
};
