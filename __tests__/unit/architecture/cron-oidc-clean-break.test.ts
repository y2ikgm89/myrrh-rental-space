import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("cron OIDC clean-break boundary", () => {
  const cronRoutePaths = [
    "src/app/api/cron/calendar-sync/route.ts",
    "src/app/api/cron/customer-risk-scan/route.ts",
    "src/app/api/cron/event-import/route.ts",
    "src/app/api/cron/event-reminder/route.ts",
    "src/app/api/cron/faq-stale-check/route.ts",
    "src/app/api/cron/faq-trash-cleanup/route.ts",
    "src/app/api/cron/instagram-refresh/route.ts",
    "src/app/api/cron/instagram-sync/route.ts",
    "src/app/api/cron/notification-cleanup/route.ts",
    "src/app/api/cron/reservation-reminder/route.ts",
  ] as const;

  test("cron auth no longer accepts CRON_SECRET shared bearer fallback", () => {
    for (const path of [
      "src/shared/lib/cron-auth.ts",
      "src/proxy.ts",
      "scripts/setup-cloud-scheduler.sh",
    ]) {
      const source = read(path);
      expect(source).not.toContain("CRON_SECRET");
      expect(source).not.toContain("timingSafeEqualStrings");
      expect(source).not.toContain("Authorization=Bearer");
    }

    const cloudBuild = read("cloudbuild.yaml");
    expect(cloudBuild).not.toContain("_CRON_SECRET_VERSION");
    expect(cloudBuild).not.toContain("CRON_SECRET");
    expect(cloudBuild).toContain("--set-env-vars=");
    expect(cloudBuild).toContain("--set-secrets=");
    expect(cloudBuild).not.toContain("--remove-env-vars=");
    expect(cloudBuild).not.toContain("--update-env-vars=");
    expect(cloudBuild).not.toContain("--remove-secrets=");
    expect(cloudBuild).not.toContain("--update-secrets=");
  });

  test("Cloud Scheduler setup clears legacy custom headers when applying OIDC", () => {
    const source = read("scripts/setup-cloud-scheduler.sh");

    expect(source).toContain("--clear-headers");
    expect(source).toContain(
      '--oidc-service-account-email="${CRON_SERVICE_ACCOUNT_EMAIL}"',
    );
    expect(source).toContain('--oidc-token-audience="${CRON_OIDC_AUDIENCE}"');
  });

  test("cron route unit tests model OIDC bearer calls, not shared-secret bearer calls", () => {
    const source = read("__tests__/unit/api/cron-reservation-reminder.test.ts");

    expect(source).not.toContain("Bearer test-secret");
    expect(source).not.toContain("Bearer wrong-secret");
    expect(source).not.toContain("CRON_SECRET");
    expect(source).toContain("Bearer cloud-scheduler-oidc-token");
  });

  test("cron GET route handlers are runtime-only before auth is evaluated", () => {
    for (const path of cronRoutePaths) {
      const source = read(path);
      expect(source).toContain('import { connection } from "next/server";');
      const connectionIndex = source.indexOf("await connection();");
      const authIndex = source.indexOf("await authorizeCronRequest");
      expect(connectionIndex).toBeGreaterThan(-1);
      expect(authIndex).toBeGreaterThan(-1);
      expect(connectionIndex).toBeLessThan(authIndex);
    }
  });
});
