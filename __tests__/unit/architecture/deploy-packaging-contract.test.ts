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

  test("imported_cron_jobs covers every cron_jobs entry (state-rebuild safety)", () => {
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

    const importedNames = new Set(
      [...(importedBlock?.[1]?.matchAll(/"([^"]+)"/g) ?? [])].map(
        (m) => m[1] ?? "",
      ),
    );

    expect(cronNames.size).toBeGreaterThan(0);
    for (const name of cronNames) {
      expect(importedNames.has(name)).toBe(true);
    }
  });
});
