import { expect, test, type Locator, type Page } from "@playwright/test";
import { urls } from "../fixtures";

async function expectTouchMobileContext(page: Page) {
  const context = await page.evaluate(() => ({
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    hoverNone: window.matchMedia("(hover: none)").matches,
    width: window.innerWidth,
  }));

  expect(context.coarsePointer).toBe(true);
  expect(context.hoverNone).toBe(true);
  expect(context.width).toBeLessThanOrEqual(430);
}

async function expectFocusedWithin(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((root) => root.contains(document.activeElement)),
    )
    .toBe(true);
}

test.describe("public mobile device interactions", () => {
  test("mobile navigation behaves as a labeled modal dialog in touch context", async ({
    page,
  }) => {
    await page.goto(urls.home);
    await expectTouchMobileContext(page);

    const banner = page.getByRole("banner");
    const menuButton = banner.getByRole("button", { name: "メニューを開く" });
    const menuButtonElement = page.locator(
      'header button[aria-label="メニューを開く"]',
    );
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();

    const dialog = page.getByRole("dialog", {
      name: "ナビゲーションメニュー",
    });
    await expect(dialog).toBeVisible();
    await expect(menuButtonElement).toHaveAttribute("aria-expanded", "true");
    await expectFocusedWithin(dialog);

    await page.keyboard.press("Tab");
    await expectFocusedWithin(dialog);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });
});
