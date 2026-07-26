import {
  buildSerialDbTestSet,
  isSerialDbTestPath,
} from "./serial-db-test-detection";
import { resolveTestDatabaseUrl } from "./test-db-url";

export {
  buildSerialDbTestSet,
  fileContentNeedsSerialDbExecution,
  normalizePosixPath,
  SERIAL_DB_TEST_FORCE_EXCLUDE,
  SERIAL_DB_TEST_FORCE_INCLUDE,
} from "./serial-db-test-detection";

/** Auto-detected at module load from integration test content markers. */
export const SERIAL_DB_TESTS = buildSerialDbTestSet();

export function isSerialDbTest(file: string): boolean {
  return isSerialDbTestPath(file, SERIAL_DB_TESTS);
}

type TestDatabaseUrlCheckResult =
  | { ok: true; url?: string; source?: "env" | "default-local" }
  | { ok: false; message: string };

export function findSelectedSerialDbTests(files: readonly string[]): string[] {
  return files.filter((file) => isSerialDbTest(file));
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
