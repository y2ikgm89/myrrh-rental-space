import { DomainError } from "@/shared/domain/domain-error";
import {
  WAITLIST_OFFER_EXPIRED_MESSAGE,
  WAITLIST_OFFER_NOT_ACTIVE_MESSAGE,
  WAITLIST_OFFER_TOO_LATE_MESSAGE,
} from "@/shared/domain/events/waitlist-offer-checkout-messages";

export const WAITLIST_CHECKOUT_ISSUE_REASONS = [
  "conflict",
  "too-late",
  "system",
] as const;

export type WaitlistCheckoutIssueReason =
  (typeof WAITLIST_CHECKOUT_ISSUE_REASONS)[number];

export type WaitlistOfferCheckoutDisposition =
  | {
      destination: "expired";
      reason?: undefined;
      severity: null;
    }
  | {
      destination: "checkout-error";
      reason: WaitlistCheckoutIssueReason;
      severity: "CRITICAL" | null;
    };

function isGenuineOfferExpiry(error: DomainError): boolean {
  if (error.code === "NOT_FOUND") return true;
  return (
    error.code === "VALIDATION" &&
    (error.message === WAITLIST_OFFER_NOT_ACTIVE_MESSAGE ||
      error.message === WAITLIST_OFFER_EXPIRED_MESSAGE)
  );
}

/**
 * waitlist checkout route が DomainError を expired / checkout-error に
 * 振り分ける分類。`too-late`（残り 30 分未満）は期限切れ画面にも
 * CRITICAL にも落とさない。
 */
export function classifyWaitlistOfferCheckoutError(
  error: DomainError,
): WaitlistOfferCheckoutDisposition {
  if (isGenuineOfferExpiry(error)) {
    return { destination: "expired", severity: null };
  }

  if (
    error.code === "VALIDATION" &&
    error.message === WAITLIST_OFFER_TOO_LATE_MESSAGE
  ) {
    return {
      destination: "checkout-error",
      reason: "too-late",
      severity: null,
    };
  }

  if (error.code === "CONFLICT") {
    return {
      destination: "checkout-error",
      reason: "conflict",
      severity: null,
    };
  }

  return {
    destination: "checkout-error",
    reason: "system",
    severity: "CRITICAL",
  };
}
