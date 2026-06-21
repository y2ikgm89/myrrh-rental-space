import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E テスト設定
 *
 * 公式準拠の **storage state + setup project** ＋ **fullyParallel** パターン。
 * 規約 SSoT は `.claude/rules/test-quality/e2e.md`。
 *
 * Project 構成:
 *   - setup-customer / setup-admin → 認証してストレージ保存
 *   - chromium-smoke               → 毎 push 必須の critical-path gate (< 3 分)
 *   - chromium                     → 未認証テスト（公開 + 管理ログインフロー + a11y）
 *   - chromium-customer            → 顧客認証済テスト
 *   - chromium-admin               → 管理者認証済テスト
 *   - chromium-visual              → visual regression (opt-in)
 *
 * 並列化:
 *   `fullyParallel: true` で test レベル並列化。DB を書き換える特定の describe は
 *   各 spec 内で `test.describe.serial(...)` を局所適用して隔離する
 *   （グローバル `workers: 1` で隠蔽しない）。
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
  /* CI は 2 並列で DB 競合と Cloud Run リソースのバランスを取る。local はマシン依存で
   * default（CPU 半数）に委ねる。spec 内 `test.describe.serial(...)` で局所隔離する設計。
   * exactOptionalPropertyTypes 下で `undefined` を直接渡せないため spread で条件付き付与。 */
  ...(process.env["CI"] ? { workers: 2 } : {}),
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] || "http://localhost:3000",
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
     * 未認証 project: 公開ページ + 管理ログインフロー + a11y
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
   * - local: `bun run dev` (Turbopack HMR、開発と同等の環境で反復実行)
   * - CI: `bun run start` (production build artifact、dev mode の初回コンパイル
   *   による timeout / CPU 枯渇を回避し安定化)
   *
   * production build でも DevLoginButton を CI で出すため
   * `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` を build + start 両方で渡す。
   * staging / production には絶対伝播させない (login bypass risk)。
   */
  webServer: {
    command: process.env["CI"] ? "bun run start" : "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 180 * 1000,
  },
});
