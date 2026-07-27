import { readFileSync } from "node:fs";
import { join } from "node:path";

/** POSIX path normalization for cross-platform Set lookups. */
export function normalizePosixPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/u, "");
}

/**
 * Opt-in serial bucket overrides when content markers are insufficient.
 * Document each entry with reason.
 */
export const SERIAL_DB_TEST_FORCE_INCLUDE = new Set<string>([]);

/**
 * Opt-out serial bucket overrides for edge cases that falsely match markers.
 * Prefer fixing markers; mock.module("@/shared/db/prisma") files are auto-excluded.
 */
export const SERIAL_DB_TEST_FORCE_EXCLUDE = new Set<string>([]);

const PRISMA_MOCK_PATTERN = /mock\.module\s*\(\s*["']@\/shared\/db\/prisma["']/;

/** Content markers for integration tests that touch shared Postgres. */
const SERIAL_DB_MARKERS: readonly RegExp[] = [
  /process\.env\[["']TEST_DATABASE_URL["']\]/,
  /process\.env\[["']DATABASE_URL["']][^\n]*TEST_DATABASE_URL/,
];

export function fileContentNeedsSerialDbExecution(content: string): boolean {
  if (PRISMA_MOCK_PATTERN.test(content)) return false;
  return SERIAL_DB_MARKERS.some((pattern) => pattern.test(content));
}

/**
 * Scan `__tests__/integration/**` for real-DB test files.
 * Returns repo-relative POSIX paths (e.g. `__tests__/integration/...`).
 */
export function buildSerialDbTestSet(
  repoRoot = process.cwd(),
  integrationRelDir = "__tests__/integration",
): Set<string> {
  const integrationRoot = join(repoRoot, integrationRelDir);
  const glob = new Bun.Glob("**/*.test.{ts,tsx}");
  const detected = new Set<string>();

  for (const rel of glob.scanSync({ cwd: integrationRoot })) {
    const relPath = normalizePosixPath(`${integrationRelDir}/${rel}`);
    const absPath = join(repoRoot, relPath);
    const content = readFileSync(absPath, "utf-8");
    if (fileContentNeedsSerialDbExecution(content)) {
      detected.add(relPath);
    }
  }

  for (const path of SERIAL_DB_TEST_FORCE_INCLUDE) {
    detected.add(normalizePosixPath(path));
  }
  for (const path of SERIAL_DB_TEST_FORCE_EXCLUDE) {
    detected.delete(normalizePosixPath(path));
  }

  return detected;
}

export function isSerialDbTestPath(
  file: string,
  serialDbTests: ReadonlySet<string>,
): boolean {
  return serialDbTests.has(normalizePosixPath(file));
}
