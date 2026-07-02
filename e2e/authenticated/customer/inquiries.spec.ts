import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ - お問い合わせ履歴 E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. お問い合わせ一覧ページの表示（seed-driven、最低 2 件）
 * 2. お問い合わせ詳細ページへのナビゲーション
 * 3. 返信済み inquiry のスタッフ返信 (replyMessage)
 * 4. 投稿日時のフォーマット
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に NEW + RESOLVED の 2 件 inquiry が確実に存在
 * - chromium-customer project で実行
 */

test.describe("お問い合わせ履歴 - 一覧ページ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.mypageInquiries);
  });

  test("お問い合わせ一覧ページが認証済みで表示される", async ({ page }) => {
    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/inquiries");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("seed の inquiry 一覧（最低 2 件）が描画される", async ({ page }) => {
    const main = page.locator("#main-content");

    await expect(
      main.getByRole("link", {
        name: /\[E2E\] dev customer の新規お問い合わせ/u,
      }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      main.getByRole("link", {
        name: /\[E2E\] dev customer の解決済お問い合わせ/u,
      }),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("お問い合わせ履歴 - 詳細ページ", () => {
  test("お問い合わせ詳細ページに遷移できる + 投稿日時が表示される", async ({
    page,
  }) => {
    await page.goto(urls.mypageInquiries);

    const detailLink = page.locator("#main-content").getByRole("link", {
      name: /\[E2E\] dev customer の新規お問い合わせ/u,
    });
    await expect(detailLink).toBeVisible({ timeout: 5000 });
    await detailLink.click();

    await expect(page).toHaveURL(/\/mypage\/inquiries\/[^/]+$/u);
    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(
      main.getByRole("article", { name: "あなたから" }).locator("time"),
    ).toHaveText(/\d{4}年\d{1,2}月\d{1,2}日/u);
  });

  test("返信済み inquiry のスタッフ返信が表示される", async ({ page }) => {
    await page.goto(urls.mypageInquiries);

    const detailLink = page.locator("#main-content").getByRole("link", {
      name: /\[E2E\] dev customer の解決済お問い合わせ/u,
    });
    await expect(detailLink).toBeVisible({ timeout: 5000 });
    await detailLink.click();
    await expect(page).toHaveURL(/\/mypage\/inquiries\/[^/]+$/u);

    const main = page.locator("#main-content");
    await expect(
      main.getByRole("heading", { level: 2, name: "スタッフから" }),
    ).toBeVisible();
    await expect(
      main.getByText(
        "ご返信ありがとうございました。引き続きよろしくお願いします。",
      ),
    ).toBeVisible();
  });
});
