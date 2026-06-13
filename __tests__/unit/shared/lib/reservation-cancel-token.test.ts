import { describe, test, expect } from "bun:test";
import {
  createCancelToken,
  verifyCancelToken,
} from "@/shared/lib/reservation-cancel-token";

const RID = "11111111-1111-4111-8111-111111111111";

describe("createCancelToken / verifyCancelToken", () => {
  test("往復で reservationId を復元できる", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const exp = new Date("2026-04-02T00:00:00Z");
    const token = createCancelToken(RID, exp);
    expect(verifyCancelToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const exp = new Date("2026-04-02T00:00:00Z");
    const token = createCancelToken(RID, exp);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("有効期限を過ぎたトークンは expired", () => {
    const exp = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z"); // exp の 1 秒後
    const token = createCancelToken(RID, exp);
    expect(verifyCancelToken(token, now)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  test("ちょうど有効期限なら有効（境界値）", () => {
    const exp = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:00Z");
    const token = createCancelToken(RID, exp);
    expect(verifyCancelToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("改ざんされたトークンは invalid", () => {
    const exp = new Date("2026-04-02T00:00:00Z");
    const now = new Date("2026-04-01T00:00:00Z");
    const token = createCancelToken(RID, exp);
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyCancelToken(tampered, now)).toEqual({
      valid: false,
      reason: "invalid",
    });
  });

  test("トークン形式でない文字列は invalid", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    expect(verifyCancelToken("not-a-real-token", now)).toEqual({
      valid: false,
      reason: "invalid",
    });
  });
});
