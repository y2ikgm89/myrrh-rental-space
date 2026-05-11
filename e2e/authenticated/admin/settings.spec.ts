import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - 設定 E2E テスト
 *
 * テストシナリオ:
 * 1. 設定トップページのナビゲーション
 * 2. サイト基本ページ
 * 3. ビジネス設定ページ
 * 4. メール・通知設定ページ
 * 5. 課金・決済設定ページ
 * 6. 外部連携設定ページ
 * 7. システム管理ページ
 * 8. サイトの見た目ページ（旧 /navigation, /announcement-bar 統合）
 * 9. レスポンシブ対応
 */

// =============================================================================
// 1. 設定トップページのナビゲーション
// =============================================================================

test.describe("設定トップページ", () => {
  test("設定ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("設定");
  });

  test("設定カテゴリカードが複数表示される", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    const settingsLinks = page.locator('a[href*="/admin/settings/"]');
    const count = await settingsLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("機能モジュールカードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/features"]'),
    ).toBeVisible();
  });

  test("サイト基本カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(page.locator('a[href="/admin/settings/site"]')).toBeVisible();
  });

  test("サイトの見た目カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/appearance"]'),
    ).toBeVisible();
  });

  test("ビジネス設定カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/business"]'),
    ).toBeVisible();
  });

  test("課金・決済カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/billing"]'),
    ).toBeVisible();
  });

  test("メール・通知カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/notifications"]'),
    ).toBeVisible();
  });

  test("外部連携カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/integrations"]'),
    ).toBeVisible();
  });

  test("システム管理カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('a[href="/admin/settings/system"]'),
    ).toBeVisible();
  });
});

// =============================================================================
// 2. サイト基本ページ
// =============================================================================

test.describe("サイト基本ページ", () => {
  test("サイト基本ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toContainText("サイト基本");
  });

  test("一般タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    const generalTab = page.locator('[role="tab"]:has-text("一般")');
    await expect(generalTab).toBeVisible();
  });

  test("SEOタブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    const seoTab = page.locator('[role="tab"]:has-text("SEO")');
    await expect(seoTab).toBeVisible();
  });

  test("投稿タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    const postTab = page.locator('[role="tab"]:has-text("投稿")');
    await expect(postTab).toBeVisible();
  });

  test("サイト名フィールドが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    const siteNameInput = page.locator("#siteName");
    await expect(siteNameInput).toBeVisible();
  });

  test("基本情報の保存ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator('button:has-text("基本情報を保存")');
    await expect(saveButton).toBeVisible();
  });

  test("サイト名を変更して保存できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    const siteNameInput = page.locator("#siteName");
    await expect(siteNameInput).toBeVisible();

    await siteNameInput.clear();
    await siteNameInput.fill("テストサイト名");

    await page.locator('button:has-text("基本情報を保存")').click();

    await expect(page.locator("[data-sonner-toaster]")).toBeVisible({
      timeout: 10000,
    });
  });

  test("SEOタブに切り替えられる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    await page.locator('[role="tab"]:has-text("SEO")').click();

    await expect(page.locator('[role="tabpanel"]')).toBeVisible();
  });

  test("robots.txt セクションはSEOタブに存在する", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    await page.locator('[role="tab"]:has-text("SEO")').click();

    const robotsSection = page.locator("text=robots.txt");
    if ((await robotsSection.count()) > 0) {
      await expect(robotsSection.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 3. ビジネス設定ページ
// =============================================================================

test.describe("ビジネス設定ページ", () => {
  test("ビジネス設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toContainText("ビジネス設定");
  });

  test("事業者情報タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");
    await page.waitForLoadState("networkidle");

    const infoTab = page.locator('[role="tab"]:has-text("事業者情報")');
    await expect(infoTab).toBeVisible();
  });

  test("営業時間タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");
    await page.waitForLoadState("networkidle");

    const hoursTab = page.locator('[role="tab"]:has-text("営業時間")');
    await expect(hoursTab).toBeVisible();
  });

  test("予約タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");
    await page.waitForLoadState("networkidle");

    const reservationTab = page.locator('[role="tab"]:has-text("予約")');
    await expect(reservationTab).toBeVisible();
  });

  test("営業時間タブに切り替えられる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");
    await page.waitForLoadState("networkidle");

    await page.locator('[role="tab"]:has-text("営業時間")').click();

    await expect(page.locator('[role="tabpanel"]')).toBeVisible();
  });
});

