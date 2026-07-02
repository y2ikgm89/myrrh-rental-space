import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Smoke: スペース一覧
 *
 * 目的: 一覧ページの `getPublicSpaces()` クエリ / Section 描画 / Container Queries の
 * silent regression を検出。スペース seed が 0 件でも fallback 描画されることを契約とする。
 */

test.describe("smoke: spaces", () => {
  test("スペース一覧が 200 OK で描画される", async ({ page }) => {
    const response = await page.goto(urls.spaces);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
  });
});
