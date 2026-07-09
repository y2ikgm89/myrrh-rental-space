import { expect, test, type Page } from "@playwright/test";
import { urls } from "../../fixtures";

const ADMIN_ROUTE_TIMEOUT_MS = 20_000;

const ADMIN_DASHBOARD_ROUTE = {
  path: urls.adminDashboard,
  heading: "ダッシュボード",
} as const;

const ADMIN_RESPONSIVE_ROUTES = [
  ADMIN_DASHBOARD_ROUTE,
  { path: urls.adminNotifications, heading: "通知" },
  { path: urls.adminReservations, heading: "予約管理" },
  { path: urls.adminCustomers, heading: "顧客管理" },
  { path: urls.adminInquiries, heading: "お問い合わせ管理" },
  { path: urls.adminSpaces, heading: "スペース管理" },
  { path: urls.adminSpaceLocations, heading: "スペース管理" },
  { path: urls.adminSpaceCategories, heading: "スペース管理" },
  { path: urls.adminSpaceReviews, heading: "スペース管理" },
  { path: urls.adminEvents, heading: "イベント管理" },
  { path: urls.adminCoupons, heading: "クーポン管理" },
  { path: urls.adminPages, heading: "ページ管理" },
  { path: urls.adminPosts, heading: "投稿管理" },
  { path: urls.adminNews, heading: "お知らせ管理" },
  { path: urls.adminFaq, heading: "FAQ管理" },
  { path: urls.adminMedia, heading: "メディア管理" },
  { path: urls.adminTerms, heading: "利用規約管理" },
  { path: urls.adminTermsTrash, heading: "規約ゴミ箱" },
  { path: urls.adminTermsAgreements, heading: "規約同意記録" },
  { path: urls.adminStaff, heading: "スタッフ管理" },
  { path: urls.adminAuditLogs, heading: "監査ログ" },
  { path: urls.adminSettings, heading: "設定" },
] as const;

const ADMIN_VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function expectAdminRouteReady(
  page: Page,
  route: (typeof ADMIN_RESPONSIVE_ROUTES)[number],
) {
  await page.goto(route.path);
  await expect(page.getByRole("main")).toBeVisible({
    timeout: ADMIN_ROUTE_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { name: route.heading, level: 1 }),
  ).toBeVisible({ timeout: ADMIN_ROUTE_TIMEOUT_MS });
}

async function expectNoPageHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    metrics.htmlScrollWidth,
    `html overflowed horizontally: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.htmlClientWidth + 1);
  expect(
    metrics.bodyScrollWidth,
    `body overflowed horizontally: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
}

test.describe("admin responsive shell", () => {
  test("mobile menu button exposes and updates sidebar state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectAdminRouteReady(page, ADMIN_DASHBOARD_ROUTE);

    const menuButton = page.getByRole("button", { name: "メニューを開く" });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-controls", "admin-sidebar");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#admin-sidebar")).toHaveAttribute(
      "aria-label",
      "メインナビゲーション",
    );

    await page.keyboard.press("Escape");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  for (const viewport of ADMIN_VIEWPORTS) {
    test(`${viewport.name} viewport renders primary admin routes without page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const route of ADMIN_RESPONSIVE_ROUTES) {
        await test.step(route.path, async () => {
          await expectAdminRouteReady(page, route);
          await expectNoPageHorizontalOverflow(page);
        });
      }
    });
  }
});
