import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { signInAsAdmin } from "../helpers/admin-auth";

/**
 * 管理者（admin）IAP ローカル認証セットアップ
 *
 * 本番の管理入口は Google Cloud IAP が認証を担当する。
 * ローカル / CI では `ADMIN_TEST_IAP_EMAIL` を app server に渡し、
 * 同じ email のスタッフ user を upsert して `/admin` を開く。
 *
 * Playwright project 互換のため storage state は保存するが、管理画面に
 * app session cookie は存在しない。
 *
 * 参照: https://playwright.dev/docs/auth
 *
 * 前提:
 * - dev サーバーが動作中
 * - app server に `ADMIN_TEST_IAP_EMAIL=testUsers.admin.email` が設定済み
 * - Playwright helper が E2E 用 staff user を自動で upsert する
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
