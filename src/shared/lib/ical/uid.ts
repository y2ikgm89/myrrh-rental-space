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
