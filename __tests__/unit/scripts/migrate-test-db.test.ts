import { describe, expect, test } from "bun:test";

import {
  createPrismaMigrateEnv,
  ensureDefaultLocalTestDatabase,
  getDockerComposeTestDbCommand,
  resolveTestDatabaseUrlForMigration,
} from "../../../scripts/migrate-test-db";

describe("migrate test DB script", () => {
  test("uses docker-compose test-db default when TEST_DATABASE_URL is missing", () => {
    expect(resolveTestDatabaseUrlForMigration(undefined)).toEqual({
      ok: true,
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public",
      source: "default-local",
    });
  });

  test("trims TEST_DATABASE_URL before using it", () => {
    expect(
      resolveTestDatabaseUrlForMigration(
        "  postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public  ",
      ),
    ).toEqual({
      ok: true,
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public",
      source: "env",
    });
  });

  test("passes the test database URL as Prisma DATABASE_URL", () => {
    expect(
      createPrismaMigrateEnv(
        {
          DATABASE_URL:
            "postgresql://postgres:postgres@localhost:5432/myrrh_rental",
          TEST_DATABASE_URL:
            "postgresql://postgres:postgres@localhost:5433/myrrh_test",
          PATH: "bin",
        },
        "postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public",
      ),
    ).toMatchObject({
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public",
      TEST_DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5433/myrrh_test",
      PATH: "bin",
    });
  });

  test("starts docker-compose test-db only for the default local URL", () => {
    const mutableCalls: string[][] = [];
    const exitCode = ensureDefaultLocalTestDatabase(
      "default-local",
      (command) => {
        mutableCalls.push([...command]);
        return 0;
      },
    );

    expect(exitCode).toBe(0);
    expect(mutableCalls).toEqual([[...getDockerComposeTestDbCommand()]]);
  });

  test("does not start docker-compose when TEST_DATABASE_URL is explicit", () => {
    const calls: string[][] = [];
    const exitCode = ensureDefaultLocalTestDatabase("env", (command) => {
      calls.push([...command]);
      return 1;
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([]);
  });
});
