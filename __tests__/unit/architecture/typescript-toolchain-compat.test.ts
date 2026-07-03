import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseConfigFileTextToJson } from "typescript";

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

function readDockerfile(): string {
  return readFileSync(join(ROOT, "Dockerfile"), "utf8");
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

    for (const scriptName of [
      "build",
      "build:skip-env",
      "build:skip-env:prepared",
      "analyze",
    ]) {
      const script = scripts[scriptName];
      expect(typeof script).toBe("string");
      if (typeof script !== "string") {
        throw new Error(`${scriptName} script must exist`);
      }
      expect(script).toStartWith("bun run toolchain:check && ");
    }
  });

  test("production build and type-check scripts clean stale Next dev type output", () => {
    const packageJson = readPackageJson();
    const scripts = packageJson["scripts"];
    expectRecord(scripts);
    const typeCheckSource = readFileSync(
      join(ROOT, "scripts", "type-check.ts"),
      "utf8",
    );

    for (const scriptName of [
      "build",
      "build:skip-env",
      "build:skip-env:prepared",
      "analyze",
    ]) {
      const script = scripts[scriptName];
      expect(typeof script).toBe("string");
      if (typeof script !== "string") {
        throw new Error(`${scriptName} script must exist`);
      }
      expect(script).toContain("bun scripts/clean-next-dev-types.ts && ");
    }

    const typeCheck = scripts["type-check"];
    expect(typeof typeCheck).toBe("string");
    if (typeof typeCheck !== "string") {
      throw new Error("type-check script must exist");
    }
    expect(typeCheck).toBe("bun scripts/type-check.ts");
    expect(typeCheckSource.indexOf('name: "next:typegen"')).toBeLessThan(
      typeCheckSource.indexOf('name: "next:ensure-types"'),
    );
    expect(typeCheckSource.indexOf('name: "next:ensure-types"')).toBeLessThan(
      typeCheckSource.indexOf('name: "next:clean-dev-types"'),
    );
    expect(
      typeCheckSource.indexOf('name: "next:clean-dev-types"'),
    ).toBeLessThan(typeCheckSource.indexOf('name: "tsc:app"'));
    expect(
      typeCheckSource.indexOf('name: "next:clean-dev-types"'),
    ).toBeLessThan(typeCheckSource.indexOf('name: "tsc:test"'));
  });

  test("tsconfig includes the Next CLI-managed generated route type outputs", () => {
    const parsed = parseConfigFileTextToJson(
      join(ROOT, "tsconfig.json"),
      readFileSync(join(ROOT, "tsconfig.json"), "utf8"),
    );
    expect(parsed.error).toBeUndefined();
    const config: unknown = parsed.config;
    expectRecord(config);
    const include = config["include"];
    expect(Array.isArray(include)).toBe(true);
    if (!Array.isArray(include)) {
      throw new Error("tsconfig include must be an array");
    }

    expect(include).toContain("next-env.d.ts");
    expect(include).toContain(".next/types/**/*.ts");
    expect(include).toContain(".next/dev/types/**/*.ts");
  });

  test("Next dev type cleanup removes only the workspace-local generated dev types directory", () => {
    const source = readFileSync(
      join(ROOT, "scripts", "clean-next-dev-types.ts"),
      "utf8",
    );

    expect(source).toContain('resolve(root, ".next", "dev", "types")');
    expect(source).toContain("relative(root, target)");
    expect(source).toContain('relativeTarget.startsWith("..")');
    expect(source).toContain("isAbsolute(relativeTarget)");
    expect(source).toContain("rm(target, { recursive: true, force: true })");
  });

  test("Next dev type cleanup leaves production type output and sibling dev files intact", () => {
    const workspace = join(
      tmpdir(),
      `myrrh-clean-next-dev-types-${randomUUID()}`,
    );
    const scriptPath = join(ROOT, "scripts", "clean-next-dev-types.ts");
    const devTypesDir = join(workspace, ".next", "dev", "types");
    const productionTypesDir = join(workspace, ".next", "types");
    const devSiblingDir = join(workspace, ".next", "dev", "cache");

    try {
      mkdirSync(devTypesDir, { recursive: true });
      mkdirSync(productionTypesDir, { recursive: true });
      mkdirSync(devSiblingDir, { recursive: true });
      writeFileSync(
        join(devTypesDir, "routes.d.ts"),
        "type DevRoute = string;",
      );
      writeFileSync(
        join(productionTypesDir, "routes.d.ts"),
        "type ProductionRoute = string;",
      );
      writeFileSync(join(devSiblingDir, "keep.txt"), "cache");

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: workspace,
        encoding: "utf8",
        windowsHide: true,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(existsSync(devTypesDir)).toBe(false);
      expect(existsSync(join(productionTypesDir, "routes.d.ts"))).toBe(true);
      expect(existsSync(join(devSiblingDir, "keep.txt"))).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("build:skip-env supplies local public URLs for production-mode page data collection", () => {
    const packageJson = readPackageJson();
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    const script = scripts["build:skip-env:next"];
    expect(typeof script).toBe("string");
    if (typeof script !== "string") {
      throw new Error("build:skip-env:next script must exist");
    }

    expect(script).toContain("NEXT_PUBLIC_BASE_URL=http://localhost:3000");
    expect(script).toContain("NEXT_PUBLIC_APP_URL=http://localhost:3000");
    expect(script).toContain("SKIP_ENV_VALIDATION=true next build");
  });

  test("build:skip-env supplies a non-default Better Auth secret for build-time initialization", () => {
    const packageJson = readPackageJson();
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    const script = scripts["build:skip-env:next"];
    expect(typeof script).toBe("string");
    if (typeof script !== "string") {
      throw new Error("build:skip-env:next script must exist");
    }

    const match = script.match(/BETTER_AUTH_SECRET=([^ ]+)/);
    expect(match?.[1]).toBeString();
    expect(match?.[1]).not.toBe("better-auth-secret-key");
    expect(match?.[1]?.length).toBeGreaterThanOrEqual(32);
  });

  test("Docker build supplies a non-default Better Auth secret only inside the build command", () => {
    const dockerfile = readDockerfile();
    const buildStageEnv =
      dockerfile.match(
        /ENV NEXT_TELEMETRY_DISABLED=1 (?<env>[\s\S]*?)\n\n# DATABASE_URL/u,
      )?.groups?.["env"] ?? "";
    const buildCommand =
      dockerfile.match(/FROM builder-base AS builder(?<command>[\s\S]*?)\n\n#/u)
        ?.groups?.["command"] ?? "";
    const runnerStageEnv =
      dockerfile.match(/FROM base AS runner[\s\S]*?ENV (?<env>[\s\S]*?)\n\n/u)
        ?.groups?.["env"] ?? "";

    expect(buildStageEnv).not.toContain("BETTER_AUTH_SECRET");
    expect(buildCommand).toContain("export BETTER_AUTH_SECRET=");
    const match = buildCommand.match(/export BETTER_AUTH_SECRET="([^"]+)"/);
    expect(match?.[1]).toBeString();
    expect(match?.[1]).not.toBe("better-auth-secret-key");
    expect(match?.[1]?.length).toBeGreaterThanOrEqual(32);
    expect(runnerStageEnv).not.toContain("BETTER_AUTH_SECRET");
  });
});
