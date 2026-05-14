import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Smoke: 予約ページ
 *
 * 目的: 予約 wizard ルートの初期描画 (`getSpaceById` / Section schema parse / Turnstile widget)
 * のいずれかが broken した際の即時検出。スペース未選択状態（`?spaceId=` 無し）の guidance UI が
 * 表示されることをゲートとする。
 */

test.describe("smoke: reservation entry", () => {
  test("予約ページがスペース未選択 guidance を描画する", async ({ page }) => {
    const response = await page.goto(urls.reservation);
    expect(response?.status()).toBe(200);

    await expect(page.locator("main").first()).toBeVisible();
    // 「予約するスペースを選択してください」または同等の guidance heading
    await expect(
      page.getByRole("heading", { name: /スペースを選択/i }),
    ).toBeVisible();
  });
});
