import { test, expect } from "../fixtures/e2e-test";

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
 * `/api/calendar/*` は proxy の `apiRateLimiter`（100/分/IP）対象なので、IP を
 * 共有すると飽和した窓で **401 の代わりに 429** を受け、認証ガードの contract
 * 検証が偽陰性になる。client IP は `e2e/fixtures/e2e-test.ts` の fixture が
 * テストごとに配るため spec 側の記述は不要（`request` fixture にも効く）。
 */

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
