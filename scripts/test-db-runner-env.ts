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

type TestDatabaseUrlResolution = {
  url?: string;
  source?: "env" | "default-local";
};

export function findSelectedSerialDbTests(files: readonly string[]): string[] {
  return files.filter((file) => isSerialDbTest(file));
}

/**
 * 選択された serial DB テストがあるときだけ TEST_DATABASE_URL を解決する。
 * 解決に失敗する経路は無い（未設定なら docker-compose test-db 既定値）。
 */
export function resolveTestDatabaseUrlForRunner({
  selectedSerialDbTests,
  testDatabaseUrl,
}: {
  selectedSerialDbTests: readonly string[];
  testDatabaseUrl: string | undefined;
}): TestDatabaseUrlResolution {
  if (selectedSerialDbTests.length === 0) return {};

  return resolveTestDatabaseUrl(testDatabaseUrl);
}
