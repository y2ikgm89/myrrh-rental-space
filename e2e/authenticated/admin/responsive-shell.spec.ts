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
  // 幅の数値だけでは「どの要素がはみ出したか」が分からず、失敗しても直せない。
  //
  // 初版は `getBoundingClientRect().right` だけを見て、さらにゼロサイズ要素を
  // スキップしていたため、run 30595374008 では左に置かれた off-canvas サイドバーしか
  // 拾えず、右 +8px の実犯人を取り逃がした。横オーバーフローの発生源は
  //
  //   (a) 自身の矩形が viewport 右端を越える要素
  //   (b) 自身は収まっているが、`overflow-x: visible` のまま中身がはみ出している容器
  //       （こちらが祖先へ伝播して documentElement.scrollWidth を押し広げる）
  //
  // の 2 系統あるので両方を採取する。ゼロサイズ要素も除外しない（高さ 0 の
  // 幅広要素は layout overflow に寄与する）。
  const metrics = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;

    const describe = (element: Element): string => {
      const id = element.id ? `#${element.id}` : "";
      const className =
        typeof element.className === "string" ? element.className : "";
      const classes = className
        ? `.${className.trim().split(/\s+/).slice(0, 5).join(".")}`
        : "";
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    const candidates: Element[] = [
      document.body,
      ...Array.from(document.body.querySelectorAll("*")),
    ];
    const offenders: string[] = [];

    for (const element of candidates) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;

      const rect = element.getBoundingClientRect();
      const overflowsViewport = rect.right > clientWidth + 1;
      // clip / hidden な容器は自分で止めるので伝播源にならない。
      const leaksContent =
        element.scrollWidth > element.clientWidth + 1 &&
        (style.overflowX === "visible" || style.overflowX === "clip");
      if (!overflowsViewport && !leaksContent) continue;

      offenders.push(
        `${describe(element)} [${overflowsViewport ? "rect" : "content"}]` +
          ` left=${Math.round(rect.left)} right=${Math.round(rect.right)}` +
          ` width=${Math.round(rect.width)}` +
          ` scrollWidth=${element.scrollWidth} clientWidth=${element.clientWidth}` +
          ` position=${style.position} overflowX=${style.overflowX}`,
      );
    }

    return {
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      htmlClientWidth: clientWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      offenders: offenders.slice(0, 12),
      offenderCount: offenders.length,
    };
  });

  const detail = `${JSON.stringify({
    bodyClientWidth: metrics.bodyClientWidth,
    bodyScrollWidth: metrics.bodyScrollWidth,
    htmlClientWidth: metrics.htmlClientWidth,
    htmlScrollWidth: metrics.htmlScrollWidth,
    offenderCount: metrics.offenderCount,
  })}\noffending elements:\n  ${
    metrics.offenders.join("\n  ") ||
    "(none detected — fixed/absolute descendants or pseudo elements)"
  }`;

  expect(
    metrics.htmlScrollWidth,
    `html overflowed horizontally: ${detail}`,
  ).toBeLessThanOrEqual(metrics.htmlClientWidth + 1);
  expect(
    metrics.bodyScrollWidth,
    `body overflowed horizontally: ${detail}`,
  ).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
}

test.describe("admin responsive shell", () => {
  test("mobile menu button exposes and updates sidebar state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectAdminRouteReady(page, ADMIN_DASHBOARD_ROUTE);

    // TopBar は開閉に応じて aria-label を「メニューを開く」↔「メニューを閉じる」に
    // 切り替える（正しい a11y 実装）。名前でロケートすると開いた瞬間に一致しなくなり、
    // 直後の aria-expanded アサーションが element not found で落ちる
    // （run 30569714860 の失敗）。開閉で不変な aria-controls を anchor にする。
    const menuButton = page.locator('button[aria-controls="admin-sidebar"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAccessibleName("メニューを開く");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(menuButton).toHaveAccessibleName("メニューを閉じる");
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
