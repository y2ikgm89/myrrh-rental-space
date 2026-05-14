import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Smoke: 認証ページ到達性
 *
 * 目的: 公開ログイン (/login) + 管理ログイン (/admin/login) の描画ゲート。
 * Better Auth dual-instance / Admin Gate / proxy.ts のいずれかの破壊で
 * 即時に 4xx / 5xx / redirect loop を検出する。
 * 拡張テストは `e2e/auth.spec.ts` / `e2e/public/customer-auth.spec.ts` 側で網羅。
 */

test.describe("smoke: auth pages", () => {
  test("公開サインインページが描画される", async ({ page }) => {
    const response = await page.goto(urls.customerLogin);
    expect(response?.status()).toBe(200);

    await expect(page.locator("main").first()).toBeVisible();
  });

  test("管理ログインゲートが 404 / 200 のいずれかで応答する", async ({
    page,
  }) => {
    const response = await page.goto(urls.login);
    const status = response?.status() ?? 0;
    // Admin Gate cookie 未保有時は 404、E2E 時は 200。両者とも broken/500 ではないことを契約とする。
    expect([200, 404]).toContain(status);
  });
});
