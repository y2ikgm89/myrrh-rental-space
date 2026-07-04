import { describe, expect, test } from "bun:test";

import {
  createPrismaMigrateEnv,
  resolveTestDatabaseUrlForMigration,
} from "../../../scripts/migrate-test-db";

describe("migrate test DB script", () => {
  test("requires TEST_DATABASE_URL before running Prisma migrate deploy", () => {
    expect(resolveTestDatabaseUrlForMigration(undefined)).toEqual({
      ok: false,
      message:
        "[test:db:migrate] TEST_DATABASE_URL is required.\n" +
        "Set it to a disposable PostgreSQL test database, then run `bun run test:db:migrate`.",
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
});
