import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { urls } from "../../../e2e/fixtures";

const ADMIN_DASHBOARD_ROOT = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function adminRoutePagePath(path: string): string {
  const routePath = path.split("?")[0] ?? path;

  if (!routePath.startsWith("/admin")) {
    throw new Error(`Expected an admin URL, got ${path}`);
  }

  const relativePath = routePath.replace(/^\/admin\/?/u, "");
  if (relativePath.length === 0) {
    return join(ADMIN_DASHBOARD_ROOT, "page.tsx");
  }

  return join(ADMIN_DASHBOARD_ROOT, ...relativePath.split("/"), "page.tsx");
}

describe("e2e admin URL fixtures", () => {
  test("admin URL constants point at existing App Router pages", () => {
    const missing = Object.entries(urls)
      .filter(([key]) => key.startsWith("admin"))
      .map(([key, path]) => ({
        key,
        path,
        pagePath: adminRoutePagePath(path),
      }))
      .filter(({ pagePath }) => !existsSync(pagePath));

    expect(missing).toEqual([]);
  });
});
