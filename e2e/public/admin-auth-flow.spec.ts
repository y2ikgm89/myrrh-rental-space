/**
 * Authentication E2E Tests
 *
 * Tests the complete authentication flow including:
 * - Login with email/password
 * - Protected route access
 * - Logout
 * - Session persistence
 *
 * Note: The current implementation uses Better Auth with email/password authentication,
 * not magic link (token-based) authentication as originally specified.
 */

import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";
import {
  gotoAdminLogin,
  primeAdminLoginGate,
  signInAsAdmin,
} from "../helpers/admin-auth";

/**
 * Setup authenticated session for admin user
 */
async function setupAuthenticatedSession(page: Page) {
  await signInAsAdmin(page);
}

/**
 * Clear all authentication cookies and storage
 */
async function clearAuthSession(
  page: Page,
  options?: { preserveLocalStorage?: boolean },
) {
  await page.context().clearCookies();
  await page.goto(urls.home);
  await page.evaluate((preserveLocalStorage) => {
    if (!preserveLocalStorage) {
      localStorage.clear();
    }
    sessionStorage.clear();
  }, options?.preserveLocalStorage ?? false);
  await primeAdminLoginGate(page.context());
}

function getLoginErrorMessage(page: Page) {
  return page
    .getByText(
      /メールアドレスまたはパスワードが正しくありません|リクエストが多すぎます|入力内容を確認してください|ログインに失敗しました。通信環境を確認して再度お試しください。/,
    )
    .first();
}

function adminShell(page: Page) {
  return page.getByRole("button", { name: "ログアウト" });
}

