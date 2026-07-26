import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = process.cwd();

describe("seed production DATABASE_URL fail-closed guard", () => {
  test("seed.ts evaluates seed-safety before any mode branch / DB writes", () => {
    const seed = readFileSync(join(root, "prisma", "seed.ts"), "utf8");
    const safety = readFileSync(join(root, "prisma", "seed-safety.ts"), "utf8");

    expect(seed).toContain('from "./seed-safety"');
    expect(seed).toContain("evaluateSeedSafety");
    expect(seed.indexOf("evaluateSeedSafety")).toBeLessThan(
      seed.indexOf("switch (safety.mode)"),
    );

    expect(safety).toContain("looksLikeProductionDatabaseUrl");
    expect(safety).toContain("isLocalhostDatabaseUrl");
    expect(safety).toContain("/cloudsql/");
    expect(safety).toContain(".neon.tech");
    expect(safety).toContain("NODE_ENV");
    expect(safety).toContain("APP_SURFACE");
    expect(safety).toContain("cannot be combined with --reset");
  });
});
