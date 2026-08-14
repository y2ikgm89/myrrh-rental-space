import { describe, expect, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { classifyWaitlistOfferCheckoutError } from "@/shared/domain/events/classify-waitlist-offer-checkout-error";
import { WAITLIST_OFFER_TOO_LATE_MESSAGE } from "@/shared/domain/events/waitlist-offer-checkout-messages";

describe("classifyWaitlistOfferCheckoutError", () => {
  test("maps a short waitlist offer window to too-late without CRITICAL", () => {
    const error = new DomainError(
      WAITLIST_OFFER_TOO_LATE_MESSAGE,
      "VALIDATION",
    );

    const disposition = classifyWaitlistOfferCheckoutError(error);

    expect(disposition.destination).toBe("checkout-error");
    expect(disposition.reason).toBe("too-late");
    expect(disposition.severity).not.toBe("CRITICAL");
  });
});
