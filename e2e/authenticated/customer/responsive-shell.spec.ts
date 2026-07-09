import { expect, test, type Page } from "@playwright/test";
import { urls } from "../../fixtures";

const CUSTOMER_ROUTE_TIMEOUT_MS = 20_000;

const CUSTOMER_RESPONSIVE_ROUTES = [
  { path: urls.mypageReservations, heading: "予約" },
  { path: urls.mypageEvents, heading: "イベント" },
  { path: urls.mypageInquiries, heading: "お問い合わせ一覧" },
  { path: urls.mypageProfile, heading: "アカウント設定" },
] as const;

const CUSTOMER_VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function expectCustomerRouteReady(
  page: Page,
  route: (typeof CUSTOMER_RESPONSIVE_ROUTES)[number],
) {
  await page.goto(route.path);
  await expect(page.getByRole("main")).toBeVisible({
    timeout: CUSTOMER_ROUTE_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { name: route.heading, level: 1 }),
  ).toBeVisible({ timeout: CUSTOMER_ROUTE_TIMEOUT_MS });
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

test.describe("customer responsive shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of CUSTOMER_VIEWPORTS) {
    test(`${viewport.name} viewport renders primary customer routes without page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const route of CUSTOMER_RESPONSIVE_ROUTES) {
        await test.step(route.path, async () => {
          await expectCustomerRouteReady(page, route);
          await expectNoPageHorizontalOverflow(page);
        });
      }
    });
  }
});
