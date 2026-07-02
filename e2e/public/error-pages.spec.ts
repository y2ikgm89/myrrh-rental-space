import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - エラーページ E2E
 *
 * テストシナリオ:
 * 1. 存在しない URL で not-found.tsx が表示される
 * 2. not-found ページに公開レイアウト（header/footer）が保持される
 * 3. 404 ページにホームリンクが存在する
 * 4. スペース詳細の存在しない slug で not-found UI が表示される
 * 5. noindex メタタグが設定されている（404 ページ）
 *
 * Next.js App Router の not-found は streamed response では 200 を返し得るため、
 * HTTP status ではなく UI と robots metadata を contract として検証する。
 *
 * 注意: 500 エラーの意図的トリガーは困難なため対象外。
 *       `global-error.tsx` の挙動は unit テストで担保。
 */

test.describe("エラーページ - 404 Not Found", () => {
  test("存在しない URL で 404 ページが表示される", async ({ page }) => {
    await page.goto("/definitely-does-not-exist-404-page-test");

    await expect(
      page.getByRole("heading", { name: "ページが見つかりません", level: 1 }),
    ).toBeVisible();
  });

  test("404 ページに公開レイアウトが保持される", async ({ page }) => {
    await page.goto("/nonexistent-path-layout-test");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("404 ページにホームへの復帰リンクが存在する", async ({ page }) => {
    await page.goto("/another-404-path");

    await expect(
      page.getByRole("link", { name: "ホームに戻る" }),
    ).toBeVisible();
  });

  test("スペース詳細の存在しない slug で not-found UI が表示される", async ({
    page,
  }) => {
    await page.goto(
      `${urls.spaces}/this-slug-definitely-does-not-exist-abc-xyz`,
    );

    await expect(
      page.getByRole("heading", { name: "ページが見つかりません", level: 1 }),
    ).toBeVisible();
  });

  test("404 ページに noindex メタタグが設定されている（クロール除外）", async ({
    page,
  }) => {
    await page.goto("/404-for-robots-check");

    await expect
      .poll(() =>
        page.locator('meta[name="robots"][content*="noindex"]').count(),
      )
      .toBeGreaterThan(0);
  });
});
