import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ciWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
);
const migrationLintScript = readFileSync(
  join(process.cwd(), "scripts", "lint-migrations.ts"),
  "utf8",
);
const squawkConfig = readFileSync(join(process.cwd(), ".squawk.toml"), "utf8");
const migrationFixtureNotes = ["safe.sql", "unsafe.sql", "ignored.sql"].map(
  (fileName) => {
    return readFileSync(
      join(process.cwd(), "scripts", "lint-migrations.fixtures", fileName),
      "utf8",
    );
  },
);

function extractJob(jobName: string): string {
  const startMarker = `  ${jobName}:\n`;
  const start = ciWorkflow.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`CI job not found: ${jobName}`);
  }
  const nextJob = ciWorkflow
    .slice(start + startMarker.length)
    .search(/\n  [a-zA-Z0-9_-]+:\n/u);
  return nextJob === -1
    ? ciWorkflow.slice(start)
    : ciWorkflow.slice(start, start + startMarker.length + nextJob);
}

describe("CI workflow contract", () => {
  test("uses split lint and type-check checks without legacy compatibility shims", () => {
    expect(ciWorkflow).toContain("lint-format:");
    expect(ciWorkflow).toContain("name: Lint & Format");
    expect(ciWorkflow).toContain("type-check:");
    expect(ciWorkflow).toContain("name: Type Check");
    expect(ciWorkflow).not.toContain("name: Lint & Type Check");
    expect(ciWorkflow).not.toMatch(/backwards?-compat/iu);
    expect(ciWorkflow).not.toMatch(/compat(?:ibility)? shim/iu);
  });

  test("runs lint and format together inside the lint-format job", () => {
    const lintFormatJob = extractJob("lint-format");

    expect(lintFormatJob).toContain("run: bun run lint-format");
    expect(lintFormatJob).not.toMatch(/^\s*run: bun run format:check$/mu);
    expect(lintFormatJob).not.toMatch(/^\s*run: bun run lint$/mu);
  });

  test("describes migration safety as an explicit destructive-change gate", () => {
    const migrationSafetyText = [
      ciWorkflow,
      migrationLintScript,
      squawkConfig,
      ...migrationFixtureNotes,
    ].join("\n");

    expect(migrationSafetyText).toContain("意図的な破壊的 migration");
    expect(migrationSafetyText).toContain("squawk-ignore");
    expect(migrationSafetyText).toContain("squawk-ignore-file");
    expect(migrationSafetyText).not.toContain("後方互換ゲート");
    expect(migrationSafetyText).not.toContain("後方互換でない");
    expect(migrationSafetyText).not.toContain("後方互換な変更");
    expect(migrationSafetyText).not.toContain("後方互換");
  });

  test("does not run redundant Prisma generate before package scripts that already generate", () => {
    const typeCheckJob = extractJob("type-check");
    const unitTestsJob = extractJob("unit-tests");
    const buildJob = extractJob("build");
    const bundleAnalysisJob = extractJob("bundle-analysis");

    expect(typeCheckJob).toContain("run: bun run type-check");
    expect(typeCheckJob).not.toContain("Generate Prisma client");
    expect(unitTestsJob).toContain("run: bun run test:all");
    expect(unitTestsJob).not.toContain("run: bun run test:unit");
    expect(unitTestsJob).not.toContain("run: bun run test:integration");
    expect(unitTestsJob).not.toContain("Generate Prisma client");
    expect(unitTestsJob).not.toContain("run: bunx --bun prisma migrate deploy");

    expect(buildJob).toContain("run: bun run build");
    expect(buildJob).not.toContain("Generate Prisma client");
    expect(bundleAnalysisJob).toContain("run: bun run analyze");
    expect(bundleAnalysisJob).not.toContain("Generate Prisma client");
  });

  test("uses prepared skip-env builds after E2E jobs generate and seed Prisma", () => {
    for (const jobName of ["smoke-e2e", "e2e-tests", "visual-regression"]) {
      const job = extractJob(jobName);

      expect(job).toContain("Generate Prisma client");
      expect(job).toContain("Seed test database");
      expect(job).toContain("run: bun run build:skip-env:prepared");
      expect(job).not.toContain("run: bun run build:skip-env\n");
    }

    const bundleSizeDiffJob = extractJob("bundle-size-diff");
    expect(bundleSizeDiffJob).toContain('build-script: "build:skip-env"');
  });
});
