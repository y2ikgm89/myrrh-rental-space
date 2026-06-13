import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Visual Regression テスト（公開ページ）
 *
 * Playwright 公式の `toHaveScreenshot` + baseline snapshot パターンで
 * 主要公開ページの視覚的回帰を検出する。
 *
 * 参照: https://playwright.dev/docs/test-snapshots
 *
 * 【opt-in 実行】
 *
 * デフォルトは skip。environment variable `PLAYWRIGHT_VISUAL=1` で有効化:
 *
 *   # 初回 baseline 生成（必須）
 *   PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual --update-snapshots
 *
 *   # 以降の回帰検証
 *   PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual
 *
 * 【設計原則】
 *
 * - `animations: "disabled"` で CSS transition/animation を無効化
 *   （Kinfolk-style subtle animations の flaky 回避）
 * - 動的要素（日付・時刻・お知らせバー等）は `mask` で pink box
 * - `fullPage: true` で above-the-fold 以外の regression も検出
 * - `maxDiffPixelRatio: 0.01` で 1% 以内の微差は許容（フォント微調整等）
 *
 * 【baseline 管理】
 *
 * snapshot ファイルは `e2e/visual/public-pages.spec.ts-snapshots/` に
 * 自動配置される。CI / レビュー時の差分は playwright-report で確認。
 */

const VISUAL_ENABLED = process.env["PLAYWRIGHT_VISUAL"] === "1";

test.describe("Visual Regression - 公開ページ主要ルート", () => {
  // opt-in ガード
  test.skip(
    !VISUAL_ENABLED,
    "visual regression は PLAYWRIGHT_VISUAL=1 で有効化",
  );

  // 動的コンテンツ（日付・時刻・お知らせバー等）を mask するための共通 locator
  const dynamicMaskLocators = (page: Page) => [
    // お知らせバー（カルーセル・現在時刻依存）
    page.locator('[class*="announcement" i]'),
    // 日時・タイムスタンプ要素
    page.locator("time, [datetime]"),
    // Instagram 動的フィード
    page.locator('[class*="instagram" i]'),
  ];

  test("ホームページ - above-the-fold + full page snapshot", async ({
    page,
  }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // GSAP / Lenis アニメーション完了を待つ
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("homepage.png", {
      fullPage: true,
      animations: "disabled",
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("スペース一覧ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.spaces);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("spaces-list.png", {
      fullPage: true,
      animations: "disabled",
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("ブログ一覧ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.blog);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("posts-list.png", {
      fullPage: true,
      animations: "disabled",
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("お知らせ一覧ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.news);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("news-list.png", {
      fullPage: true,
      animations: "disabled",
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("FAQ ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.faq);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("faq.png", {
      fullPage: true,
      animations: "disabled",
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("お問い合わせページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.contact);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("contact.png", {
      fullPage: true,
      animations: "disabled",
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe("Visual Regression - モバイル viewport", () => {
  test.skip(
    !VISUAL_ENABLED,
    "visual regression は PLAYWRIGHT_VISUAL=1 で有効化",
  );

  test.use({ viewport: { width: 375, height: 667 } });

  test("ホームページ - モバイル full page", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("homepage-mobile.png", {
      fullPage: true,
      animations: "disabled",
      mask: [
        page.locator('[class*="announcement" i]'),
        page.locator("time, [datetime]"),
      ],
      maxDiffPixelRatio: 0.01,
    });
  });
});
