import "server-only";

import { getAppUrl } from "@/shared/lib/constants";
import {
  createStatusToken,
  STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-status-token";
import {
  createEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-status-token";

/**
 * 予約領収書発行通知の CTA URL。
 * 会員は mypage 詳細、ゲストは status token 付き薄い詳細ページ。
 */
export function buildReservationReceiptDetailUrl(reservation: {
  readonly id: string;
  readonly userId: string | null;
}): string {
  const appUrl = getAppUrl();
  if (reservation.userId) {
    return `${appUrl}/mypage/reservations/${reservation.id}`;
  }
  const token = createStatusToken(
    reservation.id,
    new Date(Date.now() + STATUS_TOKEN_LIFETIME_MS),
  );
  return `${appUrl}/reservation/status?token=${token}`;
}

/**
 * イベント申込の領収書発行通知 CTA。
 * 会員は mypage 申込詳細、ゲストは status token 付き薄い詳細ページ。
 */
export function buildEventRegistrationReceiptDetailUrl(registration: {
  readonly id: string;
  readonly customerId: string | null;
}): string {
  const appUrl = getAppUrl();
  if (registration.customerId) {
    return `${appUrl}/mypage/events/${registration.id}`;
  }
  const token = createEventRegistrationStatusToken(
    registration.id,
    new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS),
  );
  return `${appUrl}/events/registrations/status?token=${token}`;
}
