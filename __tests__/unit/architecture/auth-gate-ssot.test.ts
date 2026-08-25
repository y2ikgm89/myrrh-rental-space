/**
 * Auth gate SSoT ratchet — new app-layer pages must use facade helpers.
 *
 * Customer: `@/shared/lib/customer-auth/gates`
 * Admin dashboard pages/layouts: `@/admin/helpers/page-auth`
 *
 * Legacy direct imports are not allowed.
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

function expectNoLegacyImports(label: string, actual: Set<string>): void {
  expect([...actual].sort()).toEqual([]);

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
  /**
   * **走査集合そのもの**の下限（監査 A-25）。
   *
   * 走査を `collectSourceFiles` helper へ出しているため、ファイル内に
   * `readdirSync` が残らず、下限 assert が 1 つも無いままだった。helper の拡張子判定を
   * 触るか `(public)` を別ディレクトリへ切り出すと、違反 0 件と走査 0 件を区別できないまま
   * 緑になる（変異検査で実証済み）。
   */
  test("gate が空振りしていない（走査件数の下限）", () => {
    // 実測: public 側 423 ファイル / admin dashboard 側 429 ファイル。
    expect(collectSourceFiles(PUBLIC_APP_ROOT).length).toBeGreaterThan(200);
    expect(collectSourceFiles(ADMIN_DASHBOARD_ROOT).length).toBeGreaterThan(
      200,
    );
  });

  test("public app pages use customer-auth/gates for new session checks", () => {
    const actual = collectLegacyImportOffenders(
      PUBLIC_APP_ROOT,
      CUSTOMER_LEGACY_SESSION_IMPORT,
      () => true,
    );

    expectNoLegacyImports("customer session gate", actual);
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

    expectNoLegacyImports("admin page auth gate", actual);
  }, 30_000);
});
