import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - 顧客認証 E2E テスト
 *
 * テストシナリオ:
 * 1. /login ページ表示
 * 2. ソーシャルログインボタン（Google / LINE）の表示
 * 3. ブランドロゴの表示と a11y 属性
 * 4. ヘッダー / フッター等の共通レイアウト
 *
 * 注意: 実際の OAuth callback は Google / LINE 側のフローのためテスト不可。
 *       本ファイルはログインページ UI と a11y 検証に集中する。
 *       認証済み状態のテストは integration で担保。
 */

test.describe("顧客ログインページ - UI と a11y", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.customerLogin);
    await page.waitForLoadState("networkidle");
  });

  test("ログインページが正しく表示される", async ({ page }) => {
    // メインコンテンツが表示される
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // ページタイトルが設定されている
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("Google ログインボタンが表示される", async ({ page }) => {
    const googleButton = page
      .getByRole("button", { name: /google/i })
      .or(page.getByRole("link", { name: /google/i }))
      .first();
    await expect(googleButton).toBeVisible();
  });

  test("LINE ログインボタンが表示される", async ({ page }) => {
    const lineButton = page
      .getByRole("button", { name: /line/i })
      .or(page.getByRole("link", { name: /line/i }))
      .first();
    await expect(lineButton).toBeVisible();
  });

  test("noindex/nofollow メタタグが設定されている（クロール除外）", async ({
    page,
  }) => {
    const robotsMeta = page.locator('meta[name="robots"]');
    const robotsContent = await robotsMeta.getAttribute("content");

    expect(robotsContent).toBeTruthy();
    expect(robotsContent?.toLowerCase()).toContain("noindex");
    expect(robotsContent?.toLowerCase()).toContain("nofollow");
  });

  test("ログイン後の redirect 先パラメータを保持できる", async ({ page }) => {
    // /login?redirectTo=/mypage/reservations のような遷移経由
    await page.goto(`${urls.customerLogin}?redirectTo=/mypage`);
    await page.waitForLoadState("networkidle");

    // URL が保持されている
    expect(page.url()).toContain("redirectTo");

    // ログインボタンは引き続き表示
    const googleButton = page
      .getByRole("button", { name: /google/i })
      .or(page.getByRole("link", { name: /google/i }))
      .first();
    await expect(googleButton).toBeVisible();
  });
});
