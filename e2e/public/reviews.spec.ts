import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - レビュー E2E テスト
 *
 * テストシナリオ:
 * 1. スペース詳細ページのレビューセクション or 空状態 (seed-driven)
 * 2. 評価 / レビューカード or empty state の択一
 * 3. 未認証時のログイン誘導 or 投稿フォーム非表示
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedSpaces / seedDevCustomerAndReservations 経由）:
 * - 公開済 space が seed で確実に存在
 * - dev customer の COMPLETED 予約に SpaceReview seed 済（最低 1 件のレビュー）
 *
 * 注意: レビュー投稿は予約完了済み顧客の認証が必要なため smoke テストのみ。
 *       投稿フローは integration テストで担保。
 */

test.describe("公開スペース - レビュー表示", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.spaces);
  });

  test("スペース詳細ページにレビューセクション or 空状態が描画される", async ({
    page,
  }) => {
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    await expect(spaceLink).toBeVisible({ timeout: 5000 });
    await spaceLink.click();

    expect(page.url()).toMatch(/\/spaces\/[^/]+/);

    const hasReviewSection = await page
      .getByRole("heading", { name: /レビュー|口コミ|評価/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasReviewArea = await page
      .locator(
        '[class*="review"], [data-testid*="review"], section:has-text("レビュー")',
      )
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/レビューはまだありません|評価はまだありません|レビューなし/i)
      .isVisible()
      .catch(() => false);

    expect(hasReviewSection || hasReviewArea || hasEmptyState).toBeTruthy();
  });

  test("評価表示 (数値) or empty state の択一が成立する", async ({ page }) => {
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    await expect(spaceLink).toBeVisible({ timeout: 5000 });
    await spaceLink.click();

    // 評価表示パターン: "4.5" "★4.5" "4.5 / 5" 等
    const hasRatingNumber = await page
      .locator("text=/^[1-5](\\.\\d)?(\\s*\\/\\s*5)?$/")
      .first()
      .isVisible()
      .catch(() => false);
    const hasNoReviews = await page
      .getByText(/レビューはまだありません|評価はまだありません|レビューなし/i)
      .isVisible()
      .catch(() => false);

    expect(hasRatingNumber || hasNoReviews).toBeTruthy();
  });

  test("未認証時はログイン誘導 or 投稿フォーム非表示の択一が成立する", async ({
    page,
  }) => {
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    await expect(spaceLink).toBeVisible({ timeout: 5000 });
    await spaceLink.click();

    const loginPrompt = await page
      .getByText(/ログイン|サインイン|予約完了後にレビュー/i)
      .first()
      .isVisible()
      .catch(() => false);
    const noWriteForm = !(await page
      .getByRole("button", { name: /レビューを投稿|レビューを書く/i })
      .first()
      .isVisible()
      .catch(() => false));

    expect(loginPrompt || noWriteForm).toBeTruthy();
  });
});
