/**
 * E2E-01: admin series bulk-cancel が per-instance refund policy を貫くこと。
 *
 * ## 目的
 *
 * PR #1179 (PERF-02-FIX) が修正した regression 対称の end-to-end gate。
 *
 * 元 bug (audit 2026-07-18):
 *   bulk cancel は per-instance の `Settings.findUnique` N+1 を避けるため冒頭で
 *   `refundPolicySnapshot` を hoist し per-instance に渡すが、当時の実装は snapshot
 *   変数を `null` で初期化していた。Settings 取得が例外を投げた場合 catch を抜けた
 *   snapshot は `null` のまま per-instance に降り、受け手側の gate
 *   (`input.refundPolicySnapshot !== undefined`) を通過して「policy 未設定 =
 *   残額全額返金」動作に fallback → 各 instance に対して totalPrice 全額の Stripe
 *   refund が silent に走る (52 週 series × 10,000 円で最大 520,000 円の意図せぬ
 *   全額返金)。修正は `null` → `undefined` の初期化差替え + conditional spread。
 *
 * ## 本 spec が観測できること
 *
 * - 3 CONFIRMED PAID reservation を持つ ReservationSeries を admin UI 経由で
 *   series-all bulk cancel し、全 instance が CANCELLED に遷移すること
 * - ReservationSeries.deletedAt が set され series 単位 AuditLog
 *   (resource="reservation_series", newValue.scope="series-all") が書かれること
 * - per-instance AuditLog (resource="reservation") が全 instance に対して書かれ、
 *   metadata に wasPaid=true, requiresRefund=true, sideEffects.refund の outcome
 *   構造が含まれること (= refund step が skip されず invoke されたこと)
 *
 * これにより「fireAndForget chain が破れて refund が発火しない」「per-instance
 * AuditLog が emit されない」「bulk cancel が UI から起動しない」といった broad
 * pipeline 破壊は本 spec で捕捉できる。
 *
 * ## 本 spec が観測できないこと (unit test に分担)
 *
 * per-instance の refund AMOUNT (¥2,500 vs ¥5,000) の直接検証は本 E2E では
 * 行わない。理由:
 *
 *   - E2E 環境の Stripe 認証情報は **偽物**（`scripts/e2e/setup-stripe-webhook-fixture.ts`
 *     が webServer chain で `SettingsStripe` に書く）。`assertOnlinePaymentAvailable` は
 *     通るので `refundReservationPaymentCommand` は**実際に Stripe を叩き**、偽鍵の
 *     ぶん失敗する。runRefundStep は `{ status: "error", reason: ... }` を返す。
 *     以前この JSDoc は「認証情報が未設定」と書いていたが、#1828 で fixture を
 *     webServer chain へ移した時点でその前提は失効している。実際に外向き呼び出しが
 *     走る点が重要で、egress の無い runner では `STRIPE_REQUEST_TIMEOUT_MS`
 *     （`src/shared/lib/stripe.ts`、20 秒）が唯一の上限になる。
 *   - refund outcome の `detail.refundAmount` は success 時のみ AuditLog に載る
 *     product 契約 (`cancellation-side-effects.ts` の `runRefundStep`)、error 時は
 *     amount 情報が観測不能。
 *   - Stripe SDK を E2E で mock/stub する既存基盤は本 repo に存在せず、そのためだけの
 *     追加 infra は out of scope。
 *
 * refundAmount の per-tier 検証は unit test で covered:
 *   `__tests__/unit/domain/reservations/bulk-side-effects.test.ts` が PERF-02-FIX の
 *   snapshot=null vs undefined 挙動を直接 assert (Settings.findUnique を facade level
 *   で mock → snapshot が per-instance に届かないケースが amount fallback を招くこと
 *   を対称的に固定)。両 test の分担で bug の全境界を覆う。
 *
 * ## fixture 契約
 *
 * `e2e/helpers/refund-policy-bulk-cancel-fixture.ts` が完結して owns:
 *   - Settings.refundPolicy を { tiers[168h → 50%], defaultRefundRate: 100 } に mutate
 *   - dev customer + coworking-space に 3 CONFIRMED PAID reservations を seed
 *   - afterAll で fixture + Settings を restore
 *
 * Settings singleton を mutate するため `test.describe.serial` で他 spec との
 * 並列干渉を隔離する (rules `testing-e2e.md` §並列化)。
 *
 * @see PR #1179 / PR #1201 (PERF-02-FIX)
 * @see docs/audits/2026-07-18-mypage-implementation-audit.md
 */

import { test, expect } from "../../fixtures/e2e-test";

/**
 * 3 インスタンス分の返金が**直列に**実際の Stripe 呼び出しを行う。
 *
 * 偽の認証情報でも SDK は api.stripe.com へ出るので、egress の無い runner では
 * 1 回あたり `STRIPE_REQUEST_TIMEOUT_MS`（`src/shared/lib/stripe.ts`、20 秒）まで
 * 待つ。以前の 20 秒予算は「認証情報が無いので即 throw する」前提のもので、
 * その前提は #1828 で失効した。3 × 20 秒に、監査ログ書き込み
 * （`fireAndForget` → `after()`）の余裕を足す。
 */
const REFUND_PIPELINE_TIMEOUT_MS = 3 * 20_000 + 15_000;

/**
 * この test の予算。
 *
 * 上の poll は **直列に 2 回**走る（series の soft-delete → per-instance の監査ログ）。
 * 予算を 1 回分から導くと、1 つ目が長引いたときに 2 つ目が自分の timeout に到達する
 * 前に test ごと落ちる。両方が上限まで使う最悪ケースを覆う必要がある。
 * `POLL_COUNT` は下の `expect.poll` の数と一致させること。
 */
