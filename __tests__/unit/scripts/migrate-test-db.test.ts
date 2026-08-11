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
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test",
      source: "default-local",
    });
  });

  test("trims TEST_DATABASE_URL before using it", () => {
    expect(
      resolveTestDatabaseUrlForMigration(
        "  postgresql://postgres:postgres@localhost:5433/myrrh_test  ",
      ),
    ).toEqual({
      ok: true,
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test",
      source: "env",
    });
  });

  test("passes the test database URL as Prisma DATABASE_URL and DIRECT_URL", () => {
    expect(
      createPrismaMigrateEnv(
        {
          DATABASE_URL:
            "postgresql://postgres:postgres@localhost:5432/myrrh_rental",
          TEST_DATABASE_URL:
            "postgresql://postgres:postgres@localhost:5433/myrrh_test",
          PATH: "bin",
        },
        // 引数のほうが env の TEST_DATABASE_URL より優先されることを見たいので、
        // 両者は別 database 名にしておく（同じ文字列だと、実装が env を読んでいても
        // このテストは通ってしまう）。
        "postgresql://postgres:postgres@localhost:5433/myrrh_test_resolved",
      ),
    ).toMatchObject({
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5433/myrrh_test_resolved",
      DIRECT_URL:
        "postgresql://postgres:postgres@localhost:5433/myrrh_test_resolved",
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
