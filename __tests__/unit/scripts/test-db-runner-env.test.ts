import { describe, expect, test } from "bun:test";

import {
  assertRequiredTestDatabaseUrl,
  findSelectedSerialDbTests,
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
      assertRequiredTestDatabaseUrl({
        selectedSerialDbTests: [],
        testDatabaseUrl: undefined,
      }),
    ).toEqual({ ok: true });
  });

  test("fails clearly when selected serial DB tests lack TEST_DATABASE_URL", () => {
    const result = assertRequiredTestDatabaseUrl({
      selectedSerialDbTests: [
        "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
      ],
      testDatabaseUrl: "   ",
    });

    expect(result).toEqual({
      ok: false,
      message:
        "[run-tests] TEST_DATABASE_URL is required for real-DB integration tests.\n" +
        "Selected real-DB tests:\n" +
        "  - __tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts\n" +
        "Set TEST_DATABASE_URL to a disposable migrated PostgreSQL database, then re-run the test command.",
    });
  });

  test("allows selected serial DB tests when TEST_DATABASE_URL is set", () => {
    expect(
      assertRequiredTestDatabaseUrl({
        selectedSerialDbTests: [
          "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
        ],
        testDatabaseUrl:
          "postgresql://postgres:postgres@localhost:5433/myrrh_test",
      }),
    ).toEqual({ ok: true });
  });

  test("run-tests exits before silent-skipping selected real-DB tests without TEST_DATABASE_URL", async () => {
    const env = { ...process.env };
    delete env["TEST_DATABASE_URL"];

    const proc = Bun.spawn(
      [
        "bun",
        "scripts/run-tests.ts",
        "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        env,
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(1);
    expect(`${stdout}\n${stderr}`).toContain(
      "TEST_DATABASE_URL is required for real-DB integration tests",
    );
  });
});
