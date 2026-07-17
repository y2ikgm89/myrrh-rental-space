/**
 * Phase B.2 task 27 / Phase B.2.1 Task 3 / Task B: admin 繰返し予約
 * (ReservationSeries) の form UI 表示と /admin/reservations/new からの導線 smoke +
 * seed 済 series fixture への reference。
 *
 * 現在の実装状況:
 *   - Task 20 form UI 統合 (/admin/reservations/new-recurring route +
 *     RecurringReservationForm) ✅ Phase B.2.1 Task 1
 *   - Task 21 server action (createRecurringReservationAction) ✅
 *   - Task 22 calendar view 「定期」バッジ ✅
 *   - Task 23 admin SeriesInfoSection ✅
 *   - Task 26 customer mypage SeriesInfoSection ✅
 *   - Task B: seed 済 series fixture (`seedRecurringReservationSeriesFixture`) +
 *     `seriesFixtures` 定数 (e2e/fixtures/test-data.ts) ✅ 本 PR で確定
 */

import { test, expect } from "@playwright/test";
import { seriesFixtures } from "../../fixtures/test-data";

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

  test.fixme("DB-seeded series の SeriesInfoSection + 3 択キャンセルフロー (Turnstile bypass 実装後に有効化)", async ({
    page,
  }) => {
    // Phase B.2.1 Task B: seed fixture + 定数は本 PR で確定済み。
    //   - `prisma/seed.ts::seedRecurringReservationSeriesFixture` が WEEKLY BYDAY=TU
    //     COUNT=3 の series (dtstart=2027-05-04T14:00:00Z) を dev customer + 既存
    //     space に seed する (idempotent、marker: seriesFixtures.markerNotesPrefix)。
    //   - 3 instance すべて CONFIRMED / UNPAID / notes に marker prefix。
    //
    // future PR で有効化する手順:
    //   1. e2e/helpers に adminReservationInstanceLookup(marker) を追加
    //      (admin API GET /admin/api/reservations?search=... 経由で instance id 取得、
    //      seed 済 3 instance の startTime 昇順 first を返す)
    //   2. page.goto(`/admin/reservations/${instanceId}`) → SeriesInfoSection の
    //      "定期予約情報" heading と 3 択キャンセル button visible を assert
    //   3. "定期予約すべてキャンセル" → confirm dialog → cancelReservationSeriesAction
    //      発火 (Turnstile bypass が必要な場合は E2E_RUNTIME env で validateTurnstile を
    //      short-circuit する。security-auth rule に従い localhost 限定 AND 条件を維持)
    //   4. reload → series の deletedAt が set され SeriesInfoSection が
    //      "既にキャンセル済" 文言に変わる
    //   5. seed idempotency のため、他 test の後続実行では seed が「skip existing」
    //      で通り fresh instance が復活しないことを確認 (SERIAL 実行推奨、
    //      またはこの test 専用の re-seed helper を用意)
    //
    // 現状: 本 PR は seed + fixture 定数 SSoT 化のみ。上記 spec の実装は Turnstile
    // bypass の localhost 契約整備 (security-auth rule) と共に別 PR で追加する。
    void page;
    void seriesFixtures;
  });
});
