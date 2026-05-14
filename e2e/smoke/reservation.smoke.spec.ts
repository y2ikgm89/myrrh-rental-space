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
  test("予約ページが 200 OK で描画される", async ({ page }) => {
    const response = await page.goto(urls.reservation);
    expect(response?.status()).toBe(200);

    // section schema parse / `requireFeatureEnabled("reservation")` / `getPageSectionsWithFallback`
    // のいずれかが broken した際は <main> 自体が render されないため、main visible でゲートする。
    // 具体的な heading テキストは DB section config (`reservation-form` 等) に依存するため
    // smoke では assert しない（広域 E2E が機能カバー）。
    await expect(page.locator("main").first()).toBeVisible();
  });
});
