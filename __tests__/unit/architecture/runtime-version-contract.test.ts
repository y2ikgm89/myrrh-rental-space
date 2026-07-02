import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { packageManager?: string };
const bunCiInstallScript = readFileSync(
  join(process.cwd(), "scripts", "bun-ci-install.sh"),
  "utf8",
);
const bunfig = readFileSync(join(process.cwd(), "bunfig.toml"), "utf8");
const devcontainer = readFileSync(
  join(process.cwd(), ".devcontainer", "devcontainer.json"),
  "utf8",
);
const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");

function readPackageManagerBunVersion(): string {
  const packageManager = packageJson.packageManager;
  const match = /^bun@(?<version>\d+\.\d+\.\d+)$/u.exec(packageManager ?? "");

  if (!match?.groups?.["version"]) {
    throw new Error(
      `package.json#packageManager must be pinned as bun@x.y.z, got ${String(packageManager)}`,
    );
  }

  return match.groups["version"];
}

function readDockerfileBunVersion(): string {
  const match =
    /^FROM oven\/bun:(?<version>\d+\.\d+\.\d+)-alpine AS base$/mu.exec(
      dockerfile,
    );

  if (!match?.groups?.["version"]) {
    throw new Error(
      "Dockerfile must pin the base image as FROM oven/bun:x.y.z-alpine AS base",
    );
  }

  return match.groups["version"];
}

function readDevcontainerBunVersion(): string {
  const match = /^\s+"version": "(?<version>\d+\.\d+\.\d+)"$/mu.exec(
    devcontainer,
  );

  if (!match?.groups?.["version"]) {
    throw new Error("devcontainer must pin the Bun feature version as x.y.z");
  }

  return match.groups["version"];
}

describe("runtime version contract", () => {
  test("Docker Bun runtime matches packageManager", () => {
    expect(readDockerfileBunVersion()).toBe(readPackageManagerBunVersion());
  });

  test("devcontainer Bun runtime matches packageManager", () => {
    expect(readDevcontainerBunVersion()).toBe(readPackageManagerBunVersion());
  });

  test("Bun runtime docs do not keep stale 1.3.13-only assumptions", () => {
    expect(bunfig).not.toContain("Bun 1.3.13 base");
    expect(bunCiInstallScript).not.toContain("cannot move off 1.3.13");
    expect(bunCiInstallScript).not.toContain("1.3.14+ enables");
  });
});
