import { test, expect } from "@playwright/test";
import { reviewFixtures, urls } from "../../fixtures";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

/**
 * マイページ - レビュー投稿 E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. スペース詳細ページのレビューセクション（認証済み view、レビュー or 空状態）
 * 2. マイページ予約詳細のレビュー投稿 UI 描画契約
 * 3. 投稿フォーム UI (星評価 / コメント入力) 描画契約
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に 4 件 reservation 確実に存在（うち 1 件 COMPLETED+PAID）
 * - 公開済 space が seed で確実に存在
 * - dev customer の COMPLETED 予約に SpaceReview seed 済 →
 *   一覧で「投稿済み」UI 検出可能
 *
 * 注意: 実際の投稿送信は副作用があるため smoke test レベル。
 *       送信後の状態遷移は integration テストで担保。
 */

test.describe("レビュー - スペース詳細セクション", () => {
  test("スペース詳細ページにレビューセクション or 空状態が表示される", async ({
    page,
  }) => {
    await page.goto(`${urls.spaces}/${reviewFixtures.publicReviewSpaceSlug}`);
    await expect(page).toHaveURL(
      new RegExp(`/spaces/${reviewFixtures.publicReviewSpaceSlug}$`, "u"),
    );

    const reviewsHeading = page.getByRole("heading", {
      name: "レビュー",
      level: 2,
    });
    await expect(reviewsHeading).toBeVisible();
  });
});

test.describe("レビュー - マイページからの投稿経路", () => {
  test("レビュー済みの完了予約詳細に投稿済みレビューが表示される", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.completedPaid,
    );

    await expect(
      page.locator("#main-content").getByRole("heading", {
        name: "レビュー",
        level: 2,
      }),
    ).toBeVisible();
    await expect(page.getByText("投稿済み", { exact: true })).toBeVisible();
  });
});
