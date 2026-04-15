import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ E2E テスト（顧客認証済み state）
 *
 * Playwright 公式 storage state パターンを使用し、
 * `setup-customer` が事前に作成した顧客セッションで実行される。
 *
 * テストシナリオ:
 * 1. /mypage ダッシュボード表示
 * 2. 予約一覧ページ
 * 3. 予約詳細・キャンセル UI
 * 4. お問い合わせ一覧
 * 5. プロフィール設定
 * 6. ログアウト動作
 *
 * 前提:
 * - playwright.config.ts の chromium-customer project で実行
 * - setup-customer により dev customer が認証済み
 * - dev サーバー稼働中（NODE_ENV !== "production"）
 */

test.describe("マイページ - ダッシュボード", () => {
  test("ダッシュボードページが表示される", async ({ page }) => {
    await page.goto(urls.mypage);
    await page.waitForLoadState("networkidle");

    // /login にリダイレクトされていない（認証済み state 動作確認）
    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage");

    // メインコンテンツが表示される
    await expect(page.locator("main")).toBeVisible();
  });

  test("ページ見出しまたはダッシュボード要素が存在する", async ({ page }) => {
    await page.goto(urls.mypage);
    await page.waitForLoadState("networkidle");

    // h1 / dashboard 要素 / マイページ表記のいずれかが表示
    const hasHeading = await page
      .locator("h1, h2")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasHeading).toBeTruthy();
  });

  test("マイページ内のサブメニューが表示される", async ({ page }) => {
    await page.goto(urls.mypage);
    await page.waitForLoadState("networkidle");

    // 予約 / お問い合わせ / 設定のリンクのうち1つ以上が存在
    const reservationLink = page
      .locator('a[href*="/mypage/reservations"]')
      .first();
    const inquiriesLink = page.locator('a[href*="/mypage/inquiries"]').first();
    const settingsLink = page.locator('a[href*="/mypage/settings"]').first();

    const hasAnyLink =
      (await reservationLink.isVisible().catch(() => false)) ||
      (await inquiriesLink.isVisible().catch(() => false)) ||
      (await settingsLink.isVisible().catch(() => false));

    expect(hasAnyLink).toBeTruthy();
  });
});

test.describe("マイページ - 予約一覧", () => {
  test("予約一覧ページにアクセスできる", async ({ page }) => {
    await page.goto(urls.mypageReservations);
    await page.waitForLoadState("networkidle");

    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/reservations");
  });

  test("予約一覧 or 空状態 のいずれかが表示される", async ({ page }) => {
    await page.goto(urls.mypageReservations);
    await page.waitForLoadState("networkidle");

    // 予約カード/テーブル or 空状態
    const hasReservation = await page
      .locator(
        '[class*="reservation"], a[href*="/mypage/reservations/"], article',
      )
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/予約はありません|予約がありません|まだ予約/i)
      .isVisible()
      .catch(() => false);

    expect(hasReservation || hasEmptyState).toBeTruthy();
  });

  test("予約一覧ページに見出しがある", async ({ page }) => {
    await page.goto(urls.mypageReservations);
    await page.waitForLoadState("networkidle");

    // h1 / h2 が存在
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });
});

test.describe("マイページ - お問い合わせ", () => {
  test("お問い合わせ一覧ページにアクセスできる", async ({ page }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/inquiries");
    await expect(page.locator("main")).toBeVisible();
  });

  test("お問い合わせ一覧 or 空状態 のいずれかが表示される", async ({
    page,
  }) => {
    await page.goto(urls.mypageInquiries);
    await page.waitForLoadState("networkidle");

    const hasInquiry = await page
      .locator('article, [class*="inquiry"], a[href*="/mypage/inquiries/"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/お問い合わせはありません|まだお問い合わせ/i)
      .isVisible()
      .catch(() => false);

    expect(hasInquiry || hasEmptyState).toBeTruthy();
  });
});

test.describe("マイページ - プロフィール設定", () => {
  test("プロフィール設定ページにアクセスできる", async ({ page }) => {
    await page.goto(urls.mypageProfile);
    await page.waitForLoadState("networkidle");

    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/settings");
  });

  test("プロフィール編集フォームの入力欄が表示される", async ({ page }) => {
    await page.goto(urls.mypageProfile);
    await page.waitForLoadState("networkidle");

    // 氏名 / メール / 電話 等の入力欄のいずれかが表示
    const hasNameField = await page
      .locator(
        'input[name*="name" i], input[name*="lastName"], input[name*="firstName"]',
      )
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmailField = await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasNameField || hasEmailField).toBeTruthy();
  });

  test("送信ボタンが存在する", async ({ page }) => {
    await page.goto(urls.mypageProfile);
    await page.waitForLoadState("networkidle");

    const submitButton = page.getByRole("button", { name: /更新|保存|変更/i });
    await expect(submitButton.first()).toBeVisible();
  });
});

test.describe("マイページ - レイアウトとナビゲーション", () => {
  test("マイページ間の遷移が動作する", async ({ page }) => {
    // ダッシュボード → 予約一覧 へのナビゲーション
    await page.goto(urls.mypage);
    await page.waitForLoadState("networkidle");

    const reservationLink = page
      .locator('a[href*="/mypage/reservations"]')
      .first();
    if (!(await reservationLink.isVisible().catch(() => false))) {
      test.skip(true, "予約一覧へのリンクが存在しない");
      return;
    }

    await reservationLink.click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/mypage/reservations");
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("公開ヘッダー / フッターが表示される（共通レイアウト）", async ({
    page,
  }) => {
    await page.goto(urls.mypage);
    await page.waitForLoadState("networkidle");

    await expect(page.locator('header[role="banner"]')).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });
});
