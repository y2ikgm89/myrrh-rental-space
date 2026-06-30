import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertTypeScriptToolchainCompatibility,
  isVersionInSupportedRange,
} from "../../../scripts/ensure-typescript-toolchain";
import { expectRecord } from "../../helpers/type-assertions";

const ROOT = process.cwd();

function readPackageJson(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  );
  expectRecord(parsed);
  return parsed;
}

describe("TypeScript toolchain compatibility", () => {
  test("rejects TypeScript versions outside the typescript-eslint supported range", () => {
    expect(isVersionInSupportedRange("6.0.3", ">=4.8.4 <6.1.0")).toBe(true);
    expect(isVersionInSupportedRange("6.1.0", ">=4.8.4 <6.1.0")).toBe(false);
  });

  test("package.json keeps TypeScript pinned until typescript-eslint supports 6.1", () => {
    const packageJson = readPackageJson();
    const devDependencies = packageJson["devDependencies"];
    expectRecord(devDependencies);

    expect(devDependencies["typescript"]).toBe("6.0.3");
  });

  test("installed TypeScript satisfies the installed typescript-eslint peer range", () => {
    expect(() => assertTypeScriptToolchainCompatibility(ROOT)).not.toThrow();
  });

  test("production build scripts run the TypeScript toolchain gate first", () => {
    const packageJson = readPackageJson();
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    for (const scriptName of ["build", "build:skip-env", "analyze"]) {
      const script = scripts[scriptName];
      expect(typeof script).toBe("string");
      if (typeof script !== "string") {
        throw new Error(`${scriptName} script must exist`);
      }
      expect(script).toStartWith("bun run toolchain:check && ");
    }
  });

  test("build:skip-env supplies local public URLs for production-mode page data collection", () => {
    const packageJson = readPackageJson();
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    const script = scripts["build:skip-env"];
    expect(typeof script).toBe("string");
    if (typeof script !== "string") {
      throw new Error("build:skip-env script must exist");
    }

    expect(script).toContain("NEXT_PUBLIC_BASE_URL=http://localhost:3000");
    expect(script).toContain("NEXT_PUBLIC_APP_URL=http://localhost:3000");
    expect(script).toContain("SKIP_ENV_VALIDATION=true next build");
  });
});
