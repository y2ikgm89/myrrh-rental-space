import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";
import { primeAdminRequestContext, signInAsAdmin } from "../helpers/admin-auth";

const appSurface = process.env["APP_SURFACE"] ?? "admin";

function emailTextbox(page: Page) {
  return page.getByRole("textbox", { name: "メールアドレス" });
}

test.describe("admin IAP-only access boundary", () => {
  test.beforeEach(async ({ page }) => {
    await primeAdminRequestContext(page.context());
  });

  test("admin surface opens /admin without an app password form", async ({
    page,
  }) => {
    test.skip(appSurface !== "admin", "admin service behavior only");

    await signInAsAdmin(page);

    await expect(page).toHaveURL(urls.adminDashboard);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(emailTextbox(page)).toBeHidden();
    await expect(page.getByLabel("パスワード")).toBeHidden();
  });

  test("/admin/login never renders an app password login", async ({ page }) => {
    const response = await page.goto("/admin/login");

    if (appSurface === "public") {
      expect(response?.status()).toBe(404);
      await expect(emailTextbox(page)).toBeHidden();
      await expect(page.getByLabel("パスワード")).toBeHidden();
      return;
    }

    await expect(page).toHaveURL(urls.adminDashboard);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(emailTextbox(page)).toBeHidden();
    await expect(page.getByLabel("パスワード")).toBeHidden();
  });

  test("logout link delegates session clearing to IAP", async ({ page }) => {
    test.skip(appSurface !== "admin", "admin service behavior only");

    await signInAsAdmin(page);

    await expect(
      page.getByRole("link", { name: "ログアウト" }),
    ).toHaveAttribute("href", "/admin?gcp-iap-mode=CLEAR_LOGIN_COOKIE");
  });
});
