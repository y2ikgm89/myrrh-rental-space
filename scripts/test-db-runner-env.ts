import { resolveTestDatabaseUrl } from "./test-db-url";

export const SERIAL_DB_TESTS = new Set<string>([
  "__tests__/integration/domain/reservations/cancel-by-token-roundtrip.test.ts",
  "__tests__/integration/domain/reservations/cancellation-with-refund-policy.test.ts",
  "__tests__/integration/domain/reservations/db-invariants.test.ts",
  "__tests__/integration/domain/reservations/refund-command.test.ts",
  "__tests__/integration/domain/reservations/reminder-idempotency.test.ts",
  "__tests__/integration/domain/reservations/series-advisory-lock.test.ts",
  "__tests__/integration/domain/reservations/space-overlap-concurrency.test.ts",
  "__tests__/integration/domain/coupons/coupon-status-filter.test.ts",
  "__tests__/integration/domain/events/registration-overbooking.test.ts",
  "__tests__/integration/domain/events/cancel-by-token-roundtrip.test.ts",
  "__tests__/integration/domain/events/online-format.test.ts",
  "__tests__/integration/lib/calendar-sync/meet-writeback.test.ts",
  "__tests__/integration/actions/public/event-waitlist-register.test.ts",
  "__tests__/integration/actions/public/event-cancel-promotes-waitlist.test.ts",
  "__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts",
  "__tests__/integration/reservations/claim-commands.test.ts",
  "__tests__/integration/reservations/public-commands.test.ts",
  "__tests__/integration/reservations/admin-commands.test.ts",
  "__tests__/integration/reservations/customer-commands.test.ts",
  "__tests__/integration/events/claim-commands.test.ts",
  "__tests__/integration/api/cron-waitlist-expire.test.ts",
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
