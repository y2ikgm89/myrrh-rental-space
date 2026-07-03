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
  join(process.cwd(), "src/shared/lib/admin-auth.ts"),
  "utf8",
);
const adminAuthQueries = readFileSync(
  join(process.cwd(), "src/shared/domain/admin-auth/queries.ts"),
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
describe("Playwright E2E webServer env", () => {
  test("supplies local-only env required by Next instrumentation", () => {
    for (const key of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "NEXT_PUBLIC_BASE_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_ENABLE_E2E_LOGIN",
    ]) {
      expect(playwrightConfig).toContain(`${key}:`);
    }
  });

  test("supplies production runtime env required by Next instrumentation", () => {
    for (const key of [
      "E2E_RUNTIME",
      "ADMIN_APP_URL",
      "ENCRYPTION_KEY",
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      "AUDIT_LOG_HMAC_KEY",
      "CRON_OIDC_AUDIENCE",
      "CRON_SERVICE_ACCOUNT_EMAIL",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
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
    expect(playwrightConfig).toContain('E2E_RUNTIME: "1"');

    for (const serverOnlyFile of [adminAuth, adminAuthQueries, cacheHealth]) {
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
    expect(playwrightConfig).toContain("bun prisma/seed.ts --dev");
    expect(playwrightConfig).toContain("bun run build:skip-env");
    expect(playwrightConfig).toContain("reuseExistingServer: false");
    expect(playwrightConfig).not.toContain("bunx next dev");

    const seedIndex = playwrightConfig.indexOf("bun prisma/seed.ts --dev");
    const buildIndex = playwrightConfig.indexOf("bun run build:skip-env");
    const startIndex = playwrightConfig.indexOf("bun run start");

    expect(seedIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(seedIndex);
    expect(startIndex).toBeGreaterThan(buildIndex);
  });

  test("widens local database pool startup tolerance for first-render bursts", () => {
    expect(playwrightConfig).toContain("DATABASE_POOL_MAX:");
    expect(playwrightConfig).toContain("DATABASE_CONNECTION_TIMEOUT_MS:");
    expect(playwrightConfig).toContain(
      'process.env["DATABASE_POOL_MAX"] ?? "30"',
    );
    expect(playwrightConfig).toContain(
      'process.env["DATABASE_CONNECTION_TIMEOUT_MS"] ?? "15000"',
    );
  });
});
