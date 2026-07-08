import { describe, test, expect } from "bun:test";
import {
  createEventRegistrationClaimToken,
  verifyEventRegistrationClaimToken,
  MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-claim-token";

const EID = "22222222-2222-4222-8222-222222222222";

describe("createEventRegistrationClaimToken / verifyEventRegistrationClaimToken", () => {
  test("往復で eventRegistrationId を復元できる", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z");
    const token = createEventRegistrationClaimToken(EID, issuedAt);
    expect(verifyEventRegistrationClaimToken(token, now)).toEqual({
      valid: true,
      eventRegistrationId: EID,
    });
  });

  test("issuedAt 省略時は呼び出し時刻から7日後が exp になる", () => {
    const before = Date.now();
    const token = createEventRegistrationClaimToken(EID);
    const justBeforeExpiry = new Date(
      before + MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS - 1000,
    );
    expect(verifyEventRegistrationClaimToken(token, justBeforeExpiry)).toEqual({
      valid: true,
      eventRegistrationId: EID,
    });
  });

  test("7日を過ぎたトークンは invalid", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const afterExpiry = new Date(
      issuedAt.getTime() +
        MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS +
        1000,
    );
    const token = createEventRegistrationClaimToken(EID, issuedAt);
    expect(verifyEventRegistrationClaimToken(token, afterExpiry)).toEqual({
      valid: false,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createEventRegistrationClaimToken(EID);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("改ざんされたトークンは invalid", () => {
    const token = createEventRegistrationClaimToken(EID);
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyEventRegistrationClaimToken(tampered, new Date())).toEqual({
      valid: false,
    });
  });

  test("予約 claim トークン(別purpose)はイベント claim トークンとして通らない", async () => {
    const { createReservationClaimToken } =
      await import("@/shared/lib/reservation-claim-token");
    const reservationToken = createReservationClaimToken(EID);
    expect(
      verifyEventRegistrationClaimToken(reservationToken, new Date()),
    ).toEqual({ valid: false });
  });

  test("トークン形式でない文字列は invalid", () => {
    expect(
      verifyEventRegistrationClaimToken("not-a-real-token", new Date()),
    ).toEqual({ valid: false });
  });
});
