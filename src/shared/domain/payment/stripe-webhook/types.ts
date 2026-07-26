import "server-only";

/**
 * Checkout Session から判別した決済対象（予約 or イベント申込）。
 */
export type PaymentSubject =
  | { kind: "reservation"; reservationId: string }
  | { kind: "event-registration"; registrationId: string };
