import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { urls, testUsers } from "../fixtures";

/**
 * 管理者（admin）認証セットアップ
 *
 * Playwright 公式パターン（storage state + setup project）。
 * 1 度だけ管理者ログインを実行し、認証済み storage state を
 * `playwright/.auth/admin.json` に永続化する。後続の認証必須
 * project（chromium-admin 等）が `storageState` で再利用する。
 *
 * 参照: https://playwright.dev/docs/auth
 *
 * 前提:
 * - dev サーバーが動作中
 * - seed で admin user が作成済み（`bun prisma/seed.ts --admin`）
 * - `testUsers.admin.email` / "admin123" でログイン可能
 */

const adminAuthFile = path.join(
  __dirname,
  "..",
  "..",
  "playwright",
  ".auth",
  "admin.json",
);

setup("authenticate as admin", async ({ page }) => {
  await page.goto(urls.login);
  await page.waitForLoadState("networkidle");

  // ログインフォーム
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');

  // ダッシュボードへの遷移を待つ
  await page.waitForURL(urls.adminDashboard, { timeout: 15000 });

  // session cookie が確定したことを確認
  await expect(page.locator("main, h1")).toBeVisible();

  // storage state を保存
  await page.context().storageState({ path: adminAuthFile });
});
