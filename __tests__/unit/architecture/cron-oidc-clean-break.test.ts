import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

function listCronRouteFiles(): string[] {
  const cronRoot = join(root, "src", "app", "api", "cron");
  return readdirSync(cronRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `src/app/api/cron/${entry.name}/route.ts`)
    .sort();
}

describe("cron OIDC clean-break boundary", () => {
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

    // Phase 6b: deploy / migrate-update steps must not rewrite env/secrets.
    // Assert on step bodies only — file-level comment archaeology must not
    // satisfy the gate (false green).
    const deployPublicIndex = cloudBuild.indexOf("id: deploy-public");
    const deployAdminIndex = cloudBuild.indexOf("id: deploy-admin");
    const migrateUpdateIndex = cloudBuild.indexOf("id: migrate-update");
    const migrateExecuteIndex = cloudBuild.indexOf("id: migrate-execute");
    expect(deployPublicIndex).toBeGreaterThanOrEqual(0);
    expect(deployAdminIndex).toBeGreaterThan(deployPublicIndex);
    expect(migrateUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(migrateExecuteIndex).toBeGreaterThan(migrateUpdateIndex);

    for (const step of [
      cloudBuild.slice(deployPublicIndex, deployAdminIndex),
      cloudBuild.slice(deployAdminIndex),
      cloudBuild.slice(migrateUpdateIndex, migrateExecuteIndex),
    ]) {
      expect(step).not.toContain("--set-env-vars=");
      expect(step).not.toContain("--set-secrets=");
      expect(step).not.toContain("--remove-env-vars=");
      expect(step).not.toContain("--update-env-vars=");
      expect(step).not.toContain("--remove-secrets=");
      expect(step).not.toContain("--update-secrets=");
    }
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
    const cronRoutePaths = listCronRouteFiles();
    expect(cronRoutePaths.length).toBeGreaterThan(0);

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
