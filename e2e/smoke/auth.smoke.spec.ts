import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Smoke: 認証ページ到達性
 *
 * 目的: 公開ログイン (/login) + 管理ログイン (/admin/login) の surface policy。
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

  test("管理ログインページが surface policy 通りに処理される", async ({
    page,
  }) => {
    const response = await page.goto(urls.login);

    if (appSurface === "public") {
      expect(response?.status()).toBe(404);
      await expect(emailTextbox(page)).toBeHidden();
      return;
    }

    expect(response?.status()).toBe(200);
    await expect(emailTextbox(page)).toBeVisible();
  });
});
