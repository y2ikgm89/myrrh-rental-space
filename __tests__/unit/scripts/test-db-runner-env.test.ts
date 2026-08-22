import { describe, expect, test } from "bun:test";

import {
  resolveTestDatabaseUrlForRunner,
  buildSerialDbTestSet,
  fileContentNeedsSerialDbExecution,
  findSelectedSerialDbTests,
  isSerialDbTest,
  SERIAL_DB_TESTS,
} from "../../../scripts/test-db-runner-env";

describe("test DB runner env", () => {
  test("detects selected serial DB tests", () => {
    expect(
      findSelectedSerialDbTests([
        "__tests__/unit/lib/cn.test.ts",
        "__tests__/integration/domain/events/registration-overbooking.test.ts",
        "__tests__/integration/domain/reservations/reminder-idempotency.test.ts",
      ]),
    ).toEqual([
      "__tests__/integration/domain/events/registration-overbooking.test.ts",
      "__tests__/integration/domain/reservations/reminder-idempotency.test.ts",
    ]);
  });

  test("allows non-DB test selections without TEST_DATABASE_URL", () => {
    expect(
      resolveTestDatabaseUrlForRunner({
        selectedSerialDbTests: [],
        testDatabaseUrl: undefined,
      }),
    ).toEqual({});
  });

  test("uses docker-compose test-db default when selected serial DB tests lack TEST_DATABASE_URL", () => {
    const result = resolveTestDatabaseUrlForRunner({
      selectedSerialDbTests: [
        "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
      ],
      testDatabaseUrl: "   ",
    });

    expect(result).toEqual({
      url: "postgresql://postgres:postgres@127.0.0.1:5433/myrrh_test",
      source: "default-local",
    });
  });

  test("allows selected serial DB tests when TEST_DATABASE_URL is set", () => {
    expect(
      resolveTestDatabaseUrlForRunner({
        selectedSerialDbTests: [
          "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
        ],
        // 既定値と別 database 名にする。同じ文字列だと、実装が env を捨てて既定に
        // 落ちていてもこのテストは通ってしまう。
        testDatabaseUrl:
          "postgresql://postgres:postgres@localhost:5433/myrrh_test_env",
      }),
    ).toEqual({
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test_env",
      source: "env",
    });
  });
});

describe("serial DB test auto-detection", () => {
  test("excludes prisma mock.module integration tests", () => {
    expect(
      fileContentNeedsSerialDbExecution(`
        mock.module("@/shared/db/prisma", () => ({ prisma: {} }));
        const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
      `),
    ).toBe(false);
  });

  test("detects TEST_DATABASE_URL env reads", () => {
    expect(
      fileContentNeedsSerialDbExecution(
        'const TEST_DB_URL = process.env["TEST_DATABASE_URL"];',
      ),
    ).toBe(true);
  });

  test("detects DATABASE_URL override from TEST_DATABASE_URL", () => {
    expect(
      fileContentNeedsSerialDbExecution(`
        process.env["DATABASE_URL"] =
          process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];
      `),
    ).toBe(true);
  });

  test("auto-detected set covers describeMaybe integration tests", async () => {
    const describeMaybePattern =
      /const\s+describeMaybe\s*=\s*TEST_DB_URL\s*\?\s*describe\s*:\s*describe\.skip/;
    const glob = new Bun.Glob("**/*.test.ts");
    const missing: string[] = [];

    for (const rel of glob.scanSync({
      cwd: "__tests__/integration",
    })) {
      const path = `__tests__/integration/${rel.replaceAll("\\", "/")}`;
      const content = await Bun.file(path).text();
      if (!describeMaybePattern.test(content)) continue;
      if (!isSerialDbTest(path)) {
        missing.push(path);
      }
    }

    expect(missing).toEqual([]);
  });

  test("buildSerialDbTestSet matches module-load SERIAL_DB_TESTS", () => {
    const rebuilt = buildSerialDbTestSet();
    expect([...rebuilt].sort()).toEqual([...SERIAL_DB_TESTS].sort());
  });

  test("detects at least 50 integration DB tests", () => {
    expect(SERIAL_DB_TESTS.size).toBeGreaterThanOrEqual(50);
  });
});
