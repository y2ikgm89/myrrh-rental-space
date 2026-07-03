import { expect, test, type Locator } from "@playwright/test";

const NEW_POST_PATH = "/admin/posts/new";

async function expectFocusedWithin(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((root) => root.contains(document.activeElement)),
    )
    .toBe(true);
}

async function closeDialogWithEscape(dialog: Locator) {
  await dialog.page().keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
}

async function expectDialogCanCloseAndReopenFromTouchTrigger(
  trigger: Locator,
  dialog: Locator,
) {
  await closeDialogWithEscape(dialog);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await closeDialogWithEscape(dialog);
}

async function expectDialogWithinViewport(dialog: Locator) {
  const metrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width,
    };
  });

  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight);
}

test.describe("admin mobile dialog interactions", () => {
  test("editor settings dialog stays accessible within mobile viewport", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);

    await expect(
      page.getByText("デスクトップ環境でご利用ください"),
    ).toBeVisible({ timeout: 15_000 });

    const settingsButton = page.getByRole("button", {
      name: "記事設定を開く",
    });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    const dialog = page.getByRole("dialog", { name: "記事設定" });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByRole("tablist")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "保存" })).toBeVisible();
    await expectDialogWithinViewport(dialog);

    await page.keyboard.press("Tab");
    await expectFocusedWithin(dialog);

    await expectDialogCanCloseAndReopenFromTouchTrigger(settingsButton, dialog);

    await settingsButton.focus();
    await expect(settingsButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(settingsButton).toBeFocused();
  });
});
