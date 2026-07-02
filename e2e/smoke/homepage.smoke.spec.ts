import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Smoke: ホームページ
 *
 * 目的: 公開 root URL の基本到達性検証（< 30 秒）。
 * critical path: SSR / RSC 描画失敗で 500 / 白画面の即時検知。
 * 拡張テストは `e2e/public/homepage.spec.ts` 側で網羅、本 file はゲートのみ。
 */

test.describe("smoke: homepage", () => {
  test("ホームページが 200 OK で描画される", async ({ page }) => {
    const response = await page.goto(urls.home);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
  });

  test("ヘッダー + フッターが描画される", async ({ page }) => {
    await page.goto(urls.home);

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("メタタイトルが設定されている", async ({ page }) => {
    await page.goto(urls.home);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
