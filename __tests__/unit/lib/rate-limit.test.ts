/**
 * レート制限ユーティリティテスト
 */

import { describe, test, expect } from "bun:test";
import {
  createRateLimiter,
  getClientIp,
  resolveClientIp,
  checkRateLimit,
} from "@/shared/lib/rate-limit";

describe("createRateLimiter", () => {
  test("制限内のリクエストは許可される", async () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 3,
    });

    const result1 = await limiter.check("192.168.1.1");
    expect(result1.success).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = await limiter.check("192.168.1.1");
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = await limiter.check("192.168.1.1");
    expect(result3.success).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  test("制限超過時はブロックされる", async () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 2,
    });

    await limiter.check("10.0.0.1");
    await limiter.check("10.0.0.1");

    const result = await limiter.check("10.0.0.1");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  test("異なるトークンは独立してカウントされる", async () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 1,
    });

    const result1 = await limiter.check("ip-a");
    expect(result1.success).toBe(true);

    // 異なるIPは制限されない
    const result2 = await limiter.check("ip-b");
    expect(result2.success).toBe(true);

    // 元のIPは制限される
    const result3 = await limiter.check("ip-a");
    expect(result3.success).toBe(false);
  });

  test("reset()でトークンの制限がリセットされる", async () => {
    const limiter = createRateLimiter({
      interval: 60_000,
      maxRequests: 1,
    });

    await limiter.check("reset-test");
    const blocked = await limiter.check("reset-test");
    expect(blocked.success).toBe(false);

    await limiter.reset("reset-test");

    const afterReset = await limiter.check("reset-test");
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });

  test("reset時刻が未来に設定される", async () => {
    const limiter = createRateLimiter({
      interval: 30_000,
      maxRequests: 5,
    });

    const now = Date.now();
    const result = await limiter.check("time-test");
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

describe("resolveClientIp（信頼境界 / origin lock）", () => {
  // ヘッダー名 → 値のアクセサ（小文字キーで照合）
  function makeGetHeader(headers: Record<string, string>) {
    return (name: string): string | null => headers[name.toLowerCase()] ?? null;
  }

  const SECRET = "x".repeat(40);

  describe("origin lock 無効（CLOUDFLARE_ORIGIN_SECRET 未設定）", () => {
    test("cf-connecting-ip を優先（従来挙動）", () => {
      const ip = resolveClientIp(
        makeGetHeader({
          "cf-connecting-ip": "1.2.3.4",
          "x-forwarded-for": "5.6.7.8",
        }),
        undefined,
      );
      expect(ip).toBe("1.2.3.4");
    });

    test("x-forwarded-for の先頭にフォールバック", () => {
      const ip = resolveClientIp(
        makeGetHeader({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }),
        undefined,
      );
      expect(ip).toBe("10.0.0.1");
    });

    test("ヘッダー無しは unknown", () => {
      expect(resolveClientIp(makeGetHeader({}), undefined)).toBe("unknown");
    });
  });

  describe("origin lock 有効（CLOUDFLARE_ORIGIN_SECRET 設定済み）", () => {
    test("x-origin-verify 一致時は cf-connecting-ip を信頼", () => {
      const ip = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": SECRET,
          "cf-connecting-ip": "1.2.3.4",
        }),
        SECRET,
      );
      expect(ip).toBe("1.2.3.4");
    });

    test("x-origin-verify が無い直アクセスは direct-untrusted に集約（cf-connecting-ip を偽装しても無効）", () => {
      const ip = resolveClientIp(
        makeGetHeader({ "cf-connecting-ip": "6.6.6.6" }),
        SECRET,
      );
      expect(ip).toBe("direct-untrusted");
    });

    test("x-origin-verify が不一致なら direct-untrusted（偽装シークレット拒否）", () => {
      const ip = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": "wrong-secret-value",
          "cf-connecting-ip": "6.6.6.6",
        }),
        SECRET,
      );
      expect(ip).toBe("direct-untrusted");
    });

    test("Cloudflare 経由でも cf-connecting-ip が無ければ direct-untrusted（保守的）", () => {
      const ip = resolveClientIp(
        makeGetHeader({ "x-origin-verify": SECRET }),
        SECRET,
      );
      expect(ip).toBe("direct-untrusted");
    });

    test("異なるクライアントは Cloudflare 経由で独立した IP に解決される", () => {
      const a = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": SECRET,
          "cf-connecting-ip": "1.1.1.1",
        }),
        SECRET,
      );
      const b = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": SECRET,
          "cf-connecting-ip": "2.2.2.2",
        }),
        SECRET,
      );
      expect(a).toBe("1.1.1.1");
      expect(b).toBe("2.2.2.2");
      expect(a).not.toBe(b);
    });
  });

  describe("無停止ローテーション（カンマ区切りで複数シークレット受理）", () => {
    const OLD = "o".repeat(40);
    const NEW = "n".repeat(40);
    const SPEC = `${OLD},${NEW}`;

    test("旧シークレットのヘッダーを受理（移行前の Cloudflare 注入値）", () => {
      const ip = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": OLD,
          "cf-connecting-ip": "1.2.3.4",
        }),
        SPEC,
      );
      expect(ip).toBe("1.2.3.4");
    });

    test("新シークレットのヘッダーを受理（移行後の Cloudflare 注入値）", () => {
      const ip = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": NEW,
          "cf-connecting-ip": "1.2.3.4",
        }),
        SPEC,
      );
      expect(ip).toBe("1.2.3.4");
    });

    test("どちらにも一致しない値は direct-untrusted", () => {
      const ip = resolveClientIp(
        makeGetHeader({
          "x-origin-verify": "neither-secret-value-aaaaaaaaaaaaaaaa",
          "cf-connecting-ip": "6.6.6.6",
        }),
        SPEC,
      );
      expect(ip).toBe("direct-untrusted");
    });

    test("空要素（余分なカンマ/空白）は許容シークレットにならない", () => {
      const ip = resolveClientIp(
        makeGetHeader({ "x-origin-verify": "", "cf-connecting-ip": "6.6.6.6" }),
        ` ${OLD} , , `,
      );
      expect(ip).toBe("direct-untrusted");
    });
  });
});

describe("checkRateLimit", () => {
  test("/api/auth mutation パスは authMutationRateLimiter を使用する", async () => {
    const result = await checkRateLimit("/api/auth/sign-in", "check-auth-ip");
    expect(result.success).toBe(true);
    // authMutationRateLimiter は maxRequests: 20
    expect(result.remaining).toBe(19);
  });

  test("/api/admin/login-tokens パスはトークン用リミッターを使用する", async () => {
    const result = await checkRateLimit(
      "/api/admin/login-tokens/verify",
      "check-token-ip",
    );
    expect(result.success).toBe(true);
    // トークンリミッターは maxRequests: 30
    expect(result.remaining).toBe(29);
  });

  test("その他のAPIパスはデフォルトリミッターを使用する", async () => {
    const result = await checkRateLimit("/api/spaces", "check-default-ip");
    expect(result.success).toBe(true);
    // デフォルトリミッターは maxRequests: 100
    expect(result.remaining).toBe(99);
  });
});
