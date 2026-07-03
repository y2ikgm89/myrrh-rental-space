import { expect, test } from "@playwright/test";

test.describe("admin command palette dialog", () => {
  test("search trigger opens a named dialog and restores focus on Escape", async ({
    page,
  }) => {
    await page.goto("/admin");

    const trigger = page.getByRole("button", { name: "検索を開く" }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "コマンドパレット" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByPlaceholder("コマンドや検索キーワードを入力..."),
    ).toBeFocused();
    await expect(
      dialog.getByRole("option", { name: "ナビゲーション" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("keyboard shortcut opens the command palette with input focus", async ({
    page,
  }) => {
    await page.goto("/admin");

    const trigger = page.getByRole("button", { name: "検索を開く" }).first();
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("ControlOrMeta+K");

    const dialog = page.getByRole("dialog", { name: "コマンドパレット" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByPlaceholder("コマンドや検索キーワードを入力..."),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
