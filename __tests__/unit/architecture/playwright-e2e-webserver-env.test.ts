import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const playwrightConfig = readFileSync(
  join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
const serverEnv = readFileSync(
  join(process.cwd(), "src/shared/lib/env/server.ts"),
  "utf8",
);
const adminAuth = readFileSync(
  join(process.cwd(), "src/shared/domain/admin-auth/session.ts"),
  "utf8",
);
const adminAuthQueries = readFileSync(
  join(process.cwd(), "src/shared/domain/admin-auth/queries.ts"),
  "utf8",
);
const e2eRuntime = readFileSync(
  join(process.cwd(), "src/shared/lib/e2e-runtime.ts"),
  "utf8",
);
const cacheHealth = readFileSync(
  join(process.cwd(), "src/shared/lib/cache/health.ts"),
  "utf8",
);
const prismaSeed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
const e2eTestData = readFileSync(
  join(process.cwd(), "e2e/fixtures/test-data.ts"),
  "utf8",
);
const ciWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);
describe("Playwright E2E webServer env", () => {
  test("supplies local-only env required by Next instrumentation", () => {
    for (const key of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "NEXT_PUBLIC_BASE_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "NEXT_PUBLIC_ENABLE_E2E_LOGIN",
    ]) {
      expect(playwrightConfig).toContain(`${key}:`);
    }
  });

  test("supplies production runtime env required by Next instrumentation", () => {
    for (const key of [
      "E2E_RUNTIME",
      "E2E_FIXED_NOW_ISO",
      "ADMIN_APP_URL",
      "ENCRYPTION_KEY",
      "SUPPRESSION_HASH_SECRET",
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      "AUDIT_LOG_HMAC_KEY",
      "CRON_OIDC_AUDIENCE",
      "CRON_SERVICE_ACCOUNT_EMAIL",
      "TURNSTILE_SECRET_KEY",
      "CLOUDFLARE_ORIGIN_HEADER_SECRET",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_INQUIRIES_BUCKET_NAME",
      "R2_PUBLIC_URL",
      "ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
      "ADMIN_ROLE_GROUP_ADMIN_EMAIL",
      "ADMIN_ROLE_GROUP_EDITOR_EMAIL",
      "ADMIN_ROLE_GROUP_VIEWER_EMAIL",
    ]) {
      expect(playwrightConfig).toContain(`${key}:`);
    }

    expect(playwrightConfig).not.toContain("SKIP_ENV_VALIDATION:");
  });

  test("keeps server-side E2E bypasses on server-only env", () => {
    expect(serverEnv).toContain("E2E_RUNTIME:");
    expect(serverEnv).toContain('E2E_RUNTIME: process.env["E2E_RUNTIME"]');
    expect(serverEnv).toContain("E2E_FIXED_NOW_ISO:");
    expect(serverEnv).toContain(
      'E2E_FIXED_NOW_ISO: process.env["E2E_FIXED_NOW_ISO"]',
    );
    expect(playwrightConfig).toContain('E2E_RUNTIME: "1"');
    expect(playwrightConfig).toContain("E2E_FIXED_NOW_ISO:");

    expect(adminAuth).toContain("isLocalProductionE2EEnv");
    expect(adminAuth).toContain("isLoopbackRequestHost");
    expect(e2eRuntime).toContain('serverEnv.E2E_RUNTIME === "1"');
    expect(e2eRuntime).toContain("isLocalhostUrl");
    expect(e2eRuntime).toContain("isLoopbackRequestHost");
    expect(e2eRuntime).toContain("isE2ESecurityBypassAllowed");
    expect(e2eRuntime).toContain('process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"]');

    for (const serverOnlyFile of [adminAuthQueries, cacheHealth]) {
      expect(serverOnlyFile).toContain('serverEnv.E2E_RUNTIME === "1"');
      expect(serverOnlyFile).not.toContain(
        'process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"]',
      );
    }
  });

  test("does not pass removed initial admin bootstrap env", () => {
    for (const source of [playwrightConfig, serverEnv, prismaSeed]) {
      expect(source).not.toContain("INITIAL_ADMIN_EMAIL");
      expect(source).not.toContain("INITIAL_ADMIN_NAME");
    }
  });

  test("uses the Super Admin E2E fixture as the local IAP identity", () => {
    expect(e2eTestData).toContain('email: "superadmin@example.com"');
    expect(e2eTestData).toContain('role: "SUPER_ADMIN"');
    expect(playwrightConfig).toContain(
      'import { testUsers } from "./e2e/fixtures/test-data";',
    );
    expect(playwrightConfig).toContain(
      'process.env["ADMIN_TEST_IAP_EMAIL"] ?? testUsers.admin.email',
    );
    expect(playwrightConfig).not.toContain(
      'process.env["ADMIN_TEST_IAP_EMAIL"] ?? "admin@example.com"',
    );
  });

  // playwright.config.ts の既定値は `process.env` の値に負けるため、CI が
  // ADMIN_TEST_IAP_EMAIL を上書きすると上のゲートを素通りして identity が入れ替わる。
  // seed 上 admin@example.com は ADMIN ロールで settings:manage / auditLog:read を
  // 持たないため、広域 E2E の管理系 spec が一斉に redirect("/admin") で落ちる。
  test("keeps the CI IAP identity on the Super Admin fixture", () => {
    const overrides = [
      ...ciWorkflow.matchAll(/^\s*ADMIN_TEST_IAP_EMAIL:\s*"([^"]+)"/gmu),
    ].map((match) => match[1]);

    expect(overrides.length).toBeGreaterThan(0);
    for (const email of overrides) {
      expect(email).toBe("superadmin@example.com");
    }
  });

  test("uses one local base URL for browser contexts, server readiness, and Next env", () => {
    expect(playwrightConfig).toContain("baseURL: localE2eBaseUrl");
    expect(playwrightConfig).toContain("url: localE2eBaseUrl");
    expect(playwrightConfig).toContain(
      'process.env["NEXT_PUBLIC_BASE_URL"] ?? localE2eBaseUrl',
    );
    expect(playwrightConfig).toContain(
      'process.env["NEXT_PUBLIC_APP_URL"] ?? localE2eBaseUrl',
    );
  });

  test("defaults to admin surface without overriding explicit surface-specific jobs", () => {
    expect(playwrightConfig).toContain(
      'process.env["APP_SURFACE"] ??= "admin";',
    );
    expect(playwrightConfig).toContain(
      'APP_SURFACE: process.env["APP_SURFACE"] ?? "admin"',
    );
    expect(playwrightConfig).not.toContain(
      'process.env["APP_SURFACE"] = "admin";',
    );
    expect(playwrightConfig).not.toContain('APP_SURFACE: "admin"');
  });

  test("starts from a seeded production-mode server instead of Next dev", () => {
    expect(playwrightConfig).toContain(
      'import { resolveTestDatabaseUrl } from "./scripts/test-db-url";',
    );
    expect(playwrightConfig).toContain("localE2eDatabaseUrl");
    expect(playwrightConfig).toContain("bun run test:db:migrate");
    expect(playwrightConfig).toContain("bun prisma/seed.ts --dev");
    expect(playwrightConfig).toContain("bun run build:skip-env");
    expect(playwrightConfig).toContain("reuseExistingServer: false");
    expect(playwrightConfig).not.toContain("bunx next dev");

    // Stripe 認証情報は seed の後・server 起動の前に入れる。
    // `SettingsStripe.stripeWebhookSecret` の唯一の書き手がこの script で、
    // 無いと `availability.ts` が決済を利用不可にする。spec 内から呼んでいた頃は
    // `--project=chromium-customer` 単独実行で決済 CTA が出ず、
    // product regression に見えていた。
    expect(playwrightConfig).toContain(
      "bun scripts/e2e/setup-stripe-webhook-fixture.ts",
    );

    const migrateIndex = playwrightConfig.indexOf("bun run test:db:migrate");
    const seedIndex = playwrightConfig.indexOf("bun prisma/seed.ts --dev");
    const stripeIndex = playwrightConfig.indexOf(
      "bun scripts/e2e/setup-stripe-webhook-fixture.ts",
    );
    const buildIndex = playwrightConfig.indexOf("bun run build:skip-env");
    const startIndex = playwrightConfig.indexOf("bun run start");

    expect(migrateIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeGreaterThan(migrateIndex);
    expect(stripeIndex).toBeGreaterThan(seedIndex);
    expect(buildIndex).toBeGreaterThan(stripeIndex);
    expect(startIndex).toBeGreaterThan(buildIndex);
  });

  test("widens local database pool startup tolerance for first-render bursts", () => {
    expect(playwrightConfig).toContain("DATABASE_URL: localE2eDatabaseUrl");
    expect(playwrightConfig).toContain("DATABASE_POOL_MAX:");
    expect(playwrightConfig).toContain("DATABASE_CONNECTION_TIMEOUT_MS:");
    expect(playwrightConfig).toContain(
      'process.env["DATABASE_POOL_MAX"] ?? "30"',
    );
    expect(playwrightConfig).toContain(
      'process.env["DATABASE_CONNECTION_TIMEOUT_MS"] ?? "15000"',
    );
  });

  /**
   * CI の runner（`ubuntu-latest` = 2 vCPU）は Playwright の worker に加えて
   * production build の Next サーバーと Postgres を同居させている。worker を
   * 増やすと CPU が足りず、いちばん重い harness 操作（WebKit の
   * `browser.newContext`）から飢える。
   *
   * 実測（run 32755050176、同一 run 内の比較）: 空いている step の
   * `webkit-mobile` は 2.3s、混んだ step の `webkit-customer-mobile` は 12.6s。
   * 悪い日は 30 秒を超えて `Test timeout exceeded while setting up "context"`
   * で落ちた（run 32402401449）。
   *
   * **これは一度 project の `timeout` を 60 秒へ伸ばして「直した」ことにされた**
   * （`9ffe62cbf`）。飢餓は残ったままで報告が遅くなるだけなので、worker を
   * 公式の CI 既定（1）へ戻し、timeout も既定へ戻した。速さが要るなら
   * worker ではなく runner を増やす（`--shard`）。
   *
   * ここは「速くしよう」で静かに戻されやすい 1 行なので固定する。
   */
  test("E2E は worker を増やさない（runner の飢餓を timeout で覆わない）", () => {
    expect(playwrightConfig).toContain("workers: 1");
    // `process.env["CI"] ? 2 : 1` の形へ戻していないこと。
    expect(playwrightConfig).not.toMatch(/workers:\s*process\.env/u);
    // CI 側から `--workers` で上書きしていないこと（config の値が効かなくなる）。
    expect(ciWorkflow).not.toContain("--workers");
  });
});
