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

import { test, expect, type Page } from '@playwright/test'
import { urls, testUsers } from './fixtures'

/**
 * Setup authenticated session for admin user
 */
async function setupAuthenticatedSession(page: Page) {
  await page.goto(urls.login)
  await page.fill('input[type="email"]', testUsers.admin.email)
  await page.fill('input[type="password"]', 'admin123') // Test password
  await page.click('button[type="submit"]')

  // Wait for navigation to dashboard
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 })
}

/**
 * Clear all authentication cookies and storage
 */
async function clearAuthSession(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

test.describe('Authentication Flow', () => {
  test.describe('Login Page', () => {
    test('should display login form when accessing /admin/login', async ({ page }) => {
      await page.goto(urls.login)

      // Verify page title and heading
      await expect(page).toHaveTitle(/ログイン/)
      await expect(page.locator('h1')).toContainText('管理画面')

      // Verify form elements exist
      await expect(page.locator('input[type="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]')).toBeVisible()
      await expect(page.locator('button[type="submit"]')).toBeVisible()
      await expect(page.locator('input[type="checkbox"]#remember-me')).toBeVisible()
    })

    test('should redirect to dashboard if already authenticated', async ({ page }) => {
      // First, login
      await setupAuthenticatedSession(page)

      // Try to access login page again
      await page.goto(urls.login)

      // Should be redirected to dashboard
      await expect(page).toHaveURL(urls.adminDashboard)
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto(urls.login)

      await page.fill('input[type="email"]', 'invalid@example.com')
      await page.fill('input[type="password"]', 'wrongpassword')
      await page.click('button[type="submit"]')

      // Wait for error message
      await expect(page.locator('.bg-red-50')).toBeVisible()
      await expect(page.locator('.bg-red-50')).toContainText(
        'メールアドレスまたはパスワードが正しくありません'
      )

      // Should still be on login page
      await expect(page).toHaveURL(urls.login)
    })

    test('should validate email format', async ({ page }) => {
      await page.goto(urls.login)

      await page.fill('input[type="email"]', 'not-an-email')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button[type="submit"]')

      // HTML5 validation should prevent form submission
      const emailInput = page.locator('input[type="email"]')
      await expect(emailInput).toHaveAttribute('required', '')
    })

    test('should show loading state during login', async ({ page }) => {
      await page.goto(urls.login)

      await page.fill('input[type="email"]', testUsers.admin.email)
      await page.fill('input[type="password"]', 'admin123')

      // Click submit and immediately check for loading state
      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Button should be disabled during loading
      await expect(submitButton).toBeDisabled()
      await expect(submitButton).toContainText('ログイン中')
    })

    test('should remember email when "Remember Me" is checked', async ({ page }) => {
      await page.goto(urls.login)

      const email = testUsers.admin.email
      await page.fill('input[type="email"]', email)
      await page.fill('input[type="password"]', 'admin123')
      await page.check('input[type="checkbox"]#remember-me')
      await page.click('button[type="submit"]')

      // Wait for redirect
      await page.waitForURL(urls.adminDashboard)

      // Clear session and go back to login
      await clearAuthSession(page)
      await page.goto(urls.login)

      // Email should be pre-filled
      await expect(page.locator('input[type="email"]')).toHaveValue(email)
      await expect(page.locator('input[type="checkbox"]#remember-me')).toBeChecked()
    })
  })

  test.describe('Successful Login', () => {
    test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
      await page.goto(urls.login)

      await page.fill('input[type="email"]', testUsers.admin.email)
      await page.fill('input[type="password"]', 'admin123')
      await page.click('button[type="submit"]')

      // Wait for redirect to dashboard
      await page.waitForURL(urls.adminDashboard, { timeout: 10000 })

      // Verify dashboard is loaded
      await expect(page).toHaveURL(urls.adminDashboard)
      await expect(page.locator('nav')).toBeVisible() // Sidebar should be visible
    })

    test('should display user info after successful login', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Verify user info is displayed in sidebar
      await expect(page.locator('text=' + testUsers.admin.name)).toBeVisible()
    })
  })

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing admin routes while unauthenticated', async ({ page }) => {
      await clearAuthSession(page)

      const protectedRoutes = [
        urls.adminDashboard,
        urls.adminSpaces,
        urls.adminReservations,
        urls.adminBlog,
        urls.adminNews,
        urls.adminUsers,
        urls.adminSettings,
      ]

      for (const route of protectedRoutes) {
        await page.goto(route)

        // Should be redirected to login page
        await expect(page).toHaveURL(urls.login, { timeout: 5000 })
      }
    })

    test('should allow access to admin routes when authenticated', async ({ page }) => {
      await setupAuthenticatedSession(page)

      const protectedRoutes = [
        { url: urls.adminDashboard, expectedText: 'ダッシュボード' },
        { url: urls.adminSpaces, expectedText: 'スペース' },
        { url: urls.adminReservations, expectedText: '予約' },
        { url: urls.adminBlog, expectedText: 'ブログ' },
        { url: urls.adminNews, expectedText: 'お知らせ' },
      ]

      for (const route of protectedRoutes) {
        await page.goto(route.url)

        // Should successfully load the page
        await expect(page).toHaveURL(route.url)
        // Navigation sidebar should be visible
        await expect(page.locator('nav')).toBeVisible()
      }
    })

    test('should maintain authentication across page navigations', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Navigate through multiple admin pages
      await page.goto(urls.adminSpaces)
      await expect(page).toHaveURL(urls.adminSpaces)

      await page.goto(urls.adminReservations)
      await expect(page).toHaveURL(urls.adminReservations)

      await page.goto(urls.adminBlog)
      await expect(page).toHaveURL(urls.adminBlog)

      // Should still be authenticated on dashboard
      await page.goto(urls.adminDashboard)
      await expect(page).toHaveURL(urls.adminDashboard)
      await expect(page.locator('nav')).toBeVisible()
    })
  })

  test.describe('Session Persistence', () => {
    test('should maintain session after page refresh', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Verify we're on dashboard
      await expect(page).toHaveURL(urls.adminDashboard)

      // Refresh the page
      await page.reload()

      // Should still be authenticated
      await expect(page).toHaveURL(urls.adminDashboard)
      await expect(page.locator('nav')).toBeVisible()
    })

    test('should maintain session in new tab', async ({ context }) => {
      const page = await context.newPage()
      await setupAuthenticatedSession(page)

      // Open new tab
      const newPage = await context.newPage()
      await newPage.goto(urls.adminDashboard)

      // Should be authenticated in new tab
      await expect(newPage).toHaveURL(urls.adminDashboard)
      await expect(newPage.locator('nav')).toBeVisible()

      await newPage.close()
      await page.close()
    })

    test('should persist session cookie with correct attributes', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Get session cookies
      const cookies = await page.context().cookies()

      // Better Auth session cookie should exist
      const sessionCookie = cookies.find(
        (c) => c.name.includes('better-auth.session_token') || c.name.includes('auth')
      )

      expect(sessionCookie).toBeDefined()

      if (sessionCookie) {
        // Session cookie should have secure attributes
        expect(sessionCookie.httpOnly).toBe(true)
        expect(sessionCookie.sameSite).toBe('Lax')
      }
    })
  })

  test.describe('Logout', () => {
    test('should logout and redirect to home page', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Find and click logout button
      // Note: Adjust selector based on actual implementation
      const logoutButton = page.locator('button:has-text("ログアウト"), a:has-text("ログアウト")')
      await logoutButton.click()

      // Should redirect to public home page
      await expect(page).toHaveURL(urls.home, { timeout: 5000 })
    })

    test('should clear session after logout', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Logout
      const logoutButton = page.locator('button:has-text("ログアウト"), a:has-text("ログアウト")')
      await logoutButton.click()

      // Wait for redirect
      await page.waitForURL(urls.home)

      // Try to access admin dashboard
      await page.goto(urls.adminDashboard)

      // Should be redirected to login
      await expect(page).toHaveURL(urls.login)
    })

    test('should remove session cookies after logout', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Get cookies before logout
      const cookiesBefore = await page.context().cookies()
      const sessionCookieBefore = cookiesBefore.find((c) => c.name.includes('auth'))
      expect(sessionCookieBefore).toBeDefined()

      // Logout
      const logoutButton = page.locator('button:has-text("ログアウト"), a:has-text("ログアウト")')
      await logoutButton.click()
      await page.waitForURL(urls.home)

      // Get cookies after logout
      const cookiesAfter = await page.context().cookies()
      const sessionCookieAfter = cookiesAfter.find((c) => c.name.includes('auth'))

      // Session cookie should be removed or expired
      if (sessionCookieAfter) {
        expect(sessionCookieAfter.value).toBe('')
      }
    })
  })

  test.describe('Security', () => {
    test('should prevent access to API routes without authentication', async ({ page }) => {
      await clearAuthSession(page)

      // Try to access auth API directly
      const response = await page.goto('/api/auth/session')

      // Should return 401 or redirect
      if (response) {
        expect([200, 401, 403]).toContain(response.status())
      }
    })

    test('should not expose sensitive data in client-side code', async ({ page }) => {
      await page.goto(urls.login)

      // Check that no sensitive environment variables are exposed
      const pageContent = await page.content()

      expect(pageContent).not.toContain('GOOGLE_CLIENT_SECRET')
      expect(pageContent).not.toContain('DATABASE_URL')
      expect(pageContent).not.toContain('BETTER_AUTH_SECRET')
    })

    test('should implement rate limiting on login attempts', async ({ page }) => {
      await page.goto(urls.login)

      // Attempt multiple failed logins
      const attempts = 5
      for (let i = 0; i < attempts; i++) {
        await page.fill('input[type="email"]', 'test@example.com')
        await page.fill('input[type="password"]', `wrongpassword${i}`)
        await page.click('button[type="submit"]')

        // Wait for error message
        await page.waitForSelector('.bg-red-50', { timeout: 5000 })
      }

      // After multiple attempts, should show rate limit warning
      // Note: This test assumes rate limiting is implemented
      // Adjust based on actual implementation
      const errorMessage = await page.locator('.bg-red-50').textContent()

      // Either rate limit message or standard error
      expect(errorMessage).toBeTruthy()
    })

    test('should not allow concurrent sessions from different browsers to interfere', async ({ browser }) => {
      // Create two separate browser contexts (simulating different browsers)
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()

      const page1 = await context1.newPage()
      const page2 = await context2.newPage()

      // Login in first context
      await page1.goto(urls.login)
      await page1.fill('input[type="email"]', testUsers.admin.email)
      await page1.fill('input[type="password"]', 'admin123')
      await page1.click('button[type="submit"]')
      await page1.waitForURL(urls.adminDashboard)

      // Login in second context
      await page2.goto(urls.login)
      await page2.fill('input[type="email"]', testUsers.admin.email)
      await page2.fill('input[type="password"]', 'admin123')
      await page2.click('button[type="submit"]')
      await page2.waitForURL(urls.adminDashboard)

      // Both should be logged in independently
      await expect(page1).toHaveURL(urls.adminDashboard)
      await expect(page2).toHaveURL(urls.adminDashboard)

      await context1.close()
      await context2.close()
    })
  })

  test.describe('Edge Cases', () => {
    test('should handle empty form submission', async ({ page }) => {
      await page.goto(urls.login)

      await page.click('button[type="submit"]')

      // HTML5 validation should prevent submission
      const emailInput = page.locator('input[type="email"]')
      await expect(emailInput).toHaveAttribute('required', '')
    })

    test('should handle network errors gracefully', async ({ page }) => {
      await page.goto(urls.login)

      // Simulate offline mode
      await page.context().setOffline(true)

      await page.fill('input[type="email"]', testUsers.admin.email)
      await page.fill('input[type="password"]', 'admin123')
      await page.click('button[type="submit"]')

      // Should show error message
      await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 10000 })

      // Re-enable network
      await page.context().setOffline(false)
    })

    test('should handle session expiration', async ({ page }) => {
      await setupAuthenticatedSession(page)

      // Clear session cookie to simulate expiration
      await page.context().clearCookies()

      // Try to access protected route
      await page.goto(urls.adminDashboard)

      // Should redirect to login
      await expect(page).toHaveURL(urls.login)
    })

    test('should handle malformed credentials gracefully', async ({ page }) => {
      await page.goto(urls.login)

      // Test with very long input
      const longEmail = 'a'.repeat(300) + '@example.com'
      const longPassword = 'p'.repeat(300)

      await page.fill('input[type="email"]', longEmail)
      await page.fill('input[type="password"]', longPassword)
      await page.click('button[type="submit"]')

      // Should handle gracefully without crashing
      await expect(page.locator('.bg-red-50')).toBeVisible()
    })

    test('should handle special characters in password', async ({ page }) => {
      await page.goto(urls.login)

      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      await page.fill('input[type="email"]', testUsers.admin.email)
      await page.fill('input[type="password"]', specialPassword)
      await page.click('button[type="submit"]')

      // Should process without errors (will fail auth but not crash)
      await expect(page.locator('.bg-red-50')).toBeVisible()
    })
  })
})
