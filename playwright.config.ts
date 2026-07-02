import { defineConfig, devices } from "@playwright/test";
import { testUsers } from "./e2e/fixtures/test-data";

process.env["APP_SURFACE"] ??= "admin";

const localE2eBaseUrl =
  process.env["PLAYWRIGHT_BASE_URL"] || "http://localhost:3000";
const localE2eBetterAuthSecret =
  process.env["BETTER_AUTH_SECRET"] &&
  process.env["BETTER_AUTH_SECRET"].length >= 32
    ? process.env["BETTER_AUTH_SECRET"]
    : "local-e2e-better-auth-secret-000000";
const localE2eNextServerActionsEncryptionKey =
  process.env["NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"] ||
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const e2eWebServerCommand = [
  "bun run db:generate",
  "bun prisma/seed.ts --dev",
  ...(process.env["CI"] ? [] : ["bun run build:skip-env"]),
  "bun run start",
].join(" && ");

/**
 * Playwright E2E テスト設定
 *
 * 公式準拠の **storage state + setup project** ＋ **fullyParallel** パターン。
 * 規約 SSoT は `.agents/skills/e2e-test-quality`。
 *
 * Project 構成:
 *   - setup-customer / setup-admin → 認証してストレージ保存
 *   - chromium-smoke               → 毎 push 必須の critical-path gate (< 3 分)
 *   - chromium                     → 未認証テスト（公開 + 管理 IAP 境界 + a11y）
 *   - chromium-customer            → 顧客認証済テスト
 *   - chromium-admin               → 管理者認証済テスト
 *   - chromium-visual              → visual regression (opt-in)
 *
 * 並列化:
 *   `fullyParallel: true` で test レベル並列化。CI は 2 workers、local は
 *   共有 Next dev server / Postgres の枯渇を避けるため 1 worker に固定する。
 *   DB を書き換える特定の describe は各 spec 内で `test.describe.serial(...)`
 *   を局所適用して隔離する。
 *
 * @see https://playwright.dev/docs/test-configuration
 * @see https://playwright.dev/docs/test-parallel
 * @see https://playwright.dev/docs/auth
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,
  /* DB-backed admin/customer pages share one local Postgres and one Next
   * server. Keep parallelism bounded instead of letting Playwright default to
   * CPU-count workers, which can exhaust pg-pool during route rendering. */
  workers: process.env["CI"] ? 2 : 1,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: localE2eBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

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
     * `e2e/smoke/*.smoke.spec.ts` のみ。未認証 / setup 依存なし。
     * 業界標準: Stripe / Vercel / Linear / Shopify の "fast PR feedback smoke" pattern。
     * 広域 E2E (chromium) は label opt-in、本 project のみ branch protection required。
     * =================================================================== */
    {
      name: "chromium-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /e2e\/smoke\/.*\.smoke\.spec\.ts/,
    },

    /* ===================================================================
     * 未認証 project: 公開ページ + 管理 IAP 境界 + a11y
     * `e2e/public/*.spec.ts` および `e2e/a11y/*.spec.ts` を対象。
     * setup spec / 認証済 / visual / smoke は明示除外。
     * =================================================================== */
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: [/e2e\/public\/.*\.spec\.ts/, /e2e\/a11y\/.*\.spec\.ts/],
    },

    /* ===================================================================
     * 顧客認証済 project: マイページ・予約履歴・レビュー等
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
     * 管理者認証済 project: Lexical editor / 通知センター / 設定等
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
     * Visual Regression: toHaveScreenshot baseline (opt-in、PLAYWRIGHT_VISUAL=1)
     * =================================================================== */
    {
      name: "chromium-visual",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /e2e\/visual\/.*\.spec\.ts/,
    },
  ],

  /* webServer:
   * - local: `db:generate -> seed --dev -> build:skip-env -> start`
   * - CI: `db:generate -> seed --dev -> start` (workflow builds first)
   *
   * E2E は seed-driven specs を含み、Next `use cache` は server process 内で
   * null fallback も保持し得る。既存 server を再利用せず、seed 後の fresh
   * process だけを検証対象にする。
   *
   * production build でも顧客 DevLoginButton を CI で出すため
   * `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` を build + start 両方で渡す。
   * staging / production には絶対伝播させない (login bypass risk)。
   */
  webServer: {
    command: e2eWebServerCommand,
    url: localE2eBaseUrl,
    reuseExistingServer: false,
    timeout: 180 * 1000,
    env: {
      ...process.env,
      BETTER_AUTH_SECRET: localE2eBetterAuthSecret,
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
        localE2eNextServerActionsEncryptionKey,
      BETTER_AUTH_URL: process.env["BETTER_AUTH_URL"] ?? localE2eBaseUrl,
      NEXT_PUBLIC_BASE_URL:
        process.env["NEXT_PUBLIC_BASE_URL"] ?? localE2eBaseUrl,
      NEXT_PUBLIC_APP_URL:
        process.env["NEXT_PUBLIC_APP_URL"] ?? localE2eBaseUrl,
      NEXT_PUBLIC_ENABLE_E2E_LOGIN:
        process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] ?? "1",
      E2E_RUNTIME: "1",
      DATABASE_POOL_MAX: process.env["DATABASE_POOL_MAX"] ?? "30",
      DATABASE_CONNECTION_TIMEOUT_MS:
        process.env["DATABASE_CONNECTION_TIMEOUT_MS"] ?? "15000",
      APP_SURFACE: process.env["APP_SURFACE"] ?? "admin",
      ADMIN_APP_URL: process.env["ADMIN_APP_URL"] ?? localE2eBaseUrl,
      ADMIN_TEST_IAP_EMAIL:
        process.env["ADMIN_TEST_IAP_EMAIL"] ?? testUsers.admin.email,
      IAP_JWT_AUDIENCE:
        process.env["IAP_JWT_AUDIENCE"] ??
        "/projects/123456789012/locations/asia-northeast1/services/myrrh-rental-space-admin",
      ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL:
        process.env["ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"] ??
        "myrrh-super-admins@example.com",
      ADMIN_ROLE_GROUP_ADMIN_EMAIL:
        process.env["ADMIN_ROLE_GROUP_ADMIN_EMAIL"] ??
        "myrrh-admins@example.com",
      ADMIN_ROLE_GROUP_EDITOR_EMAIL:
        process.env["ADMIN_ROLE_GROUP_EDITOR_EMAIL"] ??
        "myrrh-editors@example.com",
      ADMIN_ROLE_GROUP_VIEWER_EMAIL:
        process.env["ADMIN_ROLE_GROUP_VIEWER_EMAIL"] ??
        "myrrh-viewers@example.com",
      ENCRYPTION_KEY: process.env["ENCRYPTION_KEY"] ?? "0".repeat(64),
      CRON_OIDC_AUDIENCE: process.env["CRON_OIDC_AUDIENCE"] ?? localE2eBaseUrl,
      CRON_SERVICE_ACCOUNT_EMAIL:
        process.env["CRON_SERVICE_ACCOUNT_EMAIL"] ??
        "scheduler-e2e@example.iam.gserviceaccount.com",
      R2_ACCOUNT_ID: process.env["R2_ACCOUNT_ID"] ?? "local-e2e-r2-account",
      R2_ACCESS_KEY_ID:
        process.env["R2_ACCESS_KEY_ID"] ?? "local-e2e-r2-access-key",
      R2_SECRET_ACCESS_KEY:
        process.env["R2_SECRET_ACCESS_KEY"] ?? "local-e2e-r2-secret-key",
      R2_BUCKET_NAME: process.env["R2_BUCKET_NAME"] ?? "local-e2e-r2-bucket",
      R2_PUBLIC_URL:
        process.env["R2_PUBLIC_URL"] ?? "https://assets.example.com",
    },
  },
});
