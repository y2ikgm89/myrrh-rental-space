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
 *   - chromium-customer            → 顧客認証済みテスト（e2e/authenticated/customer/*）
 *   - chromium-admin               → 管理者認証済みテスト（e2e/authenticated/admin/*）
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
     * Smoke project: 毎 push 実行する critical-path ゲート (< 3 分)
     * `e2e/smoke/*.smoke.spec.ts` のみを実行、未認証 / shared web server
     * dependencies: [] (setup-customer / setup-admin 不要)
     *
     * 業界標準: Stripe / Vercel / Linear / Shopify の "fast PR feedback smoke" pattern。
     * 広域 E2E (chromium project) は label opt-in、本 project のみ branch protection required。
     * =================================================================== */
    {
      name: "chromium-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /e2e\/smoke\/.*\.smoke\.spec\.ts/,
    },

    /* ===================================================================
     * 未認証 project: 認証フロー自体のテスト + 公開ページ広域カバレッジ
     * =================================================================== */
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /e2e\/auth\/.*\.setup\.ts/,
        /e2e\/authenticated\/.*/,
        /e2e\/visual\/.*/,
        /e2e\/smoke\/.*/,
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

  /* webServer:
   * - ローカル: `bun run dev` (Turbopack HMR、開発と同等の環境で spec を反復実行)
   * - CI: `bun run start` (production build artifact を起動。dev mode の Turbopack
   *   initial compile による spec timeout / runner CPU 枯渇を回避し安定化)
   *
   * production build でも DevLoginButton を CI で表示するため
   * `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` を build + start 両方に伝播させる。
   * staging / production には絶対に伝播させない (login bypass risk)。
   */
  webServer: {
    command: process.env["CI"] ? "bun run start" : "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 180 * 1000,
  },
});
