import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as {
  packageManager?: string;
  engines?: { bun?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const bunCiInstallScript = readFileSync(
  join(process.cwd(), "scripts", "bun-ci-install.sh"),
  "utf8",
);
const bunfig = readFileSync(join(process.cwd(), "bunfig.toml"), "utf8");
const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
const bunLock = readFileSync(join(process.cwd(), "bun.lock"), "utf8");

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

function readEnginesBunVersion(): string {
  const version = packageJson.engines?.bun;

  if (!version || !/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(
      `package.json#engines.bun must be pinned as x.y.z, got ${String(version)}`,
    );
  }

  return version;
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

function readTypesBunVersion(): string {
  const range =
    packageJson.devDependencies?.["@types/bun"] ??
    packageJson.dependencies?.["@types/bun"];
  // packageManager / engines と同じく exact pin（^/~ は runtime とのズレを許す）。
  const match = /^(?<version>\d+\.\d+\.\d+)$/u.exec(range ?? "");

  if (!match?.groups?.["version"]) {
    throw new Error(
      `@types/bun must be pinned as exact x.y.z to match packageManager, got ${String(range)}`,
    );
  }

  return match.groups["version"];
}

function readLockfileVersion(): number {
  const match = /^\{[\s\S]*?"lockfileVersion": (?<version>\d+)/u.exec(bunLock);

  if (!match?.groups?.["version"]) {
    throw new Error("bun.lock must start with a numeric lockfileVersion");
  }

  return Number(match.groups["version"]);
}

describe("runtime version contract", () => {
  // Bun pin の SSoT は packageManager + engines.bun の2フィールド。
  // engines.bun 単独のドリフトは他のテストで検知できていなかった（Phase C 監査で判明）。
  test("engines.bun matches packageManager", () => {
    expect(readEnginesBunVersion()).toBe(readPackageManagerBunVersion());
  });

  test("Docker Bun runtime matches packageManager", () => {
    expect(readDockerfileBunVersion()).toBe(readPackageManagerBunVersion());
  });

  // #2482 が @types/bun ^1.4.0 を単独で入れ、runtime は 1.3.14 のまま残った。
  // types だけ先に上がると 1.4 API を誤って前提にできる。Bun bump と lockstep。
  test("@types/bun matches packageManager", () => {
    expect(readTypesBunVersion()).toBe(readPackageManagerBunVersion());
  });

  // Bun 1.4.0 の新規 bun.lock は lockfileVersion 2。既存 v1 は再保存しても上がらない
  // （公式: 破壊的変更リスト #28792 / install: don't bump existing bun.lock #31602）。
  // v2 の本文は v1 と同一で、off-registry tarball の integrity と unsafe git `.bun-tag`
  // を parse 時に拒否するだけ。1.3 が読めなくなるのが目的なので、この repo は 2 を刻む。
  test("bun.lock uses lockfileVersion 2", () => {
    expect(readLockfileVersion()).toBe(2);
    expect('{"lockfileVersion": 1}').not.toMatch(
      /^\{[\s\S]*?"lockfileVersion": 2/u,
    );
  });

  test("Bun runtime docs do not keep stale 1.3.x-only assumptions", () => {
    expect(bunfig).not.toContain("Bun 1.3.13 base");
    expect(bunCiInstallScript).not.toContain("cannot move off 1.3.13");
    expect(bunCiInstallScript).not.toContain("1.3.14+ enables");
    expect(bunLock).not.toMatch(/"lockfileVersion": 1\b/u);
  });
});
