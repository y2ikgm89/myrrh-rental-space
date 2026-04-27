import { expect, test } from "@playwright/test";
import { urls } from "../../fixtures";

test.describe("admin table row click navigation", () => {
  test("reservations 行クリックで詳細ページに遷移", async ({ page }) => {
    await page.goto(urls.adminReservations);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("予約管理");

    // 予約データが存在するか確認
    const tableRows = page.locator("tbody tr");
    const hasReservations = (await tableRows.count()) > 0;

    if (!hasReservations) {
      test.skip(true, "予約データが存在しません");
      return;
    }

    // ClickableTableRow は aria-label="... の予約を表示" が付く
    // CheckboxCell セルは stopRowClick なので index 1（日時セル）をクリック
    const firstRow = tableRows.first();
    const dateCell = firstRow.getByRole("cell").nth(1);
    await dateCell.click();

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(
      /\/admin\/reservations\/[0-9a-f-]{36}(\?.*)?$/,
    );
  });

  test("Enter キーで詳細ページに遷移", async ({ page }) => {
    await page.goto(urls.adminReservations);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("予約管理");

    // 予約データが存在するか確認
    const tableRows = page.locator("tbody tr");
    const hasReservations = (await tableRows.count()) > 0;

    if (!hasReservations) {
      test.skip(true, "予約データが存在しません");
      return;
    }

    // ClickableTableRow は tabIndex={0} なので直接 focus → Enter で遷移
    const firstRow = tableRows.first();
    await firstRow.focus();
    await page.keyboard.press("Enter");

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(
      /\/admin\/reservations\/[0-9a-f-]{36}(\?.*)?$/,
    );
  });
});
