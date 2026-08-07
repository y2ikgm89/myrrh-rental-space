import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ADMIN_DASHBOARD_ROOT = join(
  ROOT,
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function collectSourceFiles(dir: string): string[] {
  const entries = new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: dir });
  return [...entries].map((entry) => join(dir, entry));
}

/** 旧 `/admin/space-categories` の痕跡が残っているか（純粋判定）。 */
export function keepsLegacySpaceCategoriesRedirect(source: string): boolean {
  return (
    source.includes("SpaceCategoriesRedirectPage") ||
    source.includes("旧 URL `/admin/space-categories`") ||
    source.includes('redirect("/admin/spaces?tab=categories")')
  );
}

describe("admin routing clean break", () => {
  test("does not expose the legacy /admin/space-categories redirect route", () => {
    const legacyPage = join(
      ADMIN_DASHBOARD_ROOT,
      "space-categories",
      "page.tsx",
    );

    expect(existsSync(legacyPage)).toBe(false);
  });

  test("検出できる形・できない形（fixture）", () => {
    // 3 つの痕跡のどれか 1 つでも残っていれば違反。
    expect(
      keepsLegacySpaceCategoriesRedirect(
        "export function SpaceCategoriesRedirectPage() {}",
      ),
    ).toBe(true);
    expect(
      keepsLegacySpaceCategoriesRedirect(
        "// 旧 URL `/admin/space-categories` の互換",
      ),
    ).toBe(true);
    expect(
      keepsLegacySpaceCategoriesRedirect(
        'redirect("/admin/spaces?tab=categories");',
      ),
    ).toBe(true);

    // 現行 URL への通常の遷移は違反ではない。
    expect(
      keepsLegacySpaceCategoriesRedirect(
        '<Link href="/admin/spaces?tab=categories" />',
      ),
    ).toBe(false);
    expect(keepsLegacySpaceCategoriesRedirect("const x = 1;")).toBe(false);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(collectSourceFiles(ADMIN_DASHBOARD_ROOT).length).toBeGreaterThan(50);
  });

  test("does not keep source redirects from /admin/space-categories to the spaces category tab", () => {
    const offenders = collectSourceFiles(ADMIN_DASHBOARD_ROOT)
      .filter((file) =>
        keepsLegacySpaceCategoriesRedirect(readFileSync(file, "utf8")),
      )
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
