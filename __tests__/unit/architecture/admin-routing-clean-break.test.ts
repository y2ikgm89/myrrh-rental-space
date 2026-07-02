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

describe("admin routing clean break", () => {
  test("does not expose the legacy /admin/space-categories redirect route", () => {
    const legacyPage = join(
      ADMIN_DASHBOARD_ROOT,
      "space-categories",
      "page.tsx",
    );

    expect(existsSync(legacyPage)).toBe(false);
  });

  test("does not keep source redirects from /admin/space-categories to the spaces category tab", () => {
    const offenders = collectSourceFiles(ADMIN_DASHBOARD_ROOT)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("SpaceCategoriesRedirectPage") ||
          source.includes("旧 URL `/admin/space-categories`") ||
          source.includes('redirect("/admin/spaces?tab=categories")')
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
