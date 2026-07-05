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

  test("uses docker-compose test-db default when selected serial DB tests lack TEST_DATABASE_URL", () => {
    const result = assertRequiredTestDatabaseUrl({
      selectedSerialDbTests: [
        "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
      ],
      testDatabaseUrl: "   ",
    });

    expect(result).toEqual({
      ok: true,
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public",
      source: "default-local",
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
    ).toEqual({
      ok: true,
      url: "postgresql://postgres:postgres@localhost:5433/myrrh_test",
      source: "env",
    });
  });
});
