import { describe, test, expect } from "bun:test";
import {
  createEventRegistrationPaymentToken,
  verifyEventRegistrationPaymentToken,
  buildEventRegistrationPaymentCheckoutUrl,
} from "@/shared/lib/tokens/event-registration-payment-token";

const REGISTRATION_ID = "reg_event_payment_test";

describe("createEventRegistrationPaymentToken / verifyEventRegistrationPaymentToken", () => {
  test("往復で registrationId を復元できる", () => {
    const token = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
    });
    expect(verifyEventRegistrationPaymentToken(token)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("改ざんされたトークンは null を返す", () => {
    const token = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
    });
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyEventRegistrationPaymentToken(tampered)).toBeNull();
  });

  test("トークン形式でない文字列は null", () => {
    expect(verifyEventRegistrationPaymentToken("not-a-real-token")).toBeNull();
  });

  test("空文字は null", () => {
    expect(verifyEventRegistrationPaymentToken("")).toBeNull();
  });

  test("別 purpose のトークン（waitlist offer）は通らない（cross-token misuse 防止）", async () => {
    const { createWaitlistOfferToken } =
      await import("@/shared/lib/tokens/waitlist-offer-token");
    const foreignToken = createWaitlistOfferToken({
      registrationId: REGISTRATION_ID,
    });
    expect(verifyEventRegistrationPaymentToken(foreignToken)).toBeNull();
  });

  test("同じ registrationId でも発行のたびに異なるトークン（IV ランダム性）", () => {
    const token1 = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
    });
    const token2 = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
    });
    // AES-256-GCM は IV がランダムなため同一平文でも暗号文が変わる
    expect(token1).not.toBe(token2);
    // どちらも正しく復号できる
    expect(verifyEventRegistrationPaymentToken(token1)).toEqual({
      registrationId: REGISTRATION_ID,
    });
    expect(verifyEventRegistrationPaymentToken(token2)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });
});

describe("buildEventRegistrationPaymentCheckoutUrl", () => {
  test("token を埋め込んだ checkout URL を返す", () => {
    const url = buildEventRegistrationPaymentCheckoutUrl(REGISTRATION_ID);
    // URL は /events/registrations/checkout/<token> の形式
    expect(url).toMatch(/\/events\/registrations\/checkout\//u);
    // token 部分は base64url 文字のみ
    const token = url.split("/events/registrations/checkout/")[1];
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
    // token を verify すると元の registrationId が復元できる
    expect(verifyEventRegistrationPaymentToken(token as string)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });
});
