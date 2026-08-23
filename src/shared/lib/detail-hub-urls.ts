import "server-only";

/**
 * 「会員はマイページ詳細、ゲストは status token 付き薄い詳細ページ」の URL 導出 SSoT。
 *
 * ## なぜ 1 箇所に集めるのか（監査 A-16）
 *
 * この導出は予約側・イベント申込側でそれぞれ **3 箇所に独立実装**されていた。
 * うち 2 対は別ファイルに同名の関数として存在し、互いを import していない:
 *
 * - `stripe-webhook/receipt-detail-urls.ts` の `buildReservationReceiptDetailUrl`
 * - `reservations/payment-commands.ts` の**同名の非 export 関数**（本文は同一）
 * - `email/reservation-emails.ts` の `buildBookingHubUrl`
 *
 * イベント側も同型。結果として `/mypage/reservations/{id}` `/reservation/status?token=`
 * `/mypage/events/{id}` `/events/registrations/status?token=` という 4 本のパスが
 * それぞれ 3 ファイルに literal で散在していた。会員判定の反転や URL 変更を
 * 1 箇所だけ直すと、経路によって別の URL が送られる。
 *
 * **ゲスト用トークンの寿命はここで決めない。** それぞれのトークン module
 * (`reservation-status-token.ts` / `event-registration-status-token.ts`) が持つ
 * `*_LIFETIME_MS` をそのまま使う。
 */

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
 * 予約 ID から会員向けマイページの予約詳細 URL を組み立てる。
 * `userId` が無い（ゲスト予約）なら `undefined`。
 */
export function buildMemberReservationUrl(
  userId: string | null | undefined,
  reservationId: string,
): string | undefined {
  if (!userId) return undefined;
  return `${getAppUrl()}/mypage/reservations/${reservationId}`;
}

/**
 * 予約詳細ハブ URL。会員はマイページ詳細、ゲストは status token 付き詳細ページ。
 * 平文パスコードはメールに載せず、この URL 先で開示する。
 */
export function buildBookingHubUrl(
  userId: string | null | undefined,
  reservationId: string,
): string {
  const memberUrl = buildMemberReservationUrl(userId, reservationId);
  if (memberUrl) return memberUrl;
  const token = createStatusToken(
    reservationId,
    new Date(Date.now() + STATUS_TOKEN_LIFETIME_MS),
  );
  return `${getAppUrl()}/reservation/status?token=${token}`;
}

/**
 * 申込 ID から会員向けマイページのイベント申込詳細 URL を組み立てる。
 * `customerId` が無い（ゲスト申込）なら `undefined`。
 *
 * 予約側の `buildMemberReservationUrl` と違って外部利用が無いので export しない。
 */
function buildMemberEventRegistrationUrl(
  customerId: string | null | undefined,
  registrationId: string,
): string | undefined {
  if (!customerId) return undefined;
  return `${getAppUrl()}/mypage/events/${registrationId}`;
}

/** イベント申込詳細ハブ URL。`buildBookingHubUrl`（予約）と対称。 */
export function buildEventRegistrationHubUrl(
  customerId: string | null | undefined,
  registrationId: string,
): string {
  const memberUrl = buildMemberEventRegistrationUrl(customerId, registrationId);
  if (memberUrl) return memberUrl;
  const token = createEventRegistrationStatusToken(
    registrationId,
    new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS),
  );
  return `${getAppUrl()}/events/registrations/status?token=${token}`;
}
