import { describe, test, expect } from "bun:test";
import {
  createReservationClaimToken,
  verifyReservationClaimToken,
  MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-claim-token";

const RID = "11111111-1111-4111-8111-111111111111";

describe("createReservationClaimToken / verifyReservationClaimToken", () => {
  test("往復で reservationId を復元できる", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z");
    const token = createReservationClaimToken(RID, issuedAt);
    expect(verifyReservationClaimToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("issuedAt 省略時は呼び出し時刻から7日後が exp になる", () => {
    const before = Date.now();
    const token = createReservationClaimToken(RID);
    const justBeforeExpiry = new Date(
      before + MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS - 1000,
    );
    expect(verifyReservationClaimToken(token, justBeforeExpiry)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("7日を過ぎたトークンは invalid", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const afterExpiry = new Date(
      issuedAt.getTime() + MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS + 1000,
    );
    const token = createReservationClaimToken(RID, issuedAt);
    expect(verifyReservationClaimToken(token, afterExpiry)).toEqual({
      valid: false,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createReservationClaimToken(RID);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("改ざんされたトークンは invalid", () => {
    const token = createReservationClaimToken(RID);
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyReservationClaimToken(tampered, new Date())).toEqual({
      valid: false,
    });
  });

  test("キャンセルトークン(別purpose)は claim トークンとして通らない", async () => {
    const { createCancelToken } =
      await import("@/shared/lib/reservation-cancel-token");
    const cancelToken = createCancelToken(
      RID,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    expect(verifyReservationClaimToken(cancelToken, new Date())).toEqual({
      valid: false,
    });
  });

  test("トークン形式でない文字列は invalid", () => {
    expect(verifyReservationClaimToken("not-a-real-token", new Date())).toEqual(
      { valid: false },
    );
  });
});
