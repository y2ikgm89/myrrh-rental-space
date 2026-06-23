import { describe, test, expect } from "bun:test";
import {
  createCancelToken,
  verifyCancelToken,
  tokenFingerprint,
} from "@/shared/lib/reservation-cancel-token";

const RID = "11111111-1111-4111-8111-111111111111";

describe("createCancelToken / verifyCancelToken", () => {
  test("往復で reservationId / iat / exp を復元できる", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const exp = new Date("2026-04-02T00:00:00Z");
    const iat = new Date("2026-04-01T00:00:00Z");
    const token = createCancelToken(RID, exp, iat);
    expect(verifyCancelToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
      issuedAt: iat.getTime(),
      expiresAt: exp.getTime(),
    });
  });

  test("issuedAt 省略時は呼び出し時刻が iat に焼かれる", () => {
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h ahead
    const before = Date.now();
    const token = createCancelToken(RID, exp);
    const after = Date.now();
    const result = verifyCancelToken(token, new Date(before));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.issuedAt).toBeGreaterThanOrEqual(before);
      expect(result.issuedAt).toBeLessThanOrEqual(after);
    }
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
    const iat = new Date("2026-03-31T00:00:00Z");
    const token = createCancelToken(RID, exp, iat);
    expect(verifyCancelToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
      issuedAt: iat.getTime(),
      expiresAt: exp.getTime(),
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

describe("tokenFingerprint", () => {
  test("16 桁の hex 指紋を返す", () => {
    const fp = tokenFingerprint("any-token-value");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  test("同じトークンは同じ指紋（決定論的）", () => {
    expect(tokenFingerprint("xyz")).toBe(tokenFingerprint("xyz"));
  });

  test("異なるトークンは異なる指紋（高確率）", () => {
    expect(tokenFingerprint("abc")).not.toBe(tokenFingerprint("def"));
  });
});