const POLL_COUNT = 2;
const NAVIGATION_AND_ASSERTION_BUDGET_MS = 30_000;
const TEST_TIMEOUT_MS =
  POLL_COUNT * REFUND_PIPELINE_TIMEOUT_MS + NAVIGATION_AND_ASSERTION_BUDGET_MS;
import {
  findSeriesCancellationAudit,
  getPerInstanceCancellationAudits,
  getReservationStatuses,
  isSeriesSoftDeleted,
  setupRefundPolicyBulkCancelFixture,
  teardownRefundPolicyBulkCancelFixture,
  type RefundPolicyBulkCancelFixture,
} from "../../helpers/refund-policy-bulk-cancel-fixture";

test.describe
  .serial("admin series bulk-cancel enforces per-instance refund policy (E2E-01)", () => {
  // Playwright 既定の test timeout は 30 秒で、上の poll 予算より短い。
  // **数値を手書きしない** — 予算を変えたときに片方だけ動くのを防ぐため定数から導く。
  test.describe.configure({ timeout: TEST_TIMEOUT_MS });

  let fixture: RefundPolicyBulkCancelFixture;

  test.beforeAll(async () => {
    fixture = await setupRefundPolicyBulkCancelFixture();
  });

  test.afterAll(async () => {
    if (fixture) {
      await teardownRefundPolicyBulkCancelFixture(fixture);
    }
  });

  test("series-all bulk cancel が全 instance を CANCELLED + AuditLog を per-instance に emit する", async ({
    page,
  }) => {
    const [firstInstanceId] = fixture.instanceIds;
    expect(firstInstanceId).toBeDefined();

    await page.goto(`/admin/reservations/${firstInstanceId ?? ""}`);

    // SeriesInfoSection が render されていること (fixture の series 情報を表示)
    await expect(
      page.getByRole("heading", { name: "定期予約情報" }),
    ).toBeVisible();
    const bulkCancelButton = page.getByRole("button", {
      name: "定期予約すべてをキャンセル",
    });
    await expect(bulkCancelButton).toBeVisible();

    // series-all scope の bulk cancel を発火
    await bulkCancelButton.click();

    // Server Action → cancelReservationSeriesCommand → applyBulkCancellation
    // (DB claim, tx 内) → applyBulkCancellationSideEffects (tx 外・per-instance
    // fireAndForget) の chain が全部走るまで poll。series.deletedAt を最終
    // 到達点として観測する (side-effects で書かれる per-instance AuditLog より
    // 前段の DB claim で確定するので、まず series 側で pipeline 起動を確認)。
    await expect
      .poll(() => isSeriesSoftDeleted(fixture.seriesId), {
        timeout: REFUND_PIPELINE_TIMEOUT_MS,
        intervals: [500, 1000, 2000],
      })
      .toBe(true);

    // 全 3 instance が CANCELLED に遷移していること (applyBulkCancellation の
    // DB claim 済み確認)
    const statuses = await getReservationStatuses(fixture.instanceIds);
    for (const id of fixture.instanceIds) {
      expect(statuses[id], `instance ${id} status`).toBe("CANCELLED");
    }

    // series 単位 AuditLog: applyBulkCancellationSideEffects Step 4 が
    // resource="reservation_series", newValue.scope="series-all", cancelledIds を
    // 記録することを確認
    const seriesAudit = await findSeriesCancellationAudit(fixture.seriesId);
    expect(
      seriesAudit,
      "series-level AuditLog (resource=reservation_series) が書かれていること",
    ).not.toBeNull();
    expect(seriesAudit?.scope).toBe("series-all");
    expect(seriesAudit?.cancelledIdsCount).toBe(fixture.instanceIds.length);

    // per-instance AuditLog: applyBulkCancellationSideEffects Step 1 が
    // fireAndForget で `after()` 経由に流すため、書き込み完了まで poll する
    // (Next.js 16 の after() は response 送出後に実行される)。
    await expect
      .poll(
        async () => {
          const audits = await getPerInstanceCancellationAudits(
            fixture.instanceIds,
          );
          return audits.length;
        },
        {
          timeout: REFUND_PIPELINE_TIMEOUT_MS,
          intervals: [500, 1000, 2000],
        },
      )
      .toBe(fixture.instanceIds.length);

    const audits = await getPerInstanceCancellationAudits(fixture.instanceIds);
    const auditByInstance = new Map(
      audits.map((a) => [a.resourceId, a] as const),
    );
    for (const id of fixture.instanceIds) {
      const audit = auditByInstance.get(id);
      expect(audit, `instance ${id} per-instance AuditLog`).toBeDefined();
      // PAID + stripePaymentIntentId 済のため wasPaid=true, requiresRefund=true が
      // 記録されているはず。これが false になっている場合、bulk cancel が
      // PAID reservation を UNPAID として扱ってしまう regression (money-touching
      // path の完全 skip)。
      expect(
        audit?.wasPaid,
        `instance ${id} metadata.wasPaid=true が記録されること`,
      ).toBe(true);
      expect(
        audit?.requiresRefund,
        `instance ${id} metadata.requiresRefund=true が記録されること`,
      ).toBe(true);
      // sideEffects.refund の outcome が存在すること (= refund step が invoke されて
      // outcome capture が走ったこと)。E2E の Stripe 認証情報は偽物なので status は
      // "error" になるが、**status の値は assert しない** — outcome 構造自体が
      // 存在すれば "pipeline は貫通した" と判定できる (spec ヘッダ参照)。
      expect(
        audit?.hasRefundOutcome,
        `instance ${id} sideEffects.refund outcome が記録されること`,
      ).toBe(true);
      expect(
        audit?.refundOutcomeStatus,
        `instance ${id} sideEffects.refund.status`,
      ).not.toBeNull();
    }
  });
});
