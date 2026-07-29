import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

describe("deploy packaging contract (Phase 6b clean-break)", () => {
  test("prisma CLI is a production dependency for the migrator image", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["prisma"]).toBeDefined();
    expect(pkg.devDependencies?.["prisma"]).toBeUndefined();
    expect(pkg.dependencies?.["@prisma/client"]).toBeDefined();
  });

  test("deps install never uses --production (migrator needs full node_modules)", () => {
    const bunCi = read("scripts/bun-ci-install.sh");
    expect(bunCi).toContain("bun ci");
    expect(bunCi).not.toContain("--production");
    expect(bunCi).not.toContain("NODE_ENV=production");
  });

  test("Dockerfile migrator is FROM deps and CMD uses prisma migrate deploy", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM deps AS migrator");
    expect(dockerfile).toContain(
      'CMD ["bunx", "--bun", "prisma", "migrate", "deploy"]',
    );
    expect(dockerfile).toContain("FROM base AS runner");
    // runner must remain last so bare `docker build .` yields the service image
    expect(dockerfile.lastIndexOf("FROM deps AS migrator")).toBeLessThan(
      dockerfile.lastIndexOf("FROM base AS runner"),
    );
  });

  test("Cloud Build service deploy uses services update --image (not deploy + shape)", () => {
    const cloudBuild = read("cloudbuild.yaml");
    for (const id of ["id: deploy-public", "id: deploy-admin"] as const) {
      const start = cloudBuild.indexOf(id);
      expect(start).toBeGreaterThanOrEqual(0);
      const nextId = cloudBuild.indexOf("\n  - name:", start + 1);
      const step =
        nextId === -1
          ? cloudBuild.slice(start)
          : cloudBuild.slice(start, nextId);
      expect(step).toContain("- services");
      expect(step).toContain("- update");
      expect(step).toContain("--image=");
      expect(step).toContain("--scaling=auto");
      expect(step).not.toContain("--memory=");
      expect(step).not.toContain("--set-secrets=");
    }
  });

  test("SUPPRESSION_HASH_SECRET is Phase-C wired; RESEND stays out of Cloud Run map", () => {
    const variables = read("terraform/variables.tf");
    const secrets = read("terraform/secrets.tf");
    expect(variables).toMatch(/^\s*SUPPRESSION_HASH_SECRET\s*=\s*"1"/m);
    expect(variables).not.toMatch(/^\s*RESEND_WEBHOOK_SECRET\s*=\s*"/m);
    expect(secrets).toMatch(/imported_secrets[\s\S]*"SUPPRESSION_HASH_SECRET"/);
  });

  test("RESEND_WEBHOOK_SECRET is forgotten from TF secret ownership", () => {
    const secrets = read("terraform/secrets.tf");
    // Active list entries only (quoted string), not comments.
    expect(secrets).not.toMatch(/^\s*"RESEND_WEBHOOK_SECRET",?\s*$/m);
    // for_each instance cannot be a removed target; moved → flat → removed.
    expect(secrets).toMatch(
      /moved\s*\{\s*from\s*=\s*google_secret_manager_secret\.secret\["RESEND_WEBHOOK_SECRET"\]\s*to\s*=\s*google_secret_manager_secret\.resend_webhook_secret_forgotten/,
    );
    expect(secrets).toMatch(
      /removed\s*\{\s*from\s*=\s*google_secret_manager_secret\.resend_webhook_secret_forgotten/,
    );
    expect(secrets).toMatch(/destroy\s*=\s*false/);
  });

  /**
   * Stage A jobs: declared in cron_jobs but NOT yet in GCP, so they must stay
   * out of imported_cron_jobs (otherwise plan fails with
   * "Cannot import non-existent remote object"). After the next successful
   * Deploy Production apply-create, move each name into imported_cron_jobs
   * and remove it from this set (Stage B / secrets.tf と同じ 2 段階).
   */
  const STAGE_A_PENDING_CRON_JOBS = new Set([
    "unpaid-event-registration-expire",
    "blog-scheduled-publish",
    "blog-trash-cleanup",
  ]);

  test("imported_cron_jobs covers created cron_jobs; Stage A pending stays out", () => {
    const scheduler = read("terraform/cloud_scheduler.tf");
    const cronJobsBlock = scheduler.match(
      /cron_jobs\s*=\s*\[([\s\S]*?)\]\s*\n/,
    );
    const importedBlock = scheduler.match(
      /imported_cron_jobs\s*=\s*toset\(\[([\s\S]*?)\]\)/,
    );
    expect(cronJobsBlock).not.toBeNull();
    expect(importedBlock).not.toBeNull();

    const nameRe = /name\s*=\s*"([^"]+)"/g;
    const cronNames = new Set<string>();
    for (const match of cronJobsBlock?.[1]?.matchAll(nameRe) ?? []) {
      cronNames.add(match[1] ?? "");
    }

    // Active list entries only (quoted string on its own line), not comments.
    const importedNames = new Set(
      [...(importedBlock?.[1]?.matchAll(/^\s*"([^"]+)",?\s*$/gm) ?? [])].map(
        (m) => m[1] ?? "",
      ),
    );

    expect(cronNames.size).toBeGreaterThan(0);

    for (const pending of STAGE_A_PENDING_CRON_JOBS) {
      expect(cronNames.has(pending)).toBe(true);
      expect(importedNames.has(pending)).toBe(false);
    }

    for (const name of cronNames) {
      if (STAGE_A_PENDING_CRON_JOBS.has(name)) continue;
      expect(importedNames.has(name)).toBe(true);
    }

    for (const name of importedNames) {
      expect(cronNames.has(name)).toBe(true);
    }
  });
});
