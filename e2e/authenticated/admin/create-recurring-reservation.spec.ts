/**
 * Phase B.2 task 27 / Phase B.2.1 Task 3: admin 繰返し予約
 * (ReservationSeries) の form UI 表示と /admin/reservations/new からの導線 smoke。
 *
 * 現在の実装状況:
 *   - Task 20 form UI 統合 (/admin/reservations/new-recurring route +
 *     RecurringReservationForm) ✅ Phase B.2.1 Task 1 で完了
 *   - Task 21 server action (createRecurringReservationAction) ✅
 *   - Task 22 calendar view 「定期」バッジ ✅
 *   - Task 23 admin SeriesInfoSection ✅
 *   - Task 26 customer mypage SeriesInfoSection ✅
 *
 * 本 spec は form UI と link 導線が実装されていることを smoke レベルで検証する
 * (fixme 解除)。full end-to-end (form 送信 → 実 DB 書込 → calendar 定期バッジ →
 * SeriesInfoSection 3 択 → cancel) は fixture (space + customer seed) と
 * customer 検索 API mock が揃ってから追加する future work。
 */

import { test, expect } from "@playwright/test";

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

  test.fixme("DB-seeded series の SeriesInfoSection + 3 択キャンセルフロー (future work)", async ({
    page,
  }) => {
    // TODO (future PR): prisma/seed.ts + e2e/fixtures/test-data.ts に
    //   ReservationSeries fixture を追加し、以下を検証する mini golden path:
    //   1. admin としてログイン
    //   2. /admin/reservations/[instanceId] へ navigate
    //   3. SeriesInfoSection が visible、3 択 button (this-only /
    //      this-and-following / series-all) が表示される
    //   4. "定期予約すべてをキャンセル" を click → confirm
    //   5. success message + reload で series が cancelled 表示になる
    //
    // 本 phase では form UI wiring (Task 20) と form-driven action (Task 21)
    // が完成しているため、実際は "form submit → 全 instance CANCELLED" の
    // full E2E も書ける。ただし customer 検索 API は fetchAdminJson 経由で
    // seed 依存が濃く、API mock を e2e/helpers/ に切り出す必要がある。
    void page;
  });
});
