import { defineConfig, devices } from "@playwright/test";
import type { E2ETestOptions } from "./e2e/fixtures/e2e-test";
import { testUsers } from "./e2e/fixtures/test-data";
import { resolveTestDatabaseUrl } from "./scripts/test-db-url";

process.env["APP_SURFACE"] ??= "admin";

const localE2eDatabaseUrl = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;
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
const localE2eAuditLogHmacKey =
  process.env["AUDIT_LOG_HMAC_KEY"] ?? "f".repeat(64);
const localE2eCloudflareOriginHeaderSecret =
  process.env["CLOUDFLARE_ORIGIN_HEADER_SECRET"] ?? "e".repeat(32);
const localE2eTurnstileSecretKey =
  process.env["TURNSTILE_SECRET_KEY"] ?? "1x0000000000000000000000000000000AA";
const localE2eTurnstileSiteKey =
  process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] ?? "1x00000000000000000000AA";
const e2eWebServerCommand = [
  "bun run db:generate",
  "bun run test:db:migrate",
  "bun prisma/seed.ts --dev",
  // Stripe 認証情報は seed ではなくここで入れる。`SettingsStripe.stripeWebhookSecret`
  // の唯一の書き手がこの script で、`availability.ts` はそれが無いと決済を
  // 「利用不可」にする。以前は `stripe-webhook-dedup-replay.spec.ts`（chromium）が
  // spec 内から呼ぶだけだったので、`--project=chromium-customer` を単独で回すと
  // 「オンラインで決済する」CTA が出ず、決済機能の product regression に見えた
  // （全 project を回すと project の宣言順で偶然通っていた）。
  //
  // seed に入れない理由: `prisma/seed.ts` は `@/shared/lib/crypto` を import して
  // おらず、`server-only` の stub と `serverEnv` の事前設定が要る。加えて偽の
  // Stripe 認証情報を**全開発者の dev DB**に書くことになる。webServer chain なら
  // E2E の DB だけに閉じ、local / CI のどちらでも全 project より先に走る。
  "bun scripts/e2e/setup-stripe-webhook-fixture.ts",
  ...(process.env["CI"] ? [] : ["bun run build:skip-env"]),
  "bun run start",
].join(" && ");

/**
 * Playwright E2E テスト設定
 *
 * 公式準拠の **storage state + setup project** ＋ **fullyParallel** パターン。
 * 規約 SSoT は `.claude/rules/testing-e2e.md`。
 *
 * Project 構成:
 *   - setup-customer / setup-admin → 認証してストレージ保存
 *   - chromium-smoke               → 毎 push 必須の critical-path gate (< 3 分)
 *   - chromium                     → 未認証テスト（公開 + 管理 IAP 境界 + a11y）
 *   - chromium-customer            → 顧客認証済テスト
 *   - chromium-admin               → 管理者認証済テスト
 *   - chromium-*-mobile            → Android Chrome touch viewport regression
 *   - webkit-*-mobile              → iOS Mobile Safari touch viewport regression
 *   - chromium-visual              → visual regression (opt-in)
 *
 * 並列化:
 *   `fullyParallel: true` で test レベル並列化。CI は 2 workers、local は
 *   共有 Next dev server / Postgres の枯渇を避けるため 1 worker に固定する。
 *   DB を書き換える特定の describe は各 spec 内で `test.describe.serial(...)`
 *   を局所適用して隔離する。
 *
 * client IP:
 *   rate limiter の token になる `x-forwarded-for` は `e2e/fixtures/e2e-test.ts`
 *   の `extraHTTPHeaders` fixture がテスト単位で配る。**この config で
 *   `extraHTTPHeaders` を設定しない** — option を上書きすると fixture ごと
 *   置き換わり全テストが IP を共有する（`x-e2e-admin-identity` は
 *   `adminIdentity` option 経由で合成する）。
 *
 * @see https://playwright.dev/docs/test-configuration
 * @see https://playwright.dev/docs/test-parallel
 * @see https://playwright.dev/docs/auth
 */
