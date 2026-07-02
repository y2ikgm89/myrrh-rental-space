import { test, expect } from "@playwright/test";
import { reviewFixtures, urls } from "../fixtures";

/**
 * 公開サイト - レビュー E2E テスト
 *
 * テストシナリオ:
 * 1. seed のレビュー有効スペースでレビューセクションが描画される
 * 2. 評価 / レビューカードが表示される
 * 3. 未認証時は投稿フォームが表示されない
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedSpaces / seedDevCustomerAndReservations 経由）:
 * - `reviewFixtures.publicReviewSpaceSlug` が公開済み + reviewsEnabled
 * - dev customer の COMPLETED 予約に公開 SpaceReview seed 済
 *
 * 注意: レビュー投稿は予約完了済み顧客の認証が必要なため smoke テストのみ。
 *       投稿フローは integration テストで担保。
 */

test.describe("公開スペース - レビュー表示", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${urls.spaces}/${reviewFixtures.publicReviewSpaceSlug}`);
    await expect(page).toHaveURL(
      new RegExp(`/spaces/${reviewFixtures.publicReviewSpaceSlug}$`, "u"),
    );
  });

  test("スペース詳細ページにレビューセクションが描画される", async ({
    page,
  }) => {
    const reviewsSection = page
      .getByRole("heading", { name: "レビュー", level: 2 })
      .locator("..");

    await expect(reviewsSection).toBeVisible();
    await expect(
      reviewsSection.getByText("[E2E] 公開レビュー検証用"),
    ).toBeVisible();
  });

  test("評価表示とレビュー件数が表示される", async ({ page }) => {
    const reviewsSection = page
      .getByRole("heading", { name: "レビュー", level: 2 })
      .locator("..");

    await expect(reviewsSection.getByText(/^[1-5]\.\d$/u)).toBeVisible();
    await expect(reviewsSection.getByText(/\d+件のレビュー/u)).toBeVisible();
  });

  test("未認証時は投稿フォームが表示されない", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /レビューを投稿|レビューを書く/u }),
    ).toHaveCount(0);
  });
});
