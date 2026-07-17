/**
 * Phase B.2 task 27 / Phase B.2.1 Task 3/B (final): admin 繰返し予約
 * (ReservationSeries) の form UI 表示 + `/admin/reservations/new` 導線 smoke +
 * seed 済 series の SeriesInfoSection + 3 択キャンセル full flow。
 *
 * 現在の実装状況:
 *   - Task 20 form UI (/admin/reservations/new-recurring) ✅ Task 1
 *   - Task 21 server action (createRecurringReservationAction) ✅
 *   - Task 22 calendar view 「定期」バッジ ✅
 *   - Task 23 admin SeriesInfoSection ✅
 *   - Task 26 customer mypage SeriesInfoSection ✅
 *   - Task B seed fixture (`seedRecurringReservationSeriesFixture`) + 定数 SSoT ✅
 *   - Task B follow-up: Turnstile localhost bypass (`isLocalProductionE2ERuntime`) +
 *     `getSeededSeriesFirstInstanceId` / `getSeededSeriesId` /
 *     `isSeededSeriesCancelled` helper ✅ 本 spec で有効化
 */

import { test, expect } from "@playwright/test";
import { seriesFixtures } from "../../fixtures/test-data";
import {
  getSeededSeriesFirstInstanceId,
  getSeededSeriesId,
  isSeededSeriesCancelled,
} from "../../helpers/seeded-fixtures";

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

  test("seed 済 series の SeriesInfoSection + 3 択キャンセル full flow", async ({
    page,
  }) => {
    // Task B seed fixture (dev customer + WEEKLY BYDAY=TU COUNT=3) の instance ID を lookup
    const instanceId = await getSeededSeriesFirstInstanceId(
      seriesFixtures.markerNotesPrefix,
    );
    const seriesId = await getSeededSeriesId(seriesFixtures.markerNotesPrefix);

    await page.goto(`/admin/reservations/${instanceId}`);

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
      .poll(() => isSeededSeriesCancelled(seriesId), {
        timeout: 15_000,
        intervals: [500, 1000, 2000],
      })
      .toBe(true);

    // UI 側の cache が invalidate 済のため reload で cancelled 表示に切替
    await page.reload();
    await expect(
      page.getByText(/この series は既にキャンセル済み/u),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "定期予約すべてをキャンセル" }),
    ).not.toBeVisible();
  });
});
