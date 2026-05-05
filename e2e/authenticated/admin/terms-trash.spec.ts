import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - 利用規約ゴミ箱 E2E テスト
 *
 * テストシナリオ:
 * 1. /admin/terms にゴミ箱リンクが存在する
 * 2. /admin/terms/trash ページが表示される
 * 3. ゴミ箱が空の場合に「ゴミ箱は空です」が表示される
 * 4. 復元ボタン・完全削除ボタンが表示される（削除済みアイテムある場合）
 */

test.describe("利用規約ゴミ箱 - 導線", () => {
  test("一覧ページからゴミ箱へのリンクが存在する", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const trashLink = page.locator(`a[href="${urls.adminTermsTrash}"]`);
    await expect(trashLink.first()).toBeVisible();
  });
});

test.describe("利用規約ゴミ箱 - 一覧ページ", () => {
  test("ゴミ箱ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminTermsTrash);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText(/ゴミ箱/);
  });

  test("一覧に戻るボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminTermsTrash);
    await page.waitForLoadState("networkidle");

    const backLink = page.locator(`a[href="${urls.adminTerms}"]`);
    await expect(backLink.first()).toBeVisible();
  });

  test("空状態または削除済みリストが表示される", async ({ page }) => {
    await page.goto(urls.adminTermsTrash);
    await page.waitForLoadState("networkidle");

    const emptyState = page.locator("text=ゴミ箱は空です");
    const table = page.locator("table");

    const hasEmpty = (await emptyState.count()) > 0;
    const hasTable = (await table.count()) > 0;
    expect(hasEmpty || hasTable).toBe(true);
  });

  test("削除済みアイテムがある場合、復元ボタンが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminTermsTrash);
    await page.waitForLoadState("networkidle");

    const restoreButton = page.locator('button[aria-label*="復元"]');
    if ((await restoreButton.count()) === 0) {
      test.skip(true, "削除済み規約が存在しません");
      return;
    }

    await expect(restoreButton.first()).toBeVisible();
  });

  test("削除済みアイテムがある場合、完全削除ボタンが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminTermsTrash);
    await page.waitForLoadState("networkidle");

    const hardDeleteButton = page.locator('button[aria-label*="完全に削除"]');
    if ((await hardDeleteButton.count()) === 0) {
      test.skip(true, "削除済み規約が存在しません");
      return;
    }

    await expect(hardDeleteButton.first()).toBeVisible();
  });
});
