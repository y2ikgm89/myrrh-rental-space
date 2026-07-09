import { expect, test, type Page } from "@playwright/test";
import { urls } from "../fixtures";

const PUBLIC_ROUTE_TIMEOUT_MS = 20_000;
const appSurface = process.env["APP_SURFACE"] ?? "admin";

const PUBLIC_RESPONSIVE_ROUTES = [
  { path: urls.home, heading: /Where silence works\./u },
  { path: urls.about },
  { path: urls.access },
  { path: urls.spaces, heading: "スペース一覧" },
  { path: urls.reservation },
  { path: urls.blog, heading: "ブログ" },
  { path: urls.news, heading: "お知らせ" },
  { path: urls.contact, heading: "お問い合わせ" },
  { path: urls.events, heading: "イベント" },
  { path: urls.faq, heading: "よくある質問" },
  { path: urls.terms, heading: "規約一覧" },
  { path: urls.customerLogin, heading: "ログイン" },
] as const;

const PUBLIC_VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function expectPublicRouteReady(
  page: Page,
  route: (typeof PUBLIC_RESPONSIVE_ROUTES)[number],
) {
  await page.goto(route.path);
  await expect(page.getByRole("main")).toBeVisible({
    timeout: PUBLIC_ROUTE_TIMEOUT_MS,
  });
  if ("heading" in route) {
    await expect(
      page.getByRole("heading", { name: route.heading, level: 1 }),
    ).toBeVisible({ timeout: PUBLIC_ROUTE_TIMEOUT_MS });
  }
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

test.describe("public responsive shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of PUBLIC_VIEWPORTS) {
    test(`${viewport.name} viewport renders primary public routes without page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const route of PUBLIC_RESPONSIVE_ROUTES) {
        if (route.path === urls.home && appSurface !== "public") {
          continue;
        }

        await test.step(route.path, async () => {
          await expectPublicRouteReady(page, route);
          await expectNoPageHorizontalOverflow(page);
        });
      }
    });
  }
});
