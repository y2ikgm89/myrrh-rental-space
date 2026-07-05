#!/usr/bin/env bun

import { resolveTestDatabaseUrl } from "./test-db-url";

type ScriptEnv = Record<string, string | undefined>;

type TestDatabaseUrlResult = {
  ok: true;
  url: string;
  source: "env" | "default-local";
};

type CommandRunner = (command: readonly string[]) => number;

export function resolveTestDatabaseUrlForMigration(
  testDatabaseUrl: string | undefined,
): TestDatabaseUrlResult {
  return { ok: true, ...resolveTestDatabaseUrl(testDatabaseUrl) };
}

export function getDockerComposeTestDbCommand(): readonly string[] {
  return [
    "docker",
    "compose",
    "up",
    "--wait",
    "--wait-timeout",
    "60",
    "test-db",
  ];
}

function runInherited(command: readonly string[]): number {
  const proc = Bun.spawnSync([...command], {
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exitCode;
}

export function ensureDefaultLocalTestDatabase(
  source: "env" | "default-local",
  runner: CommandRunner = runInherited,
): number {
  if (source === "env") return 0;

  console.info(
    "[test:db:migrate] TEST_DATABASE_URL is not set; starting docker-compose test-db default.",
  );
  const exitCode = runner(getDockerComposeTestDbCommand());
  if (exitCode !== 0) {
    console.error(
      "[test:db:migrate] Failed to start docker-compose test-db. Start it with `docker compose up --wait --wait-timeout 60 test-db` or set TEST_DATABASE_URL to a disposable migrated PostgreSQL database.",
    );
  }
  return exitCode;
}

export function createPrismaMigrateEnv(
  baseEnv: ScriptEnv,
  testDatabaseUrl: string,
): ScriptEnv {
  return {
    ...baseEnv,
    DATABASE_URL: testDatabaseUrl,
  };
}

function run(): number {
  const resolved = resolveTestDatabaseUrlForMigration(
    process.env["TEST_DATABASE_URL"],
  );
  const ensureExitCode = ensureDefaultLocalTestDatabase(resolved.source);
  if (ensureExitCode !== 0) return ensureExitCode;

  const proc = Bun.spawnSync(["bunx", "--bun", "prisma", "migrate", "deploy"], {
    stdout: "inherit",
    stderr: "inherit",
    env: createPrismaMigrateEnv(process.env, resolved.url),
  });
  return proc.exitCode;
}

if (import.meta.main) {
  process.exit(run());
}
