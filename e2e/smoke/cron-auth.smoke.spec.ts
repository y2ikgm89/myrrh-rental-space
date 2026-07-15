import { test, expect } from "@playwright/test";

/**
 * Smoke: cron endpoint 認可ガード (task #3 cron-e2e)
 *
 * `/api/cron/*` の Cloud Scheduler OIDC Bearer token 認可契約を
 * HTTP レベルで検証する fail-closed E2E。
 *
 * ## 検証対象
 * - 認証なしリクエスト → 401 (`authorizeCronRequest` が Bearer 抽出失敗で即 reject)
 * - 不正 Bearer token → 401 (Google OIDC verify 失敗で reject)
 * - 「Bearer 」プレフィックス欠落 → 401
 * - `/api/cron/*` が proxy の rate limit 対象外である (連続 20 req が全て 401 で
 *   429 が混入しない = `pathname.startsWith("/api/cron")` の exemption 動作確認)
 *
 * ## 除外
 * - 「正しい Cloud Scheduler service account 発行の OIDC token → 200」は
 *   本物の Google OIDC 署名鍵を要求するため E2E では検証しない
 *   (unit `__tests__/unit/shared/lib/cron-auth.test.ts` で verifyToken 差し替えパスを網羅済)
 *
 * ## 対象 endpoint (representative subset, 全 endpoint は同一 authorizeCronRequest を通る)
 * - /api/cron/pending-reservation-expire
 * - /api/cron/waitlist-expire
 * - /api/cron/receipt-backfill
 * - /api/cron/event-reminder
 * - /api/cron/data-retention
 *
 * ## Placement
 * `chromium-smoke` project (認可契約は critical-path、破壊時に全 cron 経路が
 * public 化する silent regression のため PR gate に組み込む)。
 */

const CRON_ENDPOINTS = [
  "/api/cron/pending-reservation-expire",
  "/api/cron/waitlist-expire",
  "/api/cron/receipt-backfill",
  "/api/cron/event-reminder",
  "/api/cron/data-retention",
] as const;

test.describe("smoke: cron auth (fail-closed)", () => {
  for (const endpoint of CRON_ENDPOINTS) {
    test(`${endpoint}: 認証ヘッダなしで 401`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(response.status()).toBe(401);
    });

    test(`${endpoint}: 不正 Bearer token で 401`, async ({ request }) => {
      const response = await request.get(endpoint, {
        headers: { authorization: "Bearer invalid-token-12345" },
      });
      expect(response.status()).toBe(401);
    });

    test(`${endpoint}: "Bearer " prefix 欠落で 401`, async ({ request }) => {
      const response = await request.get(endpoint, {
        headers: { authorization: "invalid-token-without-prefix" },
      });
      expect(response.status()).toBe(401);
    });
  }

  test("/api/cron/* は proxy rate limit 対象外 (apiRateLimiter budget 超の req が全て 401、429 混入なし)", async ({
    request,
  }) => {
    // Cloud Scheduler は分あたり複数回 hit するため /api/cron 全体を rate limit から
    // 除外する契約 (proxy.ts の `!pathname.startsWith("/api/cron")` gate)。
    // 除外が壊れると認可 fail 前に 429 で弾かれ、逆に Cloud Scheduler が正常時にも
    // rate limit hit で silent skip する silent regression を招く。
    //
    // Codex review PR#1141 対応: apiRateLimiter は 100 req/min/IP (`shared/lib/rate-limit.ts`
    // の maxRequests: 100)。budget 未満の req 数 (例: 20) だと exemption が壊れても
    // 401 のみで通ってしまい contract を pin できない。budget を明確に超える 110 req を
    // 送り、exemption 動作時 → 全 401、exemption 破壊時 → 100 req 後は 429 混入で
    // 差が出るように補強する。
    const endpoint = CRON_ENDPOINTS[0];
    const REQUEST_COUNT = 110;
    const responses = await Promise.all(
      Array.from({ length: REQUEST_COUNT }, () => request.get(endpoint)),
    );

    const statuses = responses.map((r) => r.status());
    expect(statuses.every((status) => status === 401)).toBe(true);
    expect(statuses.some((status) => status === 429)).toBe(false);
  });
});
