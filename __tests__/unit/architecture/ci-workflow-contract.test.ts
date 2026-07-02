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
});
