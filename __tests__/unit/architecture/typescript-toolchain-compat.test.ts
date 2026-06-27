import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertTypeScriptToolchainCompatibility,
  isVersionInSupportedRange,
} from "../../../scripts/ensure-typescript-toolchain";

const ROOT = process.cwd();

describe("TypeScript toolchain compatibility", () => {
  test("rejects TypeScript versions outside the typescript-eslint supported range", () => {
    expect(isVersionInSupportedRange("6.0.3", ">=4.8.4 <6.1.0")).toBe(true);
    expect(isVersionInSupportedRange("6.1.0", ">=4.8.4 <6.1.0")).toBe(false);
  });

  test("package.json keeps TypeScript pinned until typescript-eslint supports 6.1", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies?.["typescript"]).toBe("6.0.3");
  });

  test("installed TypeScript satisfies the installed typescript-eslint peer range", () => {
    expect(() => assertTypeScriptToolchainCompatibility(ROOT)).not.toThrow();
  });

  test("production build scripts run the TypeScript toolchain gate first", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    for (const scriptName of ["build", "build:skip-env", "analyze"]) {
      expect(packageJson.scripts?.[scriptName]).toStartWith(
        "bun run toolchain:check && ",
      );
    }
  });
});
