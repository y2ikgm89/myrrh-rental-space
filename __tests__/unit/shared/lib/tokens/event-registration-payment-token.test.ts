import { describe, test, expect } from "bun:test";
import {
  createEventRegistrationPaymentToken,
  verifyEventRegistrationPaymentToken,
  buildEventRegistrationPaymentCheckoutUrl,
  EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS,
} from "@/shared/lib/tokens/event-registration-payment-token";

const REGISTRATION_ID = "reg_event_payment_test";
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

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
      expiresAt: FUTURE,
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

  test("exp 経過後は null（期限切れ拒否）", () => {
    const mintedAt = new Date("2020-01-01T00:00:00.000Z");
    const token = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
      now: mintedAt,
    });
    const afterExpiry = new Date(
      mintedAt.getTime() + EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS + 1,
    );
    expect(verifyEventRegistrationPaymentToken(token, afterExpiry)).toBeNull();
  });

  test("TTL 内なら有効", () => {
    const mintedAt = new Date("2020-01-01T00:00:00.000Z");
    const token = createEventRegistrationPaymentToken({
      registrationId: REGISTRATION_ID,
      now: mintedAt,
    });
    const beforeExpiry = new Date(
      mintedAt.getTime() + EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS - 1,
    );
    expect(verifyEventRegistrationPaymentToken(token, beforeExpiry)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });
});

describe("buildEventRegistrationPaymentCheckoutUrl", () => {
  test("?token= を埋め込んだ checkout URL を返す（proxy 転写前提）", () => {
    const url = buildEventRegistrationPaymentCheckoutUrl(REGISTRATION_ID);
    expect(url).toMatch(/\/events\/registrations\/checkout\?token=/u);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(verifyEventRegistrationPaymentToken(token as string)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });
});
