/**
 * 有料イベント申込（CONFIRMED + 未決済）の fail-safe 有効期限（分）。
 *
 * Reservation 側 `PENDING_RESERVATION_EXPIRY_MINUTES`（60 分）と同型。SettingsReservation
 * に event 専用 TTL は無いため、checkout session `expires_at` / fail-safe cron の
 * 双方でこの定数を SSoT とする。
 *
 * - `paymentStatus = UNPAID`: **申込確定時刻** (`createdAt`) からこの分数を超えた行を
 *   対象（checkout 未開始の座席占有を解放）。
 * - `paymentStatus ∈ {PENDING, FAILED}`: **最終更新** (`updatedAt`) から判定
 *   （UNPAID→PENDING claim / webhook 失敗遷移で refresh される。Reservation の
 *   `paymentInitiatedAt` に相当する専用列は EventRegistration には持たない）。
 */
export const UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES = 60;
