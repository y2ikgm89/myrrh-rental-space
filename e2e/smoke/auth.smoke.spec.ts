import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";
import { ensureAdminUser } from "../helpers/ensure-admin-user";

/**
 * Smoke: 認証ページ到達性
 *
 * 目的: 公開ログイン (/login) + 管理入口 (/admin) の surface policy。
 * Better Auth dual-instance / proxy.ts のいずれかの破壊で
 * 即時に 4xx / 5xx / redirect loop を検出する。
 * 拡張テストは `e2e/auth.spec.ts` / `e2e/public/customer-auth.spec.ts` 側で網羅。
 */

const appSurface = process.env["APP_SURFACE"] ?? "admin";

function emailTextbox(page: Page) {
  return page.getByRole("textbox", { name: "メールアドレス" });
}

test.describe("smoke: auth pages", () => {
  test("公開サインインページが描画される", async ({ page }) => {
    const response = await page.goto(urls.customerLogin);
    expect(response?.status()).toBe(200);

    await expect(page.locator("main").first()).toBeVisible();
  });

  test("管理入口が surface policy 通りに処理される", async ({ page }) => {
    if (appSurface === "admin") {
      await ensureAdminUser();
    }

    const response = await page.goto(urls.adminDashboard);

    if (appSurface === "public") {
      expect(response?.status()).toBe(404);
      await expect(emailTextbox(page)).toBeHidden();
      return;
    }

    await expect(page).toHaveURL(urls.adminDashboard);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(emailTextbox(page)).toBeHidden();
  });
});
