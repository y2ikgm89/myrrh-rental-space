import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ - お問い合わせ履歴 E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. お問い合わせ一覧ページの表示
 * 2. お問い合わせ詳細ページへのナビゲーション
 * 3. 管理者返信 (replyMessage) がある場合の表示
 * 4. 投稿日時のフォーマット
 *
 * 前提:
 * - chromium-customer project で実行
 * - dev customer がお問い合わせを送信済みである前提（データ無ければ skip）
 */

test.describe("お問い合わせ履歴 - 一覧ページ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");
  });

  test("お問い合わせ一覧ページが認証済みで表示される", async ({ page }) => {
    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/inquiries");
    await expect(page.locator("main")).toBeVisible();
  });

  test("お問い合わせ一覧 or 空状態のいずれかが描画される", async ({ page }) => {
    const hasInquiryCard = await page
      .locator('article, a[href^="/mypage/inquiries/"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/お問い合わせはありません|まだお問い合わせ|履歴がありません/i)
      .isVisible()
      .catch(() => false);

    expect(hasInquiryCard || hasEmptyState).toBeTruthy();
  });
});

test.describe("お問い合わせ履歴 - 詳細ページ", () => {
  test("お問い合わせ詳細ページに遷移できる", async ({ page }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    const detailLink = page.locator('a[href^="/mypage/inquiries/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "お問い合わせがありません");
      return;
    }

    await detailLink.click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toMatch(/\/mypage\/inquiries\/[^/]+$/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("詳細ページに投稿日時が表示される", async ({ page }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    const detailLink = page.locator('a[href^="/mypage/inquiries/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "お問い合わせなし");
      return;
    }
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    // YYYY/MM/DD or YYYY年M月 形式
    const hasDate = await page
      .locator("text=/\\d{4}[年/-]\\d{1,2}/")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasDate).toBeTruthy();
  });

  test("管理者返信があれば「返信」セクションまたは replyMessage が表示される（任意）", async ({
    page,
  }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    const detailLink = page.locator('a[href^="/mypage/inquiries/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "お問い合わせなし");
      return;
    }
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    // 返信セクション or 「未返信」メッセージ
    const hasReplySection = await page
      .getByText(/管理者からの返信|店舗からの返信|返信内容/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasNoReply = await page
      .getByText(/返信はまだありません|未返信|返信待ち/i)
      .first()
      .isVisible()
      .catch(() => false);

    // どちらか一方の state が成立
    expect(hasReplySection || hasNoReply).toBeTruthy();
  });
});
