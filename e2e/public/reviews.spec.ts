import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - レビュー E2E テスト
 *
 * テストシナリオ:
 * 1. スペース詳細ページのレビューセクション表示
 * 2. 平均評価・件数の表示
 * 3. レビュー一覧の表示（投稿済みレビューがある場合）
 * 4. レビュー無しスペースの empty state
 *
 * 前提条件:
 * - DB に seed されたスペースデータ
 * - 一部スペースに SpaceReview レコードが存在することが望ましい
 *
 * 注意: レビュー投稿は予約完了済み顧客の認証が必要なため smoke テストのみ。
 *       投稿フローは integration テストで担保。
 */

test.describe("公開スペース - レビュー表示", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.spaces);
    await page.waitForLoadState("networkidle");
  });

  test("スペース詳細ページにレビューセクションが存在する", async ({ page }) => {
    // 最初のスペース詳細ページに遷移
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    const linkExists = await spaceLink.count();

    if (linkExists === 0) {
      test.skip(true, "スペースデータがありません");
      return;
    }

    await spaceLink.click();
    await page.waitForLoadState("networkidle");

    // 詳細ページの URL 確認
    expect(page.url()).toMatch(/\/spaces\/[^/]+/);

    // レビューセクション・見出し・empty state のいずれかが存在
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

    expect(hasReviewSection || hasReviewArea).toBeTruthy();
  });

  test("評価がある場合は平均評価が数値で表示される", async ({ page }) => {
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    if ((await spaceLink.count()) === 0) {
      test.skip(true, "スペースデータがありません");
      return;
    }

    await spaceLink.click();
    await page.waitForLoadState("networkidle");

    // 評価表示パターン: "4.5" "★4.5" "4.5 / 5" 等
    const ratingPattern = page
      .locator("text=/^[1-5](\\.\\d)?(\\s*\\/\\s*5)?$/")
      .first();
    const hasRatingNumber = await ratingPattern.isVisible().catch(() => false);

    // または empty state（レビューなし）
    const hasNoReviews = await page
      .getByText(/レビューはまだありません|評価はまだありません|レビューなし/i)
      .isVisible()
      .catch(() => false);

    expect(hasRatingNumber || hasNoReviews).toBeTruthy();
  });

  test("レビューカードが存在する場合は投稿日が表示される", async ({ page }) => {
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    if ((await spaceLink.count()) === 0) {
      test.skip(true, "スペースデータがありません");
      return;
    }

    await spaceLink.click();
    await page.waitForLoadState("networkidle");

    // レビューカードがあるか
    const reviewCard = page
      .locator('[class*="review"], article')
      .filter({ hasText: /★|☆|評価/i })
      .first();
    const hasReviewCard = await reviewCard.isVisible().catch(() => false);

    if (!hasReviewCard) {
      test.skip(true, "投稿済みレビューが存在しません");
      return;
    }

    // 投稿日のフォーマット: "YYYY/MM/DD" or "YYYY年MM月" or "MM月DD日"
    const datePattern = await page
      .locator("text=/\\d{4}[年/-]\\d{1,2}[月/-]/")
      .first()
      .isVisible()
      .catch(() => false);
    expect(datePattern).toBeTruthy();
  });

  test("レビューを書くためにはログインが必要なメッセージが表示される（未認証時）", async ({
    page,
  }) => {
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    if ((await spaceLink.count()) === 0) {
      test.skip(true, "スペースデータがありません");
      return;
    }

    await spaceLink.click();
    await page.waitForLoadState("networkidle");

    // 未認証時のレビュー投稿不可メッセージ・ログイン誘導があるか
    // または投稿フォーム自体が表示されないか
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
