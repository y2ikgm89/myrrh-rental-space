/**
 * Auth gate SSoT ratchet — new app-layer pages must use facade helpers.
 *
 * Customer: `@/shared/lib/customer-auth/gates`
 * Admin dashboard pages/layouts: `@/admin/helpers/page-auth`
 *
 * Legacy direct imports remain allowlisted until migrated.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");
const ADMIN_DASHBOARD_ROOT = join(
  SRC_ROOT,
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

const CUSTOMER_LEGACY_SESSION_IMPORT =
  /import\s*\{[^}]*\b(?:verifyCustomerSession|getCurrentCustomerUser)\b[^}]*\}\s*from\s*["']@\/shared\/lib\/customer-auth["']/u;

const ADMIN_LEGACY_PAGE_AUTH_IMPORT =
  /import\s*\{[^}]*\b(?:requireAdminDashboardAccess|requireAdminPermission|requireAdminResourcePermission|verifyAdminSession)\b[^}]*\}\s*from\s*["']@\/admin\/queries\/_helpers["']/u;

/** Frozen allowlist: legacy direct customer session imports under `(public)`. */
const CUSTOMER_LEGACY_SESSION_IMPORT_ALLOWLIST = new Set([]);

/** Frozen allowlist: legacy admin page auth imports in dashboard shell files. */
const ADMIN_LEGACY_PAGE_AUTH_IMPORT_ALLOWLIST = new Set([]);

function normalizeRelPath(filePath: string): string {
  return relative(ROOT, filePath).replaceAll("\\", "/");
}

function collectLegacyImportOffenders(
  rootDir: string,
  pattern: RegExp,
  fileFilter: (relPath: string) => boolean,
): Set<string> {
  const offenders = new Set<string>();

  for (const filePath of collectSourceFiles(rootDir)) {
    const relPath = normalizeRelPath(filePath);
    if (relPath.endsWith("/helpers/page-auth.ts")) continue;
    if (!fileFilter(relPath)) continue;

    const source = readFileSync(filePath, "utf8");
    if (pattern.test(source)) {
      offenders.add(relPath);
    }
  }

  return offenders;
}

function expectFrozenAllowlist(
  label: string,
  actual: Set<string>,
  allowlist: Set<string>,
): void {
  const newViolations = [...actual]
    .filter((file) => !allowlist.has(file))
    .sort();
  expect(newViolations).toEqual([]);

  const staleAllowlist = [...allowlist]
    .filter((file) => !actual.has(file))
    .sort();
  expect(staleAllowlist).toEqual([]);

  expect(
    existsSync(join(ROOT, "src/shared/lib/customer-auth/gates.ts")),
    `${label}: customer gate facade must exist`,
  ).toBe(true);
  expect(
    existsSync(
      join(
        ROOT,
        "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts",
      ),
    ),
    `${label}: admin page auth facade must exist`,
  ).toBe(true);
}

describe("auth gate SSoT ratchet", () => {
  test("public app pages use customer-auth/gates for new session checks", () => {
    const actual = collectLegacyImportOffenders(
      PUBLIC_APP_ROOT,
      CUSTOMER_LEGACY_SESSION_IMPORT,
      () => true,
    );

    expectFrozenAllowlist(
      "customer session gate",
      actual,
      CUSTOMER_LEGACY_SESSION_IMPORT_ALLOWLIST,
    );
  }, 30_000);

  test("admin dashboard pages use helpers/page-auth for new page gates", () => {
    const actual = collectLegacyImportOffenders(
      ADMIN_DASHBOARD_ROOT,
      ADMIN_LEGACY_PAGE_AUTH_IMPORT,
      (relPath) =>
        relPath.endsWith("/layout.tsx") ||
        relPath.endsWith("/page.tsx") ||
        relPath.includes("/_components/"),
    );

    expectFrozenAllowlist(
      "admin page auth gate",
      actual,
      ADMIN_LEGACY_PAGE_AUTH_IMPORT_ALLOWLIST,
    );
  }, 30_000);
});
