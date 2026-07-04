export const SERIAL_DB_TESTS = new Set<string>([
  "__tests__/integration/domain/reservations/cancel-by-token-roundtrip.test.ts",
  "__tests__/integration/domain/reservations/reminder-idempotency.test.ts",
  "__tests__/integration/domain/coupons/coupon-status-filter.test.ts",
  "__tests__/integration/domain/events/registration-overbooking.test.ts",
  "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
]);

type TestDatabaseUrlCheckResult = { ok: true } | { ok: false; message: string };

export function findSelectedSerialDbTests(files: readonly string[]): string[] {
  return files.filter((file) => SERIAL_DB_TESTS.has(file));
}

export function assertRequiredTestDatabaseUrl({
  selectedSerialDbTests,
  testDatabaseUrl,
}: {
  selectedSerialDbTests: readonly string[];
  testDatabaseUrl: string | undefined;
}): TestDatabaseUrlCheckResult {
  if (selectedSerialDbTests.length === 0) return { ok: true };
  if (testDatabaseUrl?.trim()) return { ok: true };

  return {
    ok: false,
    message:
      "[run-tests] TEST_DATABASE_URL is required for real-DB integration tests.\n" +
      "Selected real-DB tests:\n" +
      selectedSerialDbTests.map((file) => `  - ${file}`).join("\n") +
      "\nSet TEST_DATABASE_URL to a disposable migrated PostgreSQL database, then re-run the test command.",
  };
}
