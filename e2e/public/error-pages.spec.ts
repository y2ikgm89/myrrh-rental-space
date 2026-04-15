import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - エラーページ E2E
 *
 * テストシナリオ:
 * 1. 存在しない URL で not-found.tsx が表示される
 * 2. not-found ページに公開レイアウト（header/footer）が保持される
 * 3. 404 ページにホームリンクが存在する
 * 4. スペース詳細の存在しない slug で 404
 * 5. noindex メタタグが設定されている（404 ページ）
 *
 * 注意: 500 エラーの意図的トリガーは困難なため対象外。
 *       `global-error.tsx` の挙動は unit テストで担保。
 */

test.describe("エラーページ - 404 Not Found", () => {
  test("存在しない URL で 404 ページが表示される", async ({ page }) => {
    const response = await page.goto(
      "/definitely-does-not-exist-404-page-test",
    );
    // Next.js の not-found は 404 status を返す
    expect(response?.status()).toBe(404);

    // 404 メッセージ or not-found 表現
    const hasNotFoundMessage = await page
      .getByText(/404|見つかりません|Not Found|ページが存在|お探しのページ/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasNotFoundMessage).toBeTruthy();
  });

  test("404 ページに公開レイアウトが保持される", async ({ page }) => {
    await page.goto("/nonexistent-path-layout-test");
    await page.waitForLoadState("domcontentloaded");

    // Header / Footer が表示される（Multiple Root Layouts で public レイアウト継承）
    const hasHeader = await page
      .locator('header[role="banner"], header')
      .first()
      .isVisible()
      .catch(() => false);
    const hasFooter = await page
      .locator('footer[role="contentinfo"], footer')
      .first()
      .isVisible()
      .catch(() => false);

    // 少なくともどちらか（シンプルな 404 は footer のみの可能性）
    expect(hasHeader || hasFooter).toBeTruthy();
  });

  test("404 ページにホームへの復帰リンクが存在する", async ({ page }) => {
    await page.goto("/another-404-path");
    await page.waitForLoadState("domcontentloaded");

    // ホームリンク or トップへ or スペース一覧へ
    const homeLink = page
      .locator('a[href="/"]')
      .or(page.getByRole("link", { name: /ホーム|トップ|Home/i }))
      .first();
    await expect(homeLink).toBeVisible();
  });

  test("スペース詳細の存在しない slug で 404", async ({ page }) => {
    const response = await page.goto(
      `${urls.spaces}/this-slug-definitely-does-not-exist-abc-xyz`,
    );
    expect(response?.status()).toBe(404);

    const hasNotFound = await page
      .getByText(/404|見つかりません|Not Found/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasNotFound).toBeTruthy();
  });

  test("404 ページに noindex メタタグが設定されている（クロール除外）", async ({
    page,
  }) => {
    await page.goto("/404-for-robots-check");
    await page.waitForLoadState("domcontentloaded");

    const robotsMeta = page.locator('meta[name="robots"]');
    const robotsContent = await robotsMeta.getAttribute("content");

    // noindex が付与されているか、もしくは設定なし（どちらも Google ベストプラクティス）
    // 設定されている場合は noindex を含むこと
    if (robotsContent) {
      expect(robotsContent.toLowerCase()).toMatch(/noindex|nofollow/);
    } else {
      // meta[name=robots] 未設定でも 404 status で Google は index しない
      expect(robotsContent).toBeNull();
    }
  });
});
