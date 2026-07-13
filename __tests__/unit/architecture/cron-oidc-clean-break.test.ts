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
    "src/app/api/cron/data-retention/route.ts",
    "src/app/api/cron/event-import/route.ts",
    "src/app/api/cron/event-reminder/route.ts",
    "src/app/api/cron/faq-stale-check/route.ts",
    "src/app/api/cron/faq-trash-cleanup/route.ts",
    "src/app/api/cron/instagram-refresh/route.ts",
    "src/app/api/cron/instagram-sync/route.ts",
    "src/app/api/cron/notification-cleanup/route.ts",
    "src/app/api/cron/reservation-reminder/route.ts",
    "src/app/api/cron/smart-lock-cleanup/route.ts",
  ] as const;

  test("cron auth no longer accepts CRON_SECRET shared bearer fallback", () => {
    // Phase 2 で `scripts/setup-cloud-scheduler.sh` は撤廃され、Cloud Scheduler
    // job の SSoT は `terraform/cloud_scheduler.tf` に移行済 (google_cloud_scheduler_job)。
    // legacy CRON_SECRET shared bearer が復活していないことを、コード側 2 経路
    // + Terraform config で確認する。
    for (const path of [
      "src/shared/lib/cron-auth.ts",
      "src/proxy.ts",
      "terraform/cloud_scheduler.tf",
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

  test("Cloud Scheduler jobs use OIDC only (no shared-secret / custom auth headers)", () => {
    // Phase 2: gcloud script が `--clear-headers` で legacy X-Cron-Secret を落と
    // していた挙動を、Terraform では `google_cloud_scheduler_job` resource が
    // 宣言的に代替する。resource 定義に `headers` block が無ければ HTTP header
    // は OIDC Bearer だけになる (Terraform は resource 上に無い attribute は
    // create/update で空扱いする)。
    const source = read("terraform/cloud_scheduler.tf");

    expect(source).toContain("oidc_token {");
    expect(source).toContain("service_account_email = var.scheduler_sa_email");
    expect(source).toContain("audience              = var.public_domain");
    expect(source).not.toContain("X-Cron-Secret");
    expect(source).not.toContain("headers = {");
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
