import { resolveTestDatabaseUrl } from "./test-db-url";

export const SERIAL_DB_TESTS = new Set<string>([
  "__tests__/integration/domain/reservations/cancel-by-token-roundtrip.test.ts",
  "__tests__/integration/domain/reservations/reminder-idempotency.test.ts",
  "__tests__/integration/domain/reservations/space-overlap-concurrency.test.ts",
  "__tests__/integration/domain/coupons/coupon-status-filter.test.ts",
  "__tests__/integration/domain/events/registration-overbooking.test.ts",
  "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
]);

type TestDatabaseUrlCheckResult =
  | { ok: true; url?: string; source?: "env" | "default-local" }
  | { ok: false; message: string };

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

  return { ok: true, ...resolveTestDatabaseUrl(testDatabaseUrl) };
}
