import { test, expect } from "@playwright/test";

/**
 * Calendar API ルートハンドラ - 認証ガード E2E（未認証）
 *
 * `/api/calendar/reservation/[id]` / `/api/calendar/event/[registrationId]` は
 * Customer session 認証必須。未認証リクエストが 401 を返すことを contract として検証する。
 *
 * 認証済みダウンロードのフローは `e2e/authenticated/customer/calendar-download.spec.ts` で
 * storage state を使って検証する。
 *
 * 前提:
 * - dev サーバー動作中（chromium project = 未認証）
 *
 * ## rate limit バケットの隔離
 *
 * `/api/calendar/*` は proxy の `apiRateLimiter`（100/分/IP）対象
 * （`/api/webhooks` `/api/cron` の `infraEndpointRateLimiter` や除外の `/api/live`
 * とは別枠）。既定 IP のままだと飽和した窓で **401 の代わりに 429** を受け、
 * 認証ガードの contract 検証が偽陰性になる。
 *
 * 割当表は `.claude/rules/testing-e2e.md`。gate は
 * `__tests__/unit/architecture/e2e-client-ip-allocation.test.ts`。
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" } });

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const VALID_CUID_LIKE = "cab1234567890abcdef1234567";

test.describe("Calendar API - 認証ガード（未認証）", () => {
  test("GET /api/calendar/reservation/[id] は未認証で 401 を返す", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/calendar/reservation/${VALID_UUID}`,
    );
    expect(response.status()).toBe(401);
  });

  test("GET /api/calendar/event/[registrationId] は未認証で 401 を返す", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/calendar/event/${VALID_CUID_LIKE}`,
    );
    expect(response.status()).toBe(401);
  });

  test("不正な UUID でも認証ガードが先に走り 401 を返す（情報漏洩防止）", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/calendar/reservation/not-a-valid-uuid",
    );
    // 認証 → バリデーションの順なので 401 が先
    expect(response.status()).toBe(401);
  });
});
