import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { signInAsAdmin } from "../helpers/admin-auth";

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
 * - Playwright helper が E2E 用 admin user を自動で upsert する
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
  await signInAsAdmin(page);
  await expect(page.getByRole("main")).toBeVisible();

  // storage state を保存
  await page.context().storageState({ path: adminAuthFile });
});