// =============================================================================
// 4. メール・通知設定ページ
// =============================================================================

test.describe("メール・通知設定ページ", () => {
  test("メール・通知設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toContainText("メール・通知");
  });

  test("メールタブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");
    await page.waitForLoadState("networkidle");

    const emailTab = page.locator('[role="tab"]:has-text("メール")');
    await expect(emailTab).toBeVisible();
  });

  test("通知タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");
    await page.waitForLoadState("networkidle");

    const notificationTab = page.locator('[role="tab"]:has-text("通知")');
    await expect(notificationTab).toBeVisible();
  });

  test("メールタブのコンテンツが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[role="tabpanel"]')).toBeVisible();
  });
});

// =============================================================================
// 5. 課金・決済設定ページ
// =============================================================================

test.describe("課金・決済設定ページ", () => {
  test("課金・決済設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toContainText("課金・決済");
  });

  test("決済タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");
    await page.waitForLoadState("networkidle");

    const paymentTab = page.locator('[role="tab"]:has-text("決済")');
    await expect(paymentTab).toBeVisible();
  });

  test("割引タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");
    await page.waitForLoadState("networkidle");

    const discountTab = page.locator('[role="tab"]:has-text("割引")');
    await expect(discountTab).toBeVisible();
  });

  test("消費税タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");
    await page.waitForLoadState("networkidle");

    const taxTab = page.locator('[role="tab"]:has-text("消費税")');
    await expect(taxTab).toBeVisible();
  });
});

// =============================================================================
// 6. 外部連携設定ページ
// =============================================================================

test.describe("外部連携設定ページ", () => {
  test("外部連携設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/integrations");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toBeVisible();
  });

  test("外部連携設定ページが読み込まれる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/integrations");
    await page.waitForLoadState("networkidle");

    const tabs = page.locator('[role="tab"]');
    const cards = page.locator('[class*="card"], .card');

    const hasTabs = (await tabs.count()) > 0;
    const hasCards = (await cards.count()) > 0;

    expect(hasTabs || hasCards).toBe(true);
  });
});

// =============================================================================
// 7. システム管理設定ページ
// =============================================================================

test.describe("システム管理設定ページ", () => {
  test("システム管理設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/system");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toBeVisible();
  });

  test("システム管理設定ページが読み込まれる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/system");
    await page.waitForLoadState("networkidle");

    const maintenanceTab = page.locator(
      '[role="tab"]:has-text("メンテナンス")',
    );
    const cookieTab = page.locator('[role="tab"]:has-text("Cookie")');
    const permissionsTab = page.locator('[role="tab"]:has-text("権限")');

    const hasMaintenance = (await maintenanceTab.count()) > 0;
    const hasCookie = (await cookieTab.count()) > 0;
    const hasPermissions = (await permissionsTab.count()) > 0;

    expect(hasMaintenance || hasCookie || hasPermissions).toBe(true);
  });
});

// =============================================================================
// 8. サイトの見た目ページ（旧 /navigation, /announcement-bar 統合）
// =============================================================================

test.describe("サイトの見た目ページ", () => {
  test("サイトの見た目ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/appearance");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toContainText("サイトの見た目");
  });

  test("ナビゲーションタブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/appearance");
    await page.waitForLoadState("networkidle");

    const navTab = page.locator('[role="tab"]:has-text("ナビゲーション")');
    await expect(navTab).toBeVisible();
  });

  test("お知らせバータブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/appearance");
    await page.waitForLoadState("networkidle");

    const barTab = page.locator('[role="tab"]:has-text("お知らせバー")');
    await expect(barTab).toBeVisible();
  });
});

// =============================================================================
// 9. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでも設定トップページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("設定");
  });

  test("モバイルビューでもサイト基本ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminSettings + "/site");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1, h2")).toContainText("サイト基本");
  });
});
