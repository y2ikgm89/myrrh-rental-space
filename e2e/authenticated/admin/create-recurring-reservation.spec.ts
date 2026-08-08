/**
 * Phase B.2 task 27 / Phase B.2.1 Task 3/B (final): admin 繰返し予約
 * (ReservationSeries) の form UI 表示 + `/admin/reservations/new` 導線 smoke +
 * 専有 series の SeriesInfoSection + 3 択キャンセル full flow。
 *
 * 現在の実装状況:
 *   - Task 20 form UI (/admin/reservations/new-recurring) ✅ Task 1
 *   - Task 21 server action (createRecurringReservationAction) ✅
 *   - Task 22 calendar view 「定期」バッジ ✅
 *   - Task 23 admin SeriesInfoSection ✅
 *   - Task 26 customer mypage SeriesInfoSection ✅
 *   - Turnstile localhost bypass (`isLocalProductionE2ERuntime`) ✅
 *
 * ## fixture の所有権
 *
 * series-all キャンセルは fixture を**破壊的に消費する**ため、共有 seed 行では
 * retry も再実行もできない（初回失敗が必ず永続失敗に化ける）。
 * `e2e/helpers/reservation-series-fixture.ts` が seed 済みの**専有スペース**
 * （`spaceFixtures.recurringSeriesSpaceSlug`）を purge → 再作成する。
 * スペース自体は seed が 1 つだけ用意するので行数は有界で、専有なので
 * EXCLUDE 制約でも他 spec と衝突しない。
 */

import { test, expect } from "../../fixtures/e2e-test";
import { spaceFixtures } from "../../fixtures/test-data";
import { visibleByText } from "../../helpers/streaming-safe-locators";
import { isReservationSeriesCancelled } from "../../helpers/reservation-series-db";
import { createReservationSeriesFixture } from "../../helpers/reservation-series-fixture";

/** RRULE（WEEKLY BYDAY=TU COUNT=3）。UI の「毎週火曜 / 全 3 回」表示に対応する。 */
const RRULE = "FREQ=WEEKLY;BYDAY=TU;COUNT=3";

/** 1 instance の予約時間（分）。 */
const DURATION_MINUTES = 120;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** dtstart（固定 UTC、2027-05-04 は火曜）。E2E_FIXED_NOW_ISO より十分未来。 */
const DTSTART = new Date("2027-05-04T14:00:00.000Z");

const START_TIMES = [0, 1, 2].map(
  (index) => new Date(DTSTART.getTime() + index * WEEK_MS),
);

const HOURLY_PRICE = 3000;
const TAX_RATE = 10;

test.describe("admin recurring reservation form (Phase B.2.1 Task 3)", () => {
  test("form が表示され、繰返し設定 fields が render される (smoke)", async ({
    page,
  }) => {
    await page.goto("/admin/reservations/new-recurring");

    // ヘッダ
    await expect(
      page.getByRole("heading", { name: "繰返し予約作成" }),
    ).toBeVisible();

    // 予約基本情報 card の主要 field label
    await expect(page.getByText("スペース *")).toBeVisible();
    await expect(page.getByText("初回開催日 *")).toBeVisible();
    await expect(page.getByText("開始時間 *")).toBeVisible();
    await expect(page.getByText("終了時間 *")).toBeVisible();

    // 繰返し設定 card の主要 field
    await expect(
      page.getByRole("heading", { name: "繰返し設定" }),
    ).toBeVisible();
    await expect(page.getByText("繰返し周期")).toBeVisible();
    await expect(page.getByText("終了条件")).toBeVisible();

    // Submit button
    await expect(
      page.getByRole("button", { name: "繰返し予約を作成" }),
    ).toBeVisible();
  });

  test("既存 /admin/reservations/new に「繰返し予約を作成する」導線 link がある", async ({
    page,
  }) => {
    await page.goto("/admin/reservations/new");

    const link = page.getByRole("link", { name: "繰返し予約を作成する" });
    await expect(link).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(/\/admin\/reservations\/new-recurring/u);
    await expect(
      page.getByRole("heading", { name: "繰返し予約作成" }),
    ).toBeVisible();
  });

  test("専有 series の SeriesInfoSection + 3 択キャンセル full flow", async ({
    page,
  }) => {
    // 専有スペースを purge して fresh な series（WEEKLY BYDAY=TU COUNT=3）を作る。
    const { seriesId, instanceIds } = await createReservationSeriesFixture({
      spaceSlug: spaceFixtures.recurringSeriesSpaceSlug,
      rrule: RRULE,
      startTimes: START_TIMES,
      durationMinutes: DURATION_MINUTES,
      totalPrice: HOURLY_PRICE * (DURATION_MINUTES / 60),
      taxRate: TAX_RATE,
      notePrefix: "[E2E] 定期予約 3 択キャンセル",
      payment: { kind: "UNPAID" },
    });
    const firstInstanceId = instanceIds[0];
    expect(
      firstInstanceId,
      "series の instance が作られていること",
    ).toBeDefined();

    await page.goto(`/admin/reservations/${firstInstanceId ?? ""}`);

    // SeriesInfoSection の heading と 3 択キャンセル button 3 種
    await expect(
      page.getByRole("heading", { name: "定期予約情報" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "この予約のみキャンセル" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "この予約以降を全てキャンセル" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "定期予約すべてをキャンセル" }),
    ).toBeVisible();

    // series-all scope で cancel 発火 (admin 経路、Turnstile 呼出なし、
    // executeAdminMutationResult 経由で cancelReservationSeriesCommand が実行される)
    await page
      .getByRole("button", { name: "定期予約すべてをキャンセル" })
      .click();

    // DB 側で series.deletedAt が set されるまで polling
    // (Server Action → applyBulkCancellationSideEffects → cache invalidate の完了待ち)
    await expect
      .poll(() => isReservationSeriesCancelled(seriesId), {
        timeout: 15_000,
        intervals: [500, 1000, 2000],
      })
      .toBe(true);

    // UI 側の cache が invalidate 済のため reload で cancelled 表示に切替。
    //
    // この `<p>` は role もアクセシブルネームも id も持たないため `getByText` は
    // React streaming の hidden staging copy にも一致し、strict-mode violation に
    // なる（CI run 30632351655 で `resolved to 2 elements`、うち 1 つは "hidden"）。
    // 表示中の 1 本だけを掴む。
    await expect(
      visibleByText(page, /この series は既にキャンセル済み/u),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "定期予約すべてをキャンセル" }),
    ).not.toBeVisible();
  });
});
