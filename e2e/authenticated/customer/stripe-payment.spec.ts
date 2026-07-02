import { test, expect } from "@playwright/test";
import {
  customerReservationTargets,
  getReservationDetailHeader,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

/**
 * マイページ - Stripe 決済 E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. 予約詳細ページに支払い済みステータスが表示される
 * 2. 予約詳細ページに未払いステータスが表示される
 * 3. /reservation/complete URL ページが正しく表示される
 * 4. /reservation/cancel URL ページが正しく表示される
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に COMPLETED+PAID / CONFIRMED+UNPAID / PENDING+UNPAID /
 *   CANCELLED+REFUNDED の 4 件 reservation が確実に存在
 * - `e2e/auth/customer.setup.ts` が認証済 storage state を生成済
 *
 * 設計原則:
 * - 顧客マイページは予約詳細の決済ステータス表示を担保する。
 * - Stripe checkout session 作成は管理画面 action / integration 側で担保する。
 * - Webhook は E2E 対象外（integration テストで担保）。
 */

test.describe("Stripe 決済 UI - 予約詳細ステータス表示", () => {
  test("支払い済み予約詳細に支払い済みステータスが表示される", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.completedPaid,
    );

    await expect(
      getReservationDetailHeader(page, "ミーティングルーム A").getByText(
        "支払い済み",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("未払い予約詳細に未払いステータスが表示される", async ({ page }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.confirmedUnpaid,
    );

    await expect(
      getReservationDetailHeader(page, "ミーティングルーム A").getByText(
        "未払い",
        { exact: true },
      ),
    ).toBeVisible();
  });
});

test.describe("Stripe 決済 UI - success / cancel URL 表示", () => {
  test("/reservation/complete ページが正しく表示される", async ({ page }) => {
    await page.goto("/reservation/complete?token=mock_invalid_token");

    // 404 でないことを確認
    expect(page.url()).not.toMatch(/\/404|\/not-found/);

    await expect(
      page.getByRole("heading", {
        name: "ご予約ありがとうございます",
        level: 1,
      }),
    ).toBeVisible();
  });

  test("/reservation/cancel ページが正しく表示される", async ({ page }) => {
    await page.goto("/reservation/cancel?session_id=mock_test_session");

    expect(page.url()).not.toMatch(/\/404|\/not-found/);
    await expect(
      page.getByRole("heading", { name: "予約のキャンセル", level: 1 }),
    ).toBeVisible();
  });
});
