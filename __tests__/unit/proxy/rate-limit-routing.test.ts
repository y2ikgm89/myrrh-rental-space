/**
 * Proxy のレートリミッター経路テスト。
 *
 * `proxy.ts` は `/api/*` を `checkRateLimit(pathname, clientIp)` に委譲する。
 * ここでは「どの bucket に落ちるか」（authMutationRateLimiter / apiRateLimiter /
 * expensiveAdminRateLimiter）を pathname → remaining 初期値で
 * 間接的に検証する。
 *
 * 各 bucket は in-memory LRU で independent token を持つため、token (IP) を
 * 個別生成すれば cross-test の汚染なく `remaining` を assert できる。
 *
 * Buckets:
 * - authMutationRateLimiter:     maxRequests 20 → 初回 remaining 19
 * - apiRateLimiter:              maxRequests 100 → 初回 remaining 99
 * - expensiveAdminRateLimiter:   maxRequests 60 → 初回 remaining 59
 */

import { describe, test, expect } from "bun:test";
import { checkRateLimit } from "@/shared/lib/rate-limit";

const AUTH_MUTATION_REMAINING = 19;
const API_REMAINING = 99;
const EXPENSIVE_ADMIN_REMAINING = 59;

function uniqueIp(label: string): string {
  // テスト間で bucket を汚染しないために、unique なラベルを IP として使う。
  // checkRateLimit / InMemoryRateLimitStore はキーを opaque string として扱うため
  // 形式が IP でなくても問題ない（rate-limit.test.ts も同様）。
  return `proxy-rl-${label}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("checkRateLimit — /api/auth (admin Better Auth)", () => {
  test("sign-in は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit("/api/auth/sign-in", uniqueIp("a1"));
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("sign-up は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/auth/sign-up/email",
      uniqueIp("a2"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("reset-password は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/auth/reset-password",
      uniqueIp("a3"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("get-session は apiRateLimiter に落ちる（読み取り専用）", async () => {
    const result = await checkRateLimit(
      "/api/auth/get-session",
      uniqueIp("a4"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });

  test("list-sessions は apiRateLimiter に落ちる（読み取り専用）", async () => {
    const result = await checkRateLimit(
      "/api/auth/list-sessions",
      uniqueIp("a5"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });

  test("list-accounts は apiRateLimiter に落ちる（読み取り専用）", async () => {
    const result = await checkRateLimit(
      "/api/auth/list-accounts",
      uniqueIp("a6"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });
});

describe("checkRateLimit — /api/customer-auth (customer Better Auth)", () => {
  test("sign-in は authMutationRateLimiter に落ちる（credential stuffing 緩和）", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/sign-in",
      uniqueIp("c1"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("sign-up は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/sign-up/email",
      uniqueIp("c2"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("sign-out は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/sign-out",
      uniqueIp("c3"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("forget-password は authMutationRateLimiter に落ちる（enumeration 緩和）", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/forget-password",
      uniqueIp("c4"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("reset-password は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/reset-password",
      uniqueIp("c5"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("change-password は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/change-password",
      uniqueIp("c6"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("change-email は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/change-email",
      uniqueIp("c7"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("verify-email は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/verify-email",
      uniqueIp("c8"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("update-user は authMutationRateLimiter に落ちる", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/update-user",
      uniqueIp("c9"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(AUTH_MUTATION_REMAINING);
  });

  test("get-session は apiRateLimiter に落ちる（読み取り専用）", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/get-session",
      uniqueIp("c10"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });

  test("list-sessions は apiRateLimiter に落ちる（読み取り専用）", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/list-sessions",
      uniqueIp("c11"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });

  test("list-accounts は apiRateLimiter に落ちる（読み取り専用）", async () => {
    const result = await checkRateLimit(
      "/api/customer-auth/list-accounts",
      uniqueIp("c12"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });
});

describe("checkRateLimit — other API paths", () => {
  test("既定 /api/* は apiRateLimiter に落ちる", async () => {
    const result = await checkRateLimit("/api/spaces", uniqueIp("o1"));
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });
});

describe("checkRateLimit — /admin/api/* (defense-in-depth)", () => {
  test("/admin/api/ogp は expensiveAdminRateLimiter (60/分) を使う", async () => {
    const result = await checkRateLimit(
      "/admin/api/ogp",
      uniqueIp("admin-ogp"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(EXPENSIVE_ADMIN_REMAINING);
  });

  test("/admin/api/customers/search は expensiveAdminRateLimiter (60/分) を使う", async () => {
    const result = await checkRateLimit(
      "/admin/api/customers/search",
      uniqueIp("admin-customers-search"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(EXPENSIVE_ADMIN_REMAINING);
  });

  test("/admin/api/pages/* は apiRateLimiter (100/分) を使う", async () => {
    const result = await checkRateLimit(
      "/admin/api/pages/deleted",
      uniqueIp("admin-pages"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });

  test("/admin/api/announcement-bars は apiRateLimiter (100/分) を使う", async () => {
    const result = await checkRateLimit(
      "/admin/api/announcement-bars",
      uniqueIp("admin-announcement-bars"),
    );
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(API_REMAINING);
  });
});