export default defineConfig<E2ETestOptions>({
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
     * feature module mutator project: **単独で先に走らせる**
     *
     * `Settings.featureModules` を OFF に切り替える spec 群。所有分割
     * (`e2e-feature-module-ownership.test.ts`) で互いの衝突は防いでいるが、
     * それは **mutator 同士**の話で、同じ singleton を**読むだけ**の spec は
     * 守られない。実測 (run 30677872134): `feature-module-off-gate` が spaces を
     * OFF にしている最中に `responsive-shell` が `/spaces` を読み、
     * 「ページが見つかりません」を掴んで落ちた。`/faq` も
     * `axe-admin-feature-disabled` の所有なので同型の競合が起きうる。
     *
     * Playwright の named lock (ファイル・worker・project 跨ぎの排他) は stable 未
     * リリースのため、公式に使える手段は **project `dependencies` による順序付け**
     * だけ。この project を全 reader project の依存に置くことで、mutator が走る間は
     * 他に何も走らない状態を作る。追加コストは先頭の数十秒のみ。
     *
     * `chromium-smoke` は依存させない — CI 上別 job (= 別 webServer / 別 DB) で、
     * 競合しないうえ required gate の実行時間を延ばしたくない。
     * =================================================================== */
    {
      name: "chromium-feature-modules",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
      testMatch: [
        /e2e\/public\/feature-module-off-gate\.spec\.ts/,
        /e2e\/authenticated\/admin\/axe-admin-feature-disabled\.spec\.ts/,
      ],
    },

    /* ===================================================================
     * 未認証 project: 公開ページ + 管理 IAP 境界 + a11y
     * `e2e/public/*.spec.ts` および `e2e/a11y/*.spec.ts` を対象。
     * setup spec / 認証済 / visual / smoke は明示除外。
     * =================================================================== */
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium-feature-modules"],
      testMatch: [/e2e\/public\/.*\.spec\.ts/, /e2e\/a11y\/.*\.spec\.ts/],
      testIgnore: /e2e\/public\/feature-module-off-gate\.spec\.ts/,
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ["chromium-feature-modules"],
      testMatch: /e2e\/mobile\/public-mobile\..*\.spec\.ts/,
    },
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ["chromium-feature-modules"],
      testMatch: /e2e\/mobile\/public-mobile\..*\.spec\.ts/,
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
      dependencies: ["setup-customer", "chromium-feature-modules"],
      testMatch: /e2e\/authenticated\/customer\/.*\.spec\.ts/,
    },
    {
      name: "chromium-customer-mobile",
      use: {
        ...devices["Pixel 5"],
        isMobile: true,
        hasTouch: true,
        storageState: "playwright/.auth/customer.json",
      },
      dependencies: ["setup-customer", "chromium-feature-modules"],
      testMatch: /e2e\/mobile\/customer-mobile\..*\.spec\.ts/,
    },
    {
      name: "webkit-customer-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        isMobile: true,
        hasTouch: true,
        storageState: "playwright/.auth/customer.json",
      },
      dependencies: ["setup-customer", "chromium-feature-modules"],
      testMatch: /e2e\/mobile\/customer-mobile\..*\.spec\.ts/,
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
      dependencies: ["setup-admin", "chromium-feature-modules"],
      testMatch: /e2e\/authenticated\/admin\/.*\.spec\.ts/,
      testIgnore:
        /e2e\/authenticated\/admin\/axe-admin-feature-disabled\.spec\.ts/,
    },
    /**
     * VIEWER role 専用 project。
     *
     * `adminIdentity: "viewer"` を指定すると `e2e/fixtures/e2e-test.ts` の
     * fixture が `x-e2e-admin-identity: viewer` を全リクエストに載せ、既定の
     * SUPER_ADMIN とは別の専用ユーザーとして解決される
     * (`src/shared/domain/admin-auth/e2e-identity.ts`)。共有 User 行の role を
     * 実行時に書き換える旧方式は fullyParallel 下で他 spec に漏れていたため廃止した。
     * identity が project 単位で固定なので chromium-admin と並列実行して安全。
     *
     * 生の `extraHTTPHeaders` で渡すと client IP fixture を潰すため option を使う。
     */
    {
      name: "chromium-admin-viewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
        adminIdentity: "viewer",
      },
      dependencies: ["setup-admin", "chromium-feature-modules"],
      testMatch: /e2e\/authenticated\/admin-viewer\/.*\.spec\.ts/,
    },
    {
      name: "chromium-admin-mobile",
      use: {
        ...devices["Pixel 5"],
        isMobile: true,
        hasTouch: true,
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup-admin", "chromium-feature-modules"],
      testMatch: /e2e\/mobile\/admin-mobile\..*\.spec\.ts/,
    },
    {
      name: "webkit-admin-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        isMobile: true,
        hasTouch: true,
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup-admin", "chromium-feature-modules"],
      testMatch: /e2e\/mobile\/admin-mobile\..*\.spec\.ts/,
    },

    /* ===================================================================
     * Visual Regression: toHaveScreenshot baseline (opt-in、PLAYWRIGHT_VISUAL=1)
     * =================================================================== */
    {
      name: "chromium-visual",
      use: { ...devices["Desktop Chrome"] },
      // `chromium-feature-modules` に依存させない。visual job は
      // `.github/workflows/ci.yml` で **`APP_SURFACE=public`** かつ
      // `--project=chromium-visual` 単独で回る。依存を張ると先に `setup-admin` が
      // 走るが、public surface では proxy が `/admin/*` を 404 にするため
      // `e2e/auth/admin.setup.ts` の `getByRole("main")` が満たせず、
      // スナップショットを 1 枚も撮る前に job ごと落ちる。
      // 単独 job = 別 webServer / 別 DB なので mutator と競合しようがなく、
      // そもそも保護が不要（`chromium-smoke` を除外しているのと同じ理由）。
      testMatch: /e2e\/visual\/.*\.spec\.ts/,
    },
  ],

  /* webServer:
   * - local: `db:generate -> test:db:migrate -> seed --dev -> build:skip-env -> start`
   * - CI: `db:generate -> test:db:migrate -> seed --dev -> start` (workflow builds first)
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
      AUDIT_LOG_HMAC_KEY: localE2eAuditLogHmacKey,
      AUDIT_LOG_HMAC_KEY_ID: process.env["AUDIT_LOG_HMAC_KEY_ID"] ?? "v1",
      BETTER_AUTH_URL: process.env["BETTER_AUTH_URL"] ?? localE2eBaseUrl,
      NEXT_PUBLIC_BASE_URL:
        process.env["NEXT_PUBLIC_BASE_URL"] ?? localE2eBaseUrl,
      NEXT_PUBLIC_APP_URL:
        process.env["NEXT_PUBLIC_APP_URL"] ?? localE2eBaseUrl,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: localE2eTurnstileSiteKey,
      NEXT_PUBLIC_ENABLE_E2E_LOGIN:
        process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] ?? "1",
      E2E_RUNTIME: "1",
      E2E_FIXED_NOW_ISO:
        process.env["E2E_FIXED_NOW_ISO"] ?? "2026-07-04T03:00:00.000Z",
      DATABASE_URL: localE2eDatabaseUrl,
      TURNSTILE_SECRET_KEY: localE2eTurnstileSecretKey,
      CLOUDFLARE_ORIGIN_HEADER_SECRET: localE2eCloudflareOriginHeaderSecret,
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
      SUPPRESSION_HASH_SECRET:
        process.env["SUPPRESSION_HASH_SECRET"] ?? "0".repeat(64),
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
      R2_INQUIRIES_BUCKET_NAME:
        process.env["R2_INQUIRIES_BUCKET_NAME"] ??
        "local-e2e-r2-inquiries-bucket",
      R2_PUBLIC_URL:
        process.env["R2_PUBLIC_URL"] ?? "https://assets.example.com",
    },
  },
});
