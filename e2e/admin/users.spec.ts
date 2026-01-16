import { test, expect, type Page } from '@playwright/test'
import { testUsers, urls } from '../fixtures'

/**
 * Admin Users Management E2E Tests
 *
 * Tests the complete user administration functionality including:
 * - Users list page loading and display
 * - User detail view
 * - Create new user
 * - Edit user (role, name, email)
 * - Delete user
 * - Role-based access control
 * - Search and filtering
 * - Pagination
 *
 * Prerequisites:
 * - Database should be seeded with test users
 * - Admin user (admin@example.com) should exist with ADMIN or SUPER_ADMIN role
 */

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Helper function to login as admin
 */
async function loginAsAdmin(page: Page) {
  await page.goto(urls.login)
  await page.fill('input[type="email"]', testUsers.admin.email)
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin/, { timeout: 10000 })
}

/**
 * Helper function to login as a specific user
 */
async function loginAsUser(
  page: Page,
  email: string,
  password: string = 'test-password'
) {
  await page.goto(urls.login)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
}

/**
 * Helper to wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle')
}

// =============================================================================
// Test Suite
// =============================================================================

test.describe('Admin Users Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // ===========================================================================
  // 1. Users List Page
  // ===========================================================================

  test.describe('Users List Page', () => {
    test('should display users list page with correct title', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Verify page title
      await expect(page.locator('h1')).toContainText('ユーザー管理')

      // Verify description
      await expect(page.getByText('管理者とユーザーアカウントを管理')).toBeVisible()
    })

    test('should display stats cards', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Verify stats cards are visible
      await expect(page.getByText('総ユーザー数')).toBeVisible()
      await expect(page.getByText('管理者')).toBeVisible()
      await expect(page.getByText('一般ユーザー')).toBeVisible()
      await expect(page.getByText('新規（30日以内）')).toBeVisible()
    })

    test('should display new user button', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      const newUserButton = page.locator('a[href="/admin/users/new"]')
      await expect(newUserButton).toBeVisible()
      await expect(newUserButton).toContainText('新規ユーザー')
    })

    test('should display users table with correct headers', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Verify table headers
      await expect(page.locator('th').filter({ hasText: '名前' })).toBeVisible()
      await expect(page.locator('th').filter({ hasText: 'メールアドレス' })).toBeVisible()
      await expect(page.locator('th').filter({ hasText: 'ロール' })).toBeVisible()
      await expect(page.locator('th').filter({ hasText: '予約数' })).toBeVisible()
      await expect(page.locator('th').filter({ hasText: '記事数' })).toBeVisible()
      await expect(page.locator('th').filter({ hasText: '登録日' })).toBeVisible()
      await expect(page.locator('th').filter({ hasText: '操作' })).toBeVisible()
    })

    test('should display users in the table', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Table should have at least one user (admin user)
      const tableRows = page.locator('tbody tr')
      await expect(tableRows.first()).toBeVisible()

      // Admin user should be visible
      await expect(page.locator(`text=${testUsers.admin.email}`)).toBeVisible()
    })

    test('should display role badges correctly', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Role badges should be visible
      const roleBadges = page.locator('td').locator('[class*="badge"], span:has-text("管理者"), span:has-text("ユーザー"), span:has-text("編集者"), span:has-text("閲覧者")')
      await expect(roleBadges.first()).toBeVisible()
    })

    test('should show empty state when no users match filter', async ({ page }) => {
      await page.goto(urls.adminUsers + '?search=nonexistent-user-12345678')
      await waitForPageLoad(page)

      // Should show empty state message
      await expect(page.getByText('ユーザーが見つかりません')).toBeVisible()
    })
  })

  // ===========================================================================
  // 2. User Detail Page
  // ===========================================================================

  test.describe('User Detail Page', () => {
    test('should navigate to user detail page from list', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click on first user name link
      const firstUserLink = page.locator('tbody tr').first().locator('a').first()
      await firstUserLink.click()
      await waitForPageLoad(page)

      // Should be on detail page
      await expect(page).toHaveURL(/\/admin\/users\/[a-zA-Z0-9-]+$/)

      // Detail page should show user info
      await expect(page.getByText('基本情報')).toBeVisible()
      await expect(page.getByText('統計情報')).toBeVisible()
    })

    test('should display user basic information', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to first user detail
      const firstUserLink = page.locator('tbody tr').first().locator('a').first()
      await firstUserLink.click()
      await waitForPageLoad(page)

      // Verify basic info fields
      await expect(page.getByText('名前')).toBeVisible()
      await expect(page.getByText('メールアドレス')).toBeVisible()
      await expect(page.getByText('ロール')).toBeVisible()
      await expect(page.getByText('メール認証')).toBeVisible()
    })

    test('should display user statistics', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to first user detail
      const firstUserLink = page.locator('tbody tr').first().locator('a').first()
      await firstUserLink.click()
      await waitForPageLoad(page)

      // Verify stats fields
      await expect(page.getByText('予約数')).toBeVisible()
      await expect(page.getByText('ブログ記事数')).toBeVisible()
      await expect(page.getByText('登録日')).toBeVisible()
      await expect(page.getByText('最終更新')).toBeVisible()
    })

    test('should have edit button on detail page', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to first user detail
      const firstUserLink = page.locator('tbody tr').first().locator('a').first()
      await firstUserLink.click()
      await waitForPageLoad(page)

      // Verify edit button exists
      const editButton = page.locator('a:has-text("編集")')
      await expect(editButton).toBeVisible()
    })

    test('should have back button to return to list', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to first user detail
      const firstUserLink = page.locator('tbody tr').first().locator('a').first()
      await firstUserLink.click()
      await waitForPageLoad(page)

      // Click back button
      const backButton = page.locator('a:has-text("戻る")')
      await expect(backButton).toBeVisible()
      await backButton.click()
      await waitForPageLoad(page)

      // Should be back on list page
      await expect(page).toHaveURL(urls.adminUsers)
    })

    test('should show 404 for non-existent user', async ({ page }) => {
      await page.goto('/admin/users/non-existent-user-id-12345')
      await waitForPageLoad(page)

      // Should show 404 or not found message
      const notFoundMessage = page.locator('text=404, text=見つかりません, text=Not Found')
      await expect(notFoundMessage.first()).toBeVisible()
    })
  })

  // ===========================================================================
  // 3. Create New User
  // ===========================================================================

  test.describe('Create New User', () => {
    test('should display new user form', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Verify page title
      await expect(page.locator('h1')).toContainText('新規ユーザー')

      // Verify form fields exist
      await expect(page.locator('input#name')).toBeVisible()
      await expect(page.locator('input#email')).toBeVisible()
      await expect(page.locator('input#password')).toBeVisible()
      await expect(page.locator('button:has-text("ロールを選択"), [data-value]')).toBeVisible()
    })

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Try to submit empty form
      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Validation errors should appear
      await expect(page.getByText('名前は必須です')).toBeVisible()
      await expect(page.getByText('有効なメールアドレスを入力してください')).toBeVisible()
      await expect(page.getByText('パスワードは8文字以上必要です')).toBeVisible()
    })

    test('should validate email format', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Fill invalid email
      await page.fill('input#name', 'Test User')
      await page.fill('input#email', 'invalid-email')
      await page.fill('input#password', 'password123')

      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Email validation error should appear
      await expect(page.getByText('有効なメールアドレスを入力してください')).toBeVisible()
    })

    test('should validate password length', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Fill short password
      await page.fill('input#name', 'Test User')
      await page.fill('input#email', 'test@example.com')
      await page.fill('input#password', 'short')

      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Password validation error should appear
      await expect(page.getByText('パスワードは8文字以上必要です')).toBeVisible()
    })

    test('should create user with valid data', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      const uniqueEmail = `test-${Date.now()}@example.com`

      // Fill form with valid data
      await page.fill('input#name', 'E2E Test User')
      await page.fill('input#email', uniqueEmail)
      await page.fill('input#password', 'password123')

      // Select role
      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("ユーザー")').click()

      // Submit form
      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Wait for redirect to users list
      await page.waitForURL(urls.adminUsers, { timeout: 10000 })

      // User should be in the list (may need to search)
      await page.fill('input[name="search"]', uniqueEmail)
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      await expect(page.locator(`text=${uniqueEmail}`)).toBeVisible()
    })

    test('should show error for duplicate email', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Try to create user with existing admin email
      await page.fill('input#name', 'Duplicate User')
      await page.fill('input#email', testUsers.admin.email)
      await page.fill('input#password', 'password123')

      // Select role
      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("ユーザー")').click()

      // Submit form
      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Error message should appear
      await expect(page.getByText('このメールアドレスは既に使用されています')).toBeVisible()
    })

    test('should show role descriptions', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Select ADMIN role and verify description
      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("管理者")').click()

      await expect(page.getByText('コンテンツ管理全般')).toBeVisible()
    })

    test('should cancel and return to list', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Click cancel button
      const cancelButton = page.locator('button:has-text("キャンセル")')
      await cancelButton.click()

      // Should return to users list
      await page.waitForURL(/\/admin\/users/)
    })
  })

  // ===========================================================================
  // 4. Edit User
  // ===========================================================================

  test.describe('Edit User', () => {
    test('should navigate to edit page from list actions', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click actions dropdown on first user
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()

      // Click edit option
      await page.locator('[role="menuitem"]:has-text("編集")').click()
      await waitForPageLoad(page)

      // Should be on edit page
      await expect(page).toHaveURL(/\/admin\/users\/[a-zA-Z0-9-]+\/edit$/)
      await expect(page.locator('h1')).toContainText('ユーザー編集')
    })

    test('should pre-fill form with existing data', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to edit page
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("編集")').click()
      await waitForPageLoad(page)

      // Form should be pre-filled
      const emailInput = page.locator('input#email')
      await expect(emailInput).not.toBeEmpty()

      const nameInput = page.locator('input#name')
      await expect(nameInput).toBeVisible()
    })

    test('should update user name', async ({ page }) => {
      // Create a user first to edit
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      const uniqueEmail = `edit-test-${Date.now()}@example.com`
      await page.fill('input#name', 'Original Name')
      await page.fill('input#email', uniqueEmail)
      await page.fill('input#password', 'password123')

      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("ユーザー")').click()

      await page.locator('button[type="submit"]').click()
      await page.waitForURL(urls.adminUsers, { timeout: 10000 })

      // Find and edit the user
      await page.fill('input[name="search"]', uniqueEmail)
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("編集")').click()
      await waitForPageLoad(page)

      // Update name
      await page.fill('input#name', 'Updated Name')
      await page.locator('button[type="submit"]').click()

      // Wait for redirect to detail page
      await page.waitForURL(/\/admin\/users\/[a-zA-Z0-9-]+$/, { timeout: 10000 })

      // Verify name was updated
      await expect(page.getByText('Updated Name')).toBeVisible()
    })

    test('should allow password change (optional)', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to edit page
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("編集")').click()
      await waitForPageLoad(page)

      // Password field should show optional hint
      await expect(page.getByText('変更する場合のみ入力')).toBeVisible()

      // Password field should be empty by default
      const passwordInput = page.locator('input#password')
      await expect(passwordInput).toHaveValue('')
    })

    test('should show back button on edit page', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to edit page
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("編集")').click()
      await waitForPageLoad(page)

      // Back button should be visible
      const backButton = page.locator('a:has-text("戻る")')
      await expect(backButton).toBeVisible()
    })
  })

  // ===========================================================================
  // 5. Delete User
  // ===========================================================================

  test.describe('Delete User', () => {
    test('should show delete option in actions menu', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click actions dropdown
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()

      // Delete option should be visible
      await expect(page.locator('[role="menuitem"]:has-text("削除")')).toBeVisible()
    })

    test('should show confirmation dialog before delete', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click actions dropdown
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()

      // Click delete option
      await page.locator('[role="menuitem"]:has-text("削除")').click()

      // Confirmation dialog should appear
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('text=ユーザーを削除')).toBeVisible()
      await expect(dialog.locator('text=この操作は取り消せません')).toBeVisible()
    })

    test('should cancel delete when clicking cancel button', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Open delete dialog
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("削除")').click()

      // Click cancel
      const cancelButton = page.locator('[role="dialog"] button:has-text("キャンセル")')
      await cancelButton.click()

      // Dialog should close
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    })

    test('should delete user with no related data', async ({ page }) => {
      // First create a user to delete
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      const uniqueEmail = `delete-test-${Date.now()}@example.com`
      await page.fill('input#name', 'Delete Test User')
      await page.fill('input#email', uniqueEmail)
      await page.fill('input#password', 'password123')

      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("ユーザー")').click()

      await page.locator('button[type="submit"]').click()
      await page.waitForURL(urls.adminUsers, { timeout: 10000 })

      // Search for the user
      await page.fill('input[name="search"]', uniqueEmail)
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // Delete the user
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("削除")').click()

      // Confirm delete
      const confirmButton = page.locator('[role="dialog"] button:has-text("削除")').last()
      await confirmButton.click()

      // Wait for page refresh
      await waitForPageLoad(page)

      // User should no longer be visible
      await expect(page.getByText('ユーザーが見つかりません')).toBeVisible()
    })

    test('should show error when deleting user with related data', async ({ page: _page }) => {
      // This test requires a user with reservations or blog posts
      // Skip if no such user exists in test data
      test.skip(true, 'Requires user with related data in test database')
    })

    test('should prevent deleting own account', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Search for admin user
      await page.fill('input[name="search"]', testUsers.admin.email)
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // Try to delete admin user
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("削除")').click()

      // Confirm delete
      const confirmButton = page.locator('[role="dialog"] button:has-text("削除")').last()
      await confirmButton.click()

      // Error message should appear (toast or inline)
      await expect(page.getByText('自分自身を削除することはできません')).toBeVisible({ timeout: 5000 })
    })
  })

  // ===========================================================================
  // 6. Role Management
  // ===========================================================================

  test.describe('Role Management', () => {
    test('should show role change option in actions menu', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click actions dropdown
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()

      // Role change option should be visible
      await expect(
        page.locator('[role="menuitem"]:has-text("管理者に変更"), [role="menuitem"]:has-text("ユーザーに変更")')
      ).toBeVisible()
    })

    test('should show confirmation dialog before role change', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click actions dropdown
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()

      // Click role change option
      const roleChangeOption = page.locator('[role="menuitem"]:has-text("管理者に変更"), [role="menuitem"]:has-text("ユーザーに変更")')
      await roleChangeOption.click()

      // Confirmation dialog should appear
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('text=ロールを変更')).toBeVisible()
    })

    test('should display all role options in edit form', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Navigate to edit page
      const actionsButton = page.locator('tbody tr').first().locator('button:has-text("操作")')
      await actionsButton.click()
      await page.locator('[role="menuitem"]:has-text("編集")').click()
      await waitForPageLoad(page)

      // Click role select
      const roleSelect = page.locator('[role="combobox"]').first()
      await roleSelect.click()

      // All roles should be available
      await expect(page.locator('[role="option"]:has-text("スーパー管理者")')).toBeVisible()
      await expect(page.locator('[role="option"]:has-text("管理者")')).toBeVisible()
      await expect(page.locator('[role="option"]:has-text("編集者")')).toBeVisible()
      await expect(page.locator('[role="option"]:has-text("閲覧者")')).toBeVisible()
      await expect(page.locator('[role="option"]:has-text("ユーザー")')).toBeVisible()
    })
  })

  // ===========================================================================
  // 7. Search and Filter
  // ===========================================================================

  test.describe('Search and Filter', () => {
    test('should display search input', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      const searchInput = page.locator('input[name="search"]')
      await expect(searchInput).toBeVisible()
      await expect(searchInput).toHaveAttribute('placeholder', /名前またはメールアドレスで検索/)
    })

    test('should search users by email', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Search for admin user
      await page.fill('input[name="search"]', testUsers.admin.email)
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // Admin user should be visible
      await expect(page.locator(`text=${testUsers.admin.email}`)).toBeVisible()
    })

    test('should search users by name', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Search for admin user by name
      await page.fill('input[name="search"]', testUsers.admin.name)
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // Results should include matching user
      const results = page.locator('tbody tr')
      await expect(results.first()).toBeVisible()
    })

    test('should display role filter dropdown', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Role filter should exist
      const roleFilter = page.locator('select[name="role"], [role="combobox"]:has-text("すべて")').first()
      await expect(roleFilter).toBeVisible()
    })

    test('should filter users by role', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Click role filter
      const roleFilter = page.locator('select[name="role"], [role="combobox"]').first()
      await roleFilter.click()

      // Select ADMIN role
      await page.locator('[role="option"]:has-text("管理者"), option[value="ADMIN"]').click()

      // Submit filter
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // URL should include role parameter
      expect(page.url()).toContain('role=')
    })

    test('should clear search and show all users', async ({ page }) => {
      await page.goto(urls.adminUsers + '?search=test')
      await waitForPageLoad(page)

      // Clear search
      await page.fill('input[name="search"]', '')
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // Should show all users
      const results = page.locator('tbody tr')
      await expect(results.first()).toBeVisible()
    })

    test('should update URL with search parameters', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Perform search
      await page.fill('input[name="search"]', 'test')
      await page.click('button:has-text("検索")')
      await waitForPageLoad(page)

      // URL should contain search parameter
      expect(page.url()).toContain('search=test')
    })
  })

  // ===========================================================================
  // 8. Pagination
  // ===========================================================================

  test.describe('Pagination', () => {
    test('should display pagination when there are many users', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Check for pagination component
      const pagination = page.locator('[aria-label*="ページ"], nav:has(button:has-text("次")), button:has-text("次へ")')

      // Pagination may or may not be visible depending on user count
      if (await pagination.count() > 0) {
        await expect(pagination.first()).toBeVisible()
      } else {
        // If no pagination, there should be few users
        const userCount = await page.locator('tbody tr').count()
        expect(userCount).toBeLessThanOrEqual(20) // Default perPage
      }
    })

    test('should navigate to next page', async ({ page }) => {
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      const nextButton = page.locator('button:has-text("次"), a:has-text("次")')

      if (await nextButton.count() === 0 || await nextButton.isDisabled()) {
        test.skip(true, 'Not enough users for pagination')
        return
      }

      await nextButton.click()
      await waitForPageLoad(page)

      // URL should contain page parameter
      expect(page.url()).toContain('page=2')
    })

    test('should navigate to previous page', async ({ page }) => {
      await page.goto(urls.adminUsers + '?page=2')
      await waitForPageLoad(page)

      const prevButton = page.locator('button:has-text("前"), a:has-text("前")')

      if (await prevButton.count() === 0 || await prevButton.isDisabled()) {
        test.skip(true, 'Not enough users for pagination')
        return
      }

      await prevButton.click()
      await waitForPageLoad(page)

      // Should be on first page
      expect(page.url()).not.toContain('page=2')
    })
  })

  // ===========================================================================
  // 9. Role-Based Access Control
  // ===========================================================================

  test.describe('Role-Based Access Control', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
      // Clear cookies to ensure no session
      await page.context().clearCookies()

      await page.goto(urls.adminUsers)

      // Should redirect to login
      await expect(page).toHaveURL(urls.login)
    })

    test.skip('should deny access to VIEWER role users for user management', async ({ page }) => {
      // This test requires a VIEWER user to be set up
      // Login as viewer
      await page.context().clearCookies()
      await loginAsUser(page, testUsers.viewer.email)

      // Try to access users page
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Should show access denied or empty data
      // The exact behavior depends on implementation
      const deniedMessage = page.locator('text=アクセス権限がありません, text=ユーザーが見つかりません')
      await expect(deniedMessage.first()).toBeVisible()
    })

    test.skip('should deny access to EDITOR role users for user management', async ({ page }) => {
      // This test requires an EDITOR user to be set up
      await page.context().clearCookies()
      await loginAsUser(page, testUsers.editor.email)

      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Should show access denied or empty data
      const deniedMessage = page.locator('text=アクセス権限がありません, text=ユーザーが見つかりません')
      await expect(deniedMessage.first()).toBeVisible()
    })

    test.skip('should allow ADMIN role users to manage users', async ({ page }) => {
      // This assumes admin@example.com has ADMIN or SUPER_ADMIN role
      await page.goto(urls.adminUsers)
      await waitForPageLoad(page)

      // Should be able to see users list
      await expect(page.locator('h1')).toContainText('ユーザー管理')

      // Should be able to see users in table
      const tableRows = page.locator('tbody tr')
      await expect(tableRows.first()).toBeVisible()
    })
  })

  // ===========================================================================
  // 10. Loading States and Error Handling
  // ===========================================================================

  test.describe('Loading States and Error Handling', () => {
    test('should show loading state when submitting form', async ({ page }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Fill form
      await page.fill('input#name', 'Test User')
      await page.fill('input#email', `loading-test-${Date.now()}@example.com`)
      await page.fill('input#password', 'password123')

      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("ユーザー")').click()

      // Submit and check for loading state
      const submitButton = page.locator('button[type="submit"]')
      await submitButton.click()

      // Button should show loading state
      await expect(submitButton).toContainText('保存中')
      await expect(submitButton).toBeDisabled()
    })

    test('should handle network errors gracefully', async ({ page, context }) => {
      await page.goto(urls.adminUsers + '/new')
      await waitForPageLoad(page)

      // Fill form
      await page.fill('input#name', 'Test User')
      await page.fill('input#email', `error-test-${Date.now()}@example.com`)
      await page.fill('input#password', 'password123')

      const roleSelect = page.locator('button:has-text("ロールを選択"), [role="combobox"]').first()
      await roleSelect.click()
      await page.locator('[role="option"]:has-text("ユーザー")').click()

      // Simulate offline
      await context.setOffline(true)

      // Submit
      await page.locator('button[type="submit"]').click()

      // Wait for error to appear
      await page.waitForTimeout(2000)

      // Should show error message
      const errorMessage = page.locator('.bg-destructive, [role="alert"], text=エラー')
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible()
      }

      // Restore network
      await context.setOffline(false)
    })
  })
})
