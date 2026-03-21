/**
 * 管理ダッシュボードのシェル（サイドバー + メイン）が表示されるクリティカルパス。
 * 認証は fixtures の管理者ユーザーで行う。
 */

import { test, expect } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

test.describe("Admin dashboard shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.login);
    await page.fill('input[type="email"]', testUsers.admin.email);
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL(urls.adminDashboard, { timeout: 15000 });
  });

  test("main landmark とナビが表示される", async ({ page }) => {
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
});
