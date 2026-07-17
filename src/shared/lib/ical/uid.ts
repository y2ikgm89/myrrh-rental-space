/**
 * RFC 5545 UID 生成ヘルパー
 *
 * UID は同一イベントで永続的に安定である必要がある（更新/キャンセルで
 * 既存カレンダー登録を上書きするため）。localpart@domain 形式を使用する。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.7
 * @module shared/lib/ical/uid
 */

const FALLBACK_HOST = "localhost";

function normalizeHost(host: string): string {
  const trimmed = host.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_HOST;
}

/**
 * 予約の iCal UID を生成する（`reservation-<id>@<host>`）。
 */
export function buildReservationUid(
  reservationId: string,
  host: string,
): string {
  return `reservation-${reservationId}@${normalizeHost(host)}`;
}

/**
 * イベント申込の iCal UID を生成する（`event-registration-<id>@<host>`）。
 */
export function buildEventRegistrationUid(
  registrationId: string,
  host: string,
): string {
  return `event-registration-${registrationId}@${normalizeHost(host)}`;
}

/**
 * イベント（GCal 連携用）の iCal UID を生成する（`event-<id>@<host>`）。
 */
export function buildEventUid(eventId: string, host: string): string {
  return `event-${eventId}@${normalizeHost(host)}`;
}

/**
 * ReservationSeries (定期予約 master) の iCal UID を生成する
 * （`reservation-series-<seriesId>@<host>`）。
 *
 * 各 instance ではなく series 全体で単一 UID を使う (RFC 5545 recurring event
 * 契約: master VEVENT + RRULE で全 occurrence を表現)。受信側カレンダーは
 * この UID で「同じ recurring event」として認識し、CANCEL で連動削除する。
 */
export function buildReservationSeriesUid(
  seriesId: string,
  host: string,
): string {
  return `reservation-series-${seriesId}@${normalizeHost(host)}`;
}
