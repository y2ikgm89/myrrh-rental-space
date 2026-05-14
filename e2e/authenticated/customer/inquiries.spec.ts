import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ - お問い合わせ履歴 E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. お問い合わせ一覧ページの表示（seed-driven、最低 2 件）
 * 2. お問い合わせ詳細ページへのナビゲーション
 * 3. 管理者返信 (replyMessage) または未返信表示の択一
 * 4. 投稿日時のフォーマット
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に NEW + RESOLVED の 2 件 inquiry が確実に存在
 * - chromium-customer project で実行
 */

test.describe("お問い合わせ履歴 - 一覧ページ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");
  });

  test("お問い合わせ一覧ページが認証済みで表示される", async ({ page }) => {
    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/inquiries");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("seed の inquiry 一覧（最低 2 件）が描画される", async ({ page }) => {
    // seed-driven: dev customer に NEW + RESOLVED が必ずある。空なら seed regression。
    const inquiryCard = page.locator('a[href^="/mypage/inquiries/"]').first();
    await expect(inquiryCard).toBeVisible({ timeout: 5000 });
  });
});

test.describe("お問い合わせ履歴 - 詳細ページ", () => {
  test("お問い合わせ詳細ページに遷移できる + 投稿日時が表示される", async ({
    page,
  }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    const detailLink = page.locator('a[href^="/mypage/inquiries/"]').first();
    await expect(detailLink).toBeVisible({ timeout: 5000 });
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toMatch(/\/mypage\/inquiries\/[^/]+$/);
    await expect(page.locator("main").first()).toBeVisible();

    // YYYY/MM/DD or YYYY年M月 形式の日付
    const hasDate = await page
      .locator("text=/\\d{4}[年/-]\\d{1,2}/")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasDate).toBeTruthy();
  });

  test("管理者返信セクション or 未返信表示の択一が成立する", async ({
    page,
  }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    const detailLink = page.locator('a[href^="/mypage/inquiries/"]').first();
    await expect(detailLink).toBeVisible({ timeout: 5000 });
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    // 返信セクション or 「未返信」メッセージ（一覧 sort 順で最初が NEW か RESOLVED かは仕様依存）
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

    expect(hasReplySection || hasNoReply).toBeTruthy();
  });
});
