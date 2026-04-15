import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E テスト設定
 *
 * Playwright 公式の **storage state + setup project** パターンを採用し、
 * 認証を 1 度だけ実行して全テストで再利用する。
 * 参照: https://playwright.dev/docs/auth
 *
 * Project 構成:
 *   - setup-customer / setup-admin → 認証してストレージ保存
 *   - chromium                     → 未認証テスト（auth.spec.ts / 公開ページ smoke 等）
 *   - chromium-customer            → 顧客認証済みテスト（e2e/authenticated/*）
 *   - chromium-admin               → 管理者認証済みテスト（e2e/admin/* の一部）
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  /* Disable parallel execution to avoid database conflicts between tests */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,
  /* Single worker to ensure sequential test execution */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] || "http://localhost:3000",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Take screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    /* ===================================================================
     * Setup projects: 認証を 1 度だけ実行してストレージ保存
     * =================================================================== */
    {
      name: "setup-customer",
      testMatch: /e2e\/auth\/customer\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup-admin",
      testMatch: /e2e\/auth\/admin\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    /* ===================================================================
     * 未認証 project: 認証フロー自体のテスト + 公開ページ smoke
     * =================================================================== */
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /e2e\/auth\/.*\.setup\.ts/,
        /e2e\/authenticated\/.*/,
        /e2e\/visual\/.*/,
      ],
    },

    /* ===================================================================
     * 顧客認証済み project: マイページ・予約履歴・レビュー等
     * e2e/authenticated/customer/*.spec.ts のみマッチ
     * =================================================================== */
    {
      name: "chromium-customer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/customer.json",
      },
      dependencies: ["setup-customer"],
      testMatch: /e2e\/authenticated\/customer\/.*\.spec\.ts/,
    },

    /* ===================================================================
     * 管理者認証済み project: Lexical editor / 通知センター等
     * e2e/authenticated/admin/*.spec.ts のみマッチ
     * =================================================================== */
    {
      name: "chromium-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
      testMatch: /e2e\/authenticated\/admin\/.*\.spec\.ts/,
    },

    /* ===================================================================
     * Visual Regression project: toHaveScreenshot baseline
     * デフォルトは skip（PLAYWRIGHT_VISUAL=1 で opt-in 実行）
     * =================================================================== */
    {
      name: "chromium-visual",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /e2e\/visual\/.*\.spec\.ts/,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120 * 1000,
  },
});
