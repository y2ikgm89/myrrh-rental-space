/**
 * レート制限ユーティリティテスト
 */

import { describe, test, expect } from "bun:test";
import {
  createRateLimiter,
  getClientIp,
  checkRateLimit,
} from "@/shared/lib/rate-limit";

describe("createRateLimiter", () => {
  test("制限内のリクエストは許可される", () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 3,
    });

    const result1 = limiter.check("192.168.1.1");
    expect(result1.success).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = limiter.check("192.168.1.1");
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = limiter.check("192.168.1.1");
    expect(result3.success).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  test("制限超過時はブロックされる", () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 2,
    });

    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");

    const result = limiter.check("10.0.0.1");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  test("異なるトークンは独立してカウントされる", () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 1,
    });

    const result1 = limiter.check("ip-a");
    expect(result1.success).toBe(true);

    // 異なるIPは制限されない
    const result2 = limiter.check("ip-b");
    expect(result2.success).toBe(true);

    // 元のIPは制限される
    const result3 = limiter.check("ip-a");
    expect(result3.success).toBe(false);
  });

  test("reset()でトークンの制限がリセットされる", () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 1,
    });

    limiter.check("reset-test");
    const blocked = limiter.check("reset-test");
    expect(blocked.success).toBe(false);

    limiter.reset("reset-test");

    const afterReset = limiter.check("reset-test");
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });

  test("reset時刻が未来に設定される", () => {
    const limiter = createRateLimiter({
      interval: 30_000,
      maxRequests: 5,
    });

    const now = Date.now();
    const result = limiter.check("time-test");
    expect(result.reset).toBeGreaterThanOrEqual(now + 30_000);
  });
});

describe("getClientIp", () => {
  function createRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost", {
      headers: new Headers(headers),
    });
  }

  test("cf-connecting-ip を優先する", () => {
    const req = createRequest({
      "cf-connecting-ip": "1.2.3.4",
      "x-forwarded-for": "5.6.7.8",
      "x-real-ip": "9.10.11.12",
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  test("x-forwarded-for の最初のIPを返す", () => {
    const req = createRequest({
      "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3",
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  test("x-real-ip にフォールバックする", () => {
    const req = createRequest({
      "x-real-ip": "172.16.0.1",
    });
    expect(getClientIp(req)).toBe("172.16.0.1");
  });

  test("ヘッダーがない場合は 'unknown' を返す", () => {
    const req = createRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  test("/api/auth パスは認証用リミッターを使用する", () => {
    const result = checkRateLimit("/api/auth/sign-in", "check-auth-ip");
    expect(result.success).toBe(true);
    // 認証リミッターは maxRequests: 10
    expect(result.remaining).toBe(9);
  });

  test("/api/admin/login-tokens パスはトークン用リミッターを使用する", () => {
    const result = checkRateLimit(
      "/api/admin/login-tokens/verify",
      "check-token-ip",
    );
    expect(result.success).toBe(true);
    // トークンリミッターは maxRequests: 30
    expect(result.remaining).toBe(29);
  });

  test("その他のAPIパスはデフォルトリミッターを使用する", () => {
    const result = checkRateLimit("/api/spaces", "check-default-ip");
    expect(result.success).toBe(true);
    // デフォルトリミッターは maxRequests: 100
    expect(result.remaining).toBe(99);
  });
});