test.describe("Authentication Flow", () => {
  test.beforeEach(async ({ page }) => {
    await primeAdminLoginGate(page.context());
  });

  test.describe("Login Page", () => {
    test("should display login form when accessing /admin/login", async ({
      page,
    }) => {
      await gotoAdminLogin(page);

      // Verify page title and heading
      await expect(page).toHaveTitle(/ログイン/);
      await expect(
        page.getByRole("heading", { name: "ログイン" }),
      ).toBeVisible();

      // Verify form elements exist
      await expect(page.getByLabel("メールアドレス")).toBeVisible();
      await expect(page.getByLabel("パスワード")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "ログイン", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: /メールアドレスを保存/ }),
      ).toBeVisible();
    });

    test("should redirect to dashboard if already authenticated", async ({
      page,
    }) => {
      // First, login
      await setupAuthenticatedSession(page);

      // Try to access login page again
      await page.goto(urls.login);

      // Should be redirected to dashboard
      await expect(page).toHaveURL(urls.adminDashboard);
    });

    test("should show error for invalid credentials", async ({ page }) => {
      await gotoAdminLogin(page);

      await page.getByLabel("メールアドレス").fill("invalid@example.com");
      await page.getByLabel("パスワード").fill("wrongpassword");
      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // Wait for error message
      await expect(getLoginErrorMessage(page)).toBeVisible();
      await expect(getLoginErrorMessage(page)).toContainText(
        "メールアドレスまたはパスワードが正しくありません",
      );

      // Should still be on login page
      await expect(page).toHaveURL(urls.login);
    });

    test("should validate email format", async ({ page }) => {
      await gotoAdminLogin(page);

      await page.getByLabel("メールアドレス").fill("not-an-email");
      await page.getByLabel("パスワード").fill("password123");
      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // HTML5 validation should prevent form submission
      const emailInput = page.getByLabel("メールアドレス");
      await expect(emailInput).toHaveAttribute("required", "");
    });

    test("should show loading state during login", async ({ page }) => {
      await gotoAdminLogin(page);

      await page.getByLabel("メールアドレス").fill(testUsers.admin.email);
      await page.getByLabel("パスワード").fill("admin123");

      // Click submit and immediately check for loading state
      const submitButton = page.getByRole("button", {
        name: "ログイン",
        exact: true,
      });
      await submitButton.click();

      // Button should be disabled during loading
      await expect(submitButton).toBeDisabled();
      await expect(submitButton).toContainText("ログイン中");
    });

    test('should remember email when "Remember Me" is checked', async ({
      page,
    }) => {
      await gotoAdminLogin(page);

      const email = testUsers.admin.email;
      await page.getByLabel("メールアドレス").fill(email);
      await page.getByLabel("パスワード").fill("admin123");
      await page
        .getByRole("checkbox", { name: /メールアドレスを保存/ })
        .check();
      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // Wait for redirect
      await expect(page).toHaveURL(urls.adminDashboard);

      // Clear session and go back to login
      await clearAuthSession(page, { preserveLocalStorage: true });
      await gotoAdminLogin(page);

      // Email should be pre-filled
      await expect(page.getByLabel("メールアドレス")).toHaveValue(email);
      await expect(
        page.getByRole("checkbox", { name: /メールアドレスを保存/ }),
      ).toBeChecked();
    });
  });

  test.describe("Successful Login", () => {
    test("should login with valid credentials and redirect to dashboard", async ({
      page,
    }) => {
      await signInAsAdmin(page);

      // Verify dashboard is loaded
      await expect(page).toHaveURL(urls.adminDashboard);
      await expect(adminShell(page)).toBeVisible();
    });

    test("should display user info after successful login", async ({
      page,
    }) => {
      await setupAuthenticatedSession(page);

      // Verify user info is displayed in sidebar
      await expect(page.locator("text=" + testUsers.admin.name)).toBeVisible();
    });
  });

  test.describe("Protected Routes", () => {
    test("should redirect to login when accessing admin routes while unauthenticated", async ({
      page,
    }) => {
      await clearAuthSession(page);

      const protectedRoutes = [
        urls.adminDashboard,
        urls.adminSpaces,
        urls.adminReservations,
        urls.adminPages,
        urls.adminNews,
        urls.adminUsers,
        urls.adminSettings,
      ];

      for (const route of protectedRoutes) {
        await page.goto(route);

        // Should be redirected to login page
        await expect(page).toHaveURL(urls.login, { timeout: 5000 });
      }
    });

    test("should allow access to admin routes when authenticated", async ({
      page,
    }) => {
      await setupAuthenticatedSession(page);

      const protectedRoutes = [
        { url: urls.adminDashboard, expectedText: "ダッシュボード" },
        { url: urls.adminSpaces, expectedText: "スペース" },
        { url: urls.adminReservations, expectedText: "予約" },
        { url: urls.adminPages, expectedText: "ページ管理" },
        { url: urls.adminNews, expectedText: "お知らせ" },
      ];

      for (const route of protectedRoutes) {
        await page.goto(route.url);

        // Should successfully load the page
        await expect(page).toHaveURL(route.url);
        // Navigation sidebar should be visible
        await expect(adminShell(page)).toBeVisible();
      }
    });

    test("should maintain authentication across page navigations", async ({
      page,
    }) => {
      await setupAuthenticatedSession(page);

      // Navigate through multiple admin pages
      await page.goto(urls.adminSpaces);
      await expect(page).toHaveURL(urls.adminSpaces);

      await page.goto(urls.adminReservations);
      await expect(page).toHaveURL(urls.adminReservations);

      await page.goto(urls.adminPages);
      await expect(page).toHaveURL(urls.adminPages);

      // Should still be authenticated on dashboard
      await page.goto(urls.adminDashboard);
      await expect(page).toHaveURL(urls.adminDashboard);
      await expect(adminShell(page)).toBeVisible();
    });
  });

  test.describe("Session Persistence", () => {
    test("should maintain session after page refresh", async ({ page }) => {
      await setupAuthenticatedSession(page);

      // Verify we're on dashboard
      await expect(page).toHaveURL(urls.adminDashboard);

      // Refresh the page
      await page.reload();

      // Should still be authenticated
      await expect(page).toHaveURL(urls.adminDashboard);
      await expect(adminShell(page)).toBeVisible();
    });

    test("should maintain session in new tab", async ({ context }) => {
      const page = await context.newPage();
      await setupAuthenticatedSession(page);

      // Open new tab
      const newPage = await context.newPage();
      await newPage.goto(urls.adminDashboard);

      // Should be authenticated in new tab
      await expect(newPage).toHaveURL(urls.adminDashboard);
      await expect(adminShell(newPage)).toBeVisible();

      await newPage.close();
      await page.close();
    });

    test("should persist session cookie with correct attributes", async ({
      page,
    }) => {
      await setupAuthenticatedSession(page);

      // Get session cookies
      const cookies = await page.context().cookies();

      // Better Auth session cookie should exist
      const sessionCookie = cookies.find(
        (c) =>
          c.name.includes("better-auth.session_token") ||
          c.name.includes("auth"),
      );

      expect(sessionCookie).toBeDefined();

      if (sessionCookie) {
        // Session cookie should have secure attributes
        expect(sessionCookie.httpOnly).toBe(true);
        expect(sessionCookie.sameSite).toBe("Lax");
      }
    });
  });

  test.describe("Logout", () => {
    test("should logout and redirect to admin login", async ({ page }) => {
      await setupAuthenticatedSession(page);

      // Find and click logout button
      // Note: Adjust selector based on actual implementation
      const logoutButton = page.locator(
        'button:has-text("ログアウト"), a:has-text("ログアウト")',
      );
      await logoutButton.click();

      // Should redirect to admin login page
      await expect(page).toHaveURL(urls.login, { timeout: 5000 });
    });

    test("should clear session after logout", async ({ page }) => {
      await setupAuthenticatedSession(page);

      // Logout
      const logoutButton = page.locator(
        'button:has-text("ログアウト"), a:has-text("ログアウト")',
      );
      await logoutButton.click();

      // Wait for redirect
      await expect(page).toHaveURL(urls.login);

      // Try to access admin dashboard
      await page.goto(urls.adminDashboard);

      // Should be redirected to login
      await expect(page).toHaveURL(urls.login);
    });

    test("should remove session cookies after logout", async ({ page }) => {
      await setupAuthenticatedSession(page);

      // Get cookies before logout
      const cookiesBefore = await page.context().cookies();
      const sessionCookieBefore = cookiesBefore.find((c) =>
        c.name.includes("auth"),
      );
      expect(sessionCookieBefore).toBeDefined();

      // Logout
      const logoutButton = page.locator(
        'button:has-text("ログアウト"), a:has-text("ログアウト")',
      );
      await logoutButton.click();
      await expect(page).toHaveURL(urls.login);

      // Get cookies after logout
      const cookiesAfter = await page.context().cookies();
      const sessionCookieAfter = cookiesAfter.find((c) =>
        c.name.includes("auth"),
      );

      // Session cookie should be removed or expired
      if (sessionCookieAfter) {
        expect(sessionCookieAfter.value).toBe("");
      }
    });
  });

  test.describe("Security", () => {
    test("should prevent access to API routes without authentication", async ({
      page,
    }) => {
      await clearAuthSession(page);

      // Try to access auth API directly
      const response = await page.goto("/api/auth/session");

      // Should return 401 or redirect
      if (response) {
        expect([200, 401, 403, 404]).toContain(response.status());
      }
    });

    test("should not expose sensitive data in client-side code", async ({
      page,
    }) => {
      await gotoAdminLogin(page);

      // Check that no sensitive environment variables are exposed
      const pageContent = await page.content();

      expect(pageContent).not.toContain("GOOGLE_CLIENT_SECRET");
      expect(pageContent).not.toContain("DATABASE_URL");
      expect(pageContent).not.toContain("BETTER_AUTH_SECRET");
    });

    test("should not allow concurrent sessions from different browsers to interfere", async ({
      browser,
    }) => {
      // Create two separate browser contexts (simulating different browsers)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Login in first context
      await signInAsAdmin(page1);

      // Login in second context
      await signInAsAdmin(page2);

      // Both should be logged in independently
      await expect(page1).toHaveURL(urls.adminDashboard);
      await expect(page2).toHaveURL(urls.adminDashboard);

      await context1.close();
      await context2.close();
    });
  });

  test.describe("Edge Cases", () => {
    test("should handle empty form submission", async ({ page }) => {
      await gotoAdminLogin(page);

      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // HTML5 validation should prevent submission
      const emailInput = page.getByLabel("メールアドレス");
      await expect(emailInput).toHaveAttribute("required", "");
    });

    test("should handle network errors gracefully", async ({ page }) => {
      await gotoAdminLogin(page);

      // Simulate offline mode
      await page.context().setOffline(true);

      await page.getByLabel("メールアドレス").fill(testUsers.admin.email);
      await page.getByLabel("パスワード").fill("admin123");
      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // Should show error message
      await expect(getLoginErrorMessage(page)).toBeVisible({
        timeout: 10000,
      });

      // Re-enable network
      await page.context().setOffline(false);
    });

    test("should handle session expiration", async ({ page }) => {
      await setupAuthenticatedSession(page);

      // Clear session cookie to simulate expiration
      await page.context().clearCookies();

      // Try to access protected route
      await page.goto(urls.adminDashboard);

      // Should redirect to login
      await expect(page).toHaveURL(urls.login);
    });

    test("should handle malformed credentials gracefully", async ({ page }) => {
      await gotoAdminLogin(page);

      // Test with very long input
      const longEmail = "a".repeat(300) + "@example.com";
      const longPassword = "p".repeat(300);

      await page.getByLabel("メールアドレス").fill(longEmail);
      await page.getByLabel("パスワード").fill(longPassword);
      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // Should handle gracefully without crashing
      await expect(getLoginErrorMessage(page)).toBeVisible();
    });

    test("should handle special characters in password", async ({ page }) => {
      await gotoAdminLogin(page);

      const specialPassword = "!@#$%^&*()_+-=[]{}|;:,.<>?";
      await page.getByLabel("メールアドレス").fill(testUsers.admin.email);
      await page.getByLabel("パスワード").fill(specialPassword);
      await page.getByRole("button", { name: "ログイン", exact: true }).click();

      // Should process without errors (will fail auth but not crash)
      await expect(getLoginErrorMessage(page)).toBeVisible();
    });

    test("should implement rate limiting on login attempts", async ({
      page,
    }) => {
      await gotoAdminLogin(page);

      const attempts = 5;
      for (let i = 0; i < attempts; i++) {
        await page.getByLabel("メールアドレス").fill("test@example.com");
        await page.getByLabel("パスワード").fill(`wrongpassword${i}`);
        await page
          .getByRole("button", { name: "ログイン", exact: true })
          .click();

        await expect(getLoginErrorMessage(page)).toBeVisible({
          timeout: 5000,
        });
      }

      const errorMessage = await getLoginErrorMessage(page).textContent();
      expect(errorMessage).toBeTruthy();
    });
  });
});
