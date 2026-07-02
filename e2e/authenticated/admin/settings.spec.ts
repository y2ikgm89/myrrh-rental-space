import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

async function expectPageHeading(
  page: import("@playwright/test").Page,
  name: string | RegExp,
) {
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

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

    await expectPageHeading(page, "設定");
  });

  test("設定カテゴリカードが複数表示される", async ({ page }) => {
    await page.goto(urls.adminSettings);

    const settingsLinks = page.locator('a[href*="/admin/settings/"]');
    const count = await settingsLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("機能モジュールカードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(
      page.locator('a[href="/admin/settings/features"]'),
    ).toBeVisible();
  });

  test("サイト基本カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(page.locator('a[href="/admin/settings/site"]')).toBeVisible();
  });

  test("サイトの見た目カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(
      page.locator('a[href="/admin/settings/appearance"]'),
    ).toBeVisible();
  });

  test("ビジネス設定カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(
      page.locator('a[href="/admin/settings/business"]'),
    ).toBeVisible();
  });

  test("課金・決済カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(
      page.locator('a[href="/admin/settings/billing"]'),
    ).toBeVisible();
  });

  test("メール・通知カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(
      page.locator('a[href="/admin/settings/notifications"]'),
    ).toBeVisible();
  });

  test("外部連携カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

    await expect(
      page.locator('a[href="/admin/settings/integrations"]'),
    ).toBeVisible();
  });

  test("システム管理カードが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);

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

    await expectPageHeading(page, "サイト基本");
  });

  test("一般タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    const generalTab = page.getByRole("tab", { name: "一般" });
    await expect(generalTab).toBeVisible();
  });

  test("SEOタブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    const seoTab = page.getByRole("tab", { name: "SEO" });
    await expect(seoTab).toBeVisible();
  });

  test("連絡先情報が表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    await expect(page.getByText("連絡先情報", { exact: true })).toBeVisible();
  });

  test("サイト名フィールドが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    const siteNameInput = page.getByRole("textbox", { name: "サイト名" });
    await expect(siteNameInput).toBeVisible();
  });

  test("基本情報の保存ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    const saveButton = page.getByRole("button", { name: "基本情報を保存" });
    await expect(saveButton).toBeVisible();
  });

  test("SEOタブに切り替えられる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    await page.getByRole("tab", { name: "SEO" }).click();

    await expect(page.getByRole("tabpanel", { name: "SEO" })).toBeVisible();
  });

  test("メタ情報設定はSEOタブに存在する", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    await page.getByRole("tab", { name: "SEO" }).click();

    await expect(
      page.getByRole("textbox", {
        name: "デフォルトメタディスクリプション",
      }),
    ).toBeVisible();
  });
});

// Setting シングルトンを mutate するため worker 間直列化が必要
test.describe.serial("サイト名 mutation - 並列化禁止", () => {
  test("サイト名を変更して保存できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/site");

    const siteNameInput = page.getByRole("textbox", { name: "サイト名" });
    await expect(siteNameInput).toBeVisible();

    await siteNameInput.clear();
    await siteNameInput.fill("テストサイト名");

    await page.getByRole("button", { name: "基本情報を保存" }).click();

    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByRole("textbox", { name: "サイト名" }).inputValue();
        },
        { timeout: 10000 },
      )
      .toBe("テストサイト名");
  });
});

// =============================================================================
// 3. ビジネス設定ページ
// =============================================================================

test.describe("ビジネス設定ページ", () => {
  test("ビジネス設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");

    await expectPageHeading(page, "ビジネス設定");
  });

  test("事業者情報タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");

    const infoTab = page.getByRole("tab", { name: "事業者情報" });
    await expect(infoTab).toBeVisible();
  });

  test("営業時間タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");

    const hoursTab = page.getByRole("tab", { name: "営業時間" });
    await expect(hoursTab).toBeVisible();
  });

  test("予約タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");

    const reservationTab = page.getByRole("tab", { name: "予約" });
    await expect(reservationTab).toBeVisible();
  });

  test("営業時間タブに切り替えられる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");

    await page.getByRole("tab", { name: "営業時間" }).click();

    await expect(
      page.getByRole("tabpanel", { name: "営業時間" }),
    ).toBeVisible();
  });
});

// =============================================================================
// 4. メール・通知設定ページ
// =============================================================================

test.describe("メール・通知設定ページ", () => {
  test("メール・通知設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");

    await expectPageHeading(page, /メール・通知/u);
  });

  test("メールタブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");

    const emailTab = page.getByRole("tab", { name: "メール" });
    await expect(emailTab).toBeVisible();
  });

  test("通知タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");

    const notificationTab = page.getByRole("tab", { name: "通知" });
    await expect(notificationTab).toBeVisible();
  });

  test("メールタブのコンテンツが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/notifications");

    await expect(page.getByRole("tabpanel", { name: "メール" })).toBeVisible();
  });
});

// =============================================================================
// 5. 課金・決済設定ページ
// =============================================================================

test.describe("課金・決済設定ページ", () => {
  test("課金・決済設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");

    await expectPageHeading(page, "課金・決済");
  });

  test("決済タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");

    const paymentTab = page.locator('[role="tab"]:has-text("決済")');
    await expect(paymentTab).toBeVisible();
  });

  test("割引タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");

    const discountTab = page.locator('[role="tab"]:has-text("割引")');
    await expect(discountTab).toBeVisible();
  });

  test("消費税タブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/billing");

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

    await expectPageHeading(page, "外部連携");
  });

  test("外部連携設定ページが読み込まれる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/integrations");

    await expect(page.locator('[role="tab"]:has-text("Resend")')).toBeVisible();
    await expect(
      page.locator('[role="tab"]:has-text("Turnstile")'),
    ).toBeVisible();
    await expect(
      page.locator('[role="tab"]:has-text("Google Maps")'),
    ).toBeVisible();
  });
});

// =============================================================================
// 7. システム管理設定ページ
// =============================================================================

test.describe("システム管理設定ページ", () => {
  test("システム管理設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/system");

    await expectPageHeading(page, "システム管理");
  });

  test("システム管理設定ページが読み込まれる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/system");

    await expect(
      page.locator('[role="tab"]:has-text("メンテナンス")'),
    ).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Cookie")')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("権限")')).toBeVisible();
  });
});

// =============================================================================
// 8. サイトの見た目ページ（旧 /navigation, /announcement-bar 統合）
// =============================================================================

test.describe("サイトの見た目ページ", () => {
  test("サイトの見た目ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/appearance");

    await expectPageHeading(page, "サイトの見た目");
  });

  test("ナビゲーションタブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/appearance");

    const navTab = page.locator('[role="tab"]:has-text("ナビゲーション")');
    await expect(navTab).toBeVisible();
  });

  test("お知らせバータブが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/appearance");

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

    await expectPageHeading(page, "設定");
  });

  test("モバイルビューでもサイト基本ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminSettings + "/site");

    await expectPageHeading(page, "サイト基本");
  });
});
