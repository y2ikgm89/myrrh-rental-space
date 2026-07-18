import { test, expect } from "@playwright/test";

/**
 * E2E-05: GCal series retry cron - HTTP contract regression gate
 *
 * `/api/cron/calendar-sync-retry` は GCAL-RETRY-01/03/04 の silent-data-loss
 * リスクを塞ぐ retry ジョブ。GCAL-RETRY-04 (PR #1203) で「series-child は
 * `createCalendarEvent` を呼ばず、既存 master に対する `fetchEventInstances`
 * + `writeBackInstanceGoogleCalendarEventIds` のみを再試行する」経路に修正され、
 * 二重 GCal 招待 regression を防いだ。
 *
 * ## 本 spec の scope
 *
 * この spec は **HTTP contract** レベルの regression gate である:
 * - endpoint が存在し 404 で消えていない
 * - 認証ガードが fail-closed で機能している (401 without/invalid Bearer)
 * - `/api/cron/*` の rate-limit 除外契約 (`proxy.ts` の
 *   `!pathname.startsWith("/api/cron")` gate) が本 endpoint にも適用されている
 *
 * この 3 点は「Cloud Scheduler から本 endpoint に届く経路が生きていること」を
 * 保証する最低限の gate であり、endpoint 削除 / auth 誤配線 / rate-limit 巻き
 * 込みといった silent-regression (retry cron が沈黙し failed sync が積み上がる)
 * を検出する。
 *
 * ## 本 spec の scope 外 (unit テスト側の責務)
 *
 * 「seed 済み failed series を POST で処理させ、master 未再作成 + child
 * eventId が write-back される」深い挙動検証は下記に集中させる:
 *
 * - `__tests__/unit/lib/calendar-sync/retry-failed-syncs.test.ts`
 *   `retryFailedSyncs — GCAL-RETRY-04 series/standalone separation` describe
 *   - series-child は `createCalendarEvent` を呼ばず fetchEventInstances +
 *     writeBack のみ (master 二重招待 regression の直接的な gate)
 *   - series master 未永続 → 想定外として failed 計上 + logError
 *   - standalone / series の失敗集合合計を正しく返す
 * - `__tests__/unit/api/cron-calendar-sync-retry.test.ts`
 *   route handler 層の feature-off 早期 return / invalidate 呼び出し / error 500 経路
 *
 * E2E から実 retry を走らせるには (a) Cloud Scheduler 発行済 OIDC 署名鍵、
 * (b) Google Calendar API モック用の production-code 側テスト double 差し込み口が
 * 両方必要になり、本リポジトリでは意図的に E2E に導入していない
 * (`E2E_RUNTIME` は cron 認可を bypass しない契約: `.claude/rules/security-auth.md`)。
 *
 * ## Placement
 *
 * chromium project (`e2e/public/`) の未認証 HTTP contract 群
 * (`calendar-api.spec.ts` / `cron-auth.smoke.spec.ts` と同型)。
 * cron-auth smoke は 5 endpoint の representative subset のみで、本 endpoint は
 * 明示 pin されていない — GCAL-RETRY-04 fix の regression gate として endpoint 固有の
 * 契約を broader E2E project 側で pin する。
 */

const CRON_ENDPOINT = "/api/cron/calendar-sync-retry";

test.describe("cron: /api/cron/calendar-sync-retry HTTP contract (E2E-05)", () => {
  test("endpoint が存在する (404 で消失していない)", async ({ request }) => {
    // authorizeCronRequest 未通過は 401 を返す。404 (route missing) だと
    // Cloud Scheduler の毎 15 分 hit が silent noop になり retry が全滅する。
    const response = await request.get(CRON_ENDPOINT);
    expect(response.status()).not.toBe(404);
  });

  test("認証ヘッダなしで 401", async ({ request }) => {
    const response = await request.get(CRON_ENDPOINT);
    expect(response.status()).toBe(401);
  });

  test("不正な Bearer token で 401", async ({ request }) => {
    const response = await request.get(CRON_ENDPOINT, {
      headers: { authorization: "Bearer invalid-token-e2e-05" },
    });
    expect(response.status()).toBe(401);
  });

  test('"Bearer " prefix 欠落で 401', async ({ request }) => {
    const response = await request.get(CRON_ENDPOINT, {
      headers: { authorization: "invalid-token-without-prefix" },
    });
    expect(response.status()).toBe(401);
  });

  test("/api/cron/* の rate-limit 除外契約が calendar-sync-retry にも適用される", async ({
    request,
  }) => {
    // Cloud Scheduler は本 endpoint を 15 分毎に hit する。apiRateLimiter の
    // budget (100 req/min/IP、`shared/lib/rate-limit.ts` の maxRequests: 100) を
    // 明確に超える 110 req を送っても全て 401 で通ることを確認する。exemption
    // (`proxy.ts` の `!pathname.startsWith("/api/cron")`) が壊れて 429 が混入すると
    // Cloud Scheduler の正常 hit も rate-limit で silent skip され、失敗した予約
    // 同期が積み上がる silent data-loss regression を招く (cron-auth smoke と同構造)。
    const REQUEST_COUNT = 110;
    const responses = await Promise.all(
      Array.from({ length: REQUEST_COUNT }, () => request.get(CRON_ENDPOINT)),
    );

    const statuses = responses.map((r) => r.status());
    expect(statuses.every((status) => status === 401)).toBe(true);
    expect(statuses.some((status) => status === 429)).toBe(false);
  });
});
