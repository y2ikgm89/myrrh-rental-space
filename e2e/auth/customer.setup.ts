import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { urls } from "../fixtures";

/**
 * 顧客（customer）認証セットアップ
 *
 * Playwright 公式パターン（storage state + setup project）。
 * dev login button を 1 度だけクリックし、認証済み storage state を
 * `playwright/.auth/customer.json` に永続化する。後続の認証必須
 * project（chromium-customer 等）が `storageState` で再利用する。
 *
 * 参照: https://playwright.dev/docs/auth
 *
 * 前提:
 * - dev サーバーが動作中（NODE_ENV !== "production"）
 * - `/login` ページに `<DevLoginButton>`「テスト顧客でログイン」が
 *   表示されている（`src/app/(public)/login/_components/dev-login-button.tsx`）
 * - dev customer (`dev-customer@example.com`) は初回クリック時に
 *   自動作成される（`devLoginAction`）
 */

const customerAuthFile = path.join(
  __dirname,
  "..",
  "..",
  "playwright",
  ".auth",
  "customer.json",
);

setup("authenticate as customer", async ({ page }) => {
  await page.goto(urls.customerLogin);
  await page.waitForLoadState("networkidle");

  // dev login button をクリック
  const devLoginButton = page.getByRole("button", {
    name: /テスト顧客でログイン/i,
  });
  await expect(devLoginButton).toBeVisible();
  await devLoginButton.click();

  // `expect(page).toHaveURL` polling は App Router の soft / hard navigation
  // 両方で動作する canonical pattern（→ `test-quality/e2e.md` §App Router Gotchas）。
  await expect(page).toHaveURL(/\/mypage(\?|$|\/)/, { timeout: 15000 });

  // session cookie が確定したことを確認
  await expect(page.locator("main")).toBeVisible();

  // storage state を保存
  await page.context().storageState({ path: customerAuthFile });
});
