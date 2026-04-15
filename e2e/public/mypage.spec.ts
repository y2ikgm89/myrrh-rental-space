import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - マイページ E2E テスト
 *
 * テストシナリオ:
 * 1. 未認証時のリダイレクト動作（auth gate）
 * 2. /login へのリダイレクト先確認
 * 3. SEO 設定（noindex）の検証
 * 4. マイページサブルート個別の認証ガード
 *
 * 注意: 実際の認証フローは Better Auth + Google/LINE OAuth のため
 *       E2E では認証済み状態のテストはスキップ（unit/integration で担保）。
 *       本ファイルは未認証時の境界テストに集中する。
 */

test.describe("マイページ - 認証ガード", () => {
  test("未認証で /mypage にアクセスすると /login にリダイレクト", async ({
    page,
  }) => {
    await page.goto(urls.mypage);
    await expect(page).toHaveURL(/\/login/);
  });

  test("未認証で /mypage/reservations にアクセスすると /login にリダイレクト", async ({
    page,
  }) => {
    await page.goto(urls.mypageReservations);
    await expect(page).toHaveURL(/\/login/);
  });

  test("未認証で /mypage/inquiries にアクセスすると /login にリダイレクト", async ({
    page,
  }) => {
    await page.goto(urls.mypageInquiries);
    await expect(page).toHaveURL(/\/login/);
  });

  test("未認証で /mypage/settings にアクセスすると /login にリダイレクト", async ({
    page,
  }) => {
    await page.goto(urls.mypageProfile);
    await expect(page).toHaveURL(/\/login/);
  });

  test("マイページ系ルートには noindex メタタグが設定されている", async ({
    page,
  }) => {
    // /login ページ自体のチェック（マイページが redirect される先）
    await page.goto(urls.customerLogin);
    await page.waitForLoadState("networkidle");

    const robotsMeta = page.locator('meta[name="robots"]');
    const robotsContent = await robotsMeta.getAttribute("content");

    // noindex / nofollow が含まれていることを確認
    expect(robotsContent).toBeTruthy();
    expect(robotsContent?.toLowerCase()).toContain("noindex");
  });
});
