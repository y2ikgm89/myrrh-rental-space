import { readFileSync } from "node:fs";
import { join } from "node:path";

type PackageJson = {
  version?: string;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type Version = {
  major: number;
  minor: number;
  patch: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("Expected package.json dependency map to be an object");
  }
  const result: Record<string, string> = {};
  for (const [key, dependencyVersion] of Object.entries(value)) {
    if (typeof dependencyVersion !== "string") {
      throw new Error(`Expected ${key} dependency version to be a string`);
    }
    result[key] = dependencyVersion;
  }
  return result;
}

function readPackageJson(path: string): PackageJson {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("Expected package.json to contain an object");
  }
  const version = parsed["version"];
  const devDependencies = readStringRecord(parsed["devDependencies"]);
  const peerDependencies = readStringRecord(parsed["peerDependencies"]);
  return {
    ...(typeof version === "string" && { version }),
    ...(devDependencies !== undefined && { devDependencies }),
    ...(peerDependencies !== undefined && { peerDependencies }),
  };
}

function parseVersion(value: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value);
  if (!match) {
    throw new Error(`Unsupported semver version: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(leftValue: string, rightValue: string): number {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] > right[key]) return 1;
    if (left[key] < right[key]) return -1;
  }

  return 0;
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const match = /^(>=|>|<=|<|=)?(\d+\.\d+\.\d+)$/u.exec(comparator);
  if (!match) {
    throw new Error(
      `Unsupported TypeScript peer range comparator: ${comparator}`,
    );
  }

  const operator = match[1] ?? "=";
  const target = match[2];
  if (!target) {
    throw new Error(
      `Unsupported TypeScript peer range comparator: ${comparator}`,
    );
  }

  const compared = compareVersions(version, target);
  switch (operator) {
    case ">=":
      return compared >= 0;
    case ">":
      return compared > 0;
    case "<=":
      return compared <= 0;
    case "<":
      return compared < 0;
    case "=":
      return compared === 0;
    default:
      throw new Error(
        `Unsupported TypeScript peer range operator: ${operator}`,
      );
  }
}

export function isVersionInSupportedRange(
  version: string,
  range: string,
): boolean {
  if (range.includes("||")) {
    throw new Error(`Unsupported TypeScript peer range: ${range}`);
  }

  return range
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .every((comparator) => satisfiesComparator(version, comparator));
}

export function assertTypeScriptToolchainCompatibility(root: string): void {
  const workspacePackageJson = readPackageJson(join(root, "package.json"));
  const typescriptSpec = workspacePackageJson.devDependencies?.["typescript"];
  if (!typescriptSpec) {
    throw new Error("package.json devDependencies.typescript is missing");
  }
  if (!/^\d+\.\d+\.\d+$/u.test(typescriptSpec)) {
    throw new Error(
      `TypeScript must be pinned to an exact version while typescript-eslint is constrained. Found: ${typescriptSpec}`,
    );
  }

  const typescriptPackageJson = readPackageJson(
    join(root, "node_modules", "typescript", "package.json"),
  );
  const typescriptVersion = typescriptPackageJson.version;
  if (!typescriptVersion) {
    throw new Error("Installed TypeScript package.json has no version");
  }
  if (typescriptVersion !== typescriptSpec) {
    throw new Error(
      `Installed TypeScript (${typescriptVersion}) does not match package.json (${typescriptSpec})`,
    );
  }

  const typescriptEslintPackageJson = readPackageJson(
    join(root, "node_modules", "typescript-eslint", "package.json"),
  );
  const supportedRange =
    typescriptEslintPackageJson.peerDependencies?.["typescript"];
  if (!supportedRange) {
    throw new Error("typescript-eslint peerDependencies.typescript is missing");
  }
  if (!isVersionInSupportedRange(typescriptVersion, supportedRange)) {
    throw new Error(
      `TypeScript ${typescriptVersion} is outside the installed typescript-eslint supported range (${supportedRange})`,
    );
  }
}

if (import.meta.main) {
  assertTypeScriptToolchainCompatibility(process.cwd());
  console.info("TypeScript toolchain compatibility verified.");
}
