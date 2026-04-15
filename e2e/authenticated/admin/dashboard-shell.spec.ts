/**
 * 管理ダッシュボードのシェル（サイドバー + メイン）が表示されるクリティカルパス。
 * 認証は chromium-admin project の storageState で処理。
 */

import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

test.describe("Admin dashboard shell", () => {
  test("main landmark とナビが表示される", async ({ page }) => {
    await page.goto(urls.adminDashboard);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
});
