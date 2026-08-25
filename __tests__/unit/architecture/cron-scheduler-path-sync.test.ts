import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

function listCronRoutePaths(): string[] {
  const cronRoot = join(root, "src", "app", "api", "cron");
  return readdirSync(cronRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/api/cron/${entry.name}`)
    .sort();
}

function listTerraformCronPaths(): string[] {
  const source = read("terraform/cloud_scheduler.tf");
  const paths = [...source.matchAll(/path\s*=\s*"(\/api\/cron\/[^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
  return [...new Set(paths)].sort();
}

describe("cron route ↔ Cloud Scheduler path sync", () => {
  test("src/app/api/cron/* route dirs match terraform/cloud_scheduler.tf path entries", () => {
    const routePaths = listCronRoutePaths();
    const terraformPaths = listTerraformCronPaths();

    expect(terraformPaths.length).toBeGreaterThan(0);
    expect(routePaths).toEqual(terraformPaths);
  });
});
