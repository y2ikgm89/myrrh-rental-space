import { describe, test, expect } from "bun:test";
import {
  computeCancelTokenExpiresAt,
  createCancelToken,
  MAX_CANCEL_TOKEN_LIFETIME_MS,
  verifyCancelToken,
  tokenFingerprint,
} from "@/shared/lib/reservation-cancel-token";

const RID = "11111111-1111-4111-8111-111111111111";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

describe("computeCancelTokenExpiresAt", () => {
  test("policy 期限が cap より早ければ policy 期限を返す（リマインダ等の通常ケース）", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const startTime = new Date(now.getTime() + 2 * DAY); // 48h ahead
    const result = computeCancelTokenExpiresAt(startTime, 24, now);
    // 48h - 24h = 24h ahead < 7 day cap
    expect(result.getTime()).toBe(startTime.getTime() - 24 * HOUR);
  });

  test("policy 期限が cap より遅ければ 7 日 cap を返す（先付け確認メール）", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const startTime = new Date(now.getTime() + 30 * DAY); // 30 days ahead
    const result = computeCancelTokenExpiresAt(startTime, 24, now);
    // 30day - 24h = 29day > 7 day cap → cap
    expect(result.getTime()).toBe(now.getTime() + MAX_CANCEL_TOKEN_LIFETIME_MS);
  });

  test("境界: policy 期限がちょうど cap と一致するとき cap 値を返す", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const startTime = new Date(
      now.getTime() + MAX_CANCEL_TOKEN_LIFETIME_MS + 24 * HOUR,
    );
    const result = computeCancelTokenExpiresAt(startTime, 24, now);
    expect(result.getTime()).toBe(now.getTime() + MAX_CANCEL_TOKEN_LIFETIME_MS);
  });

  test("過去の予約では policy 期限（過去）を返す（呼び出し側が `> now` で除外）", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const startTime = new Date(now.getTime() - HOUR); // 1h past
    const result = computeCancelTokenExpiresAt(startTime, 24, now);
    expect(result.getTime()).toBe(startTime.getTime() - 24 * HOUR);
    expect(result.getTime()).toBeLessThan(now.getTime());
  });

  test("now 省略時は呼び出し時刻基準で cap を計算", () => {
    const startTime = new Date(Date.now() + 365 * DAY); // 1 年先
    const before = Date.now();
    const result = computeCancelTokenExpiresAt(startTime, 24);
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(
      before + MAX_CANCEL_TOKEN_LIFETIME_MS,
    );
    expect(result.getTime()).toBeLessThanOrEqual(
      after + MAX_CANCEL_TOKEN_LIFETIME_MS,
    );
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
