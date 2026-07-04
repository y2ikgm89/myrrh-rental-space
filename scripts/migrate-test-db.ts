#!/usr/bin/env bun

type ScriptEnv = Record<string, string | undefined>;

type TestDatabaseUrlResult =
  { ok: true; url: string } | { ok: false; message: string };

export function resolveTestDatabaseUrlForMigration(
  testDatabaseUrl: string | undefined,
): TestDatabaseUrlResult {
  const url = testDatabaseUrl?.trim();
  if (!url) {
    return {
      ok: false,
      message:
        "[test:db:migrate] TEST_DATABASE_URL is required.\n" +
        "Set it to a disposable PostgreSQL test database, then run `bun run test:db:migrate`.",
    };
  }

  return { ok: true, url };
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
  if (!resolved.ok) {
    console.error(resolved.message);
    return 1;
  }

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
