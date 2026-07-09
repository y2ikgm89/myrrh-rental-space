import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { urls } from "../../../e2e/fixtures";

const ADMIN_COVERAGE_SPECS = [
  "e2e/authenticated/admin/responsive-shell.spec.ts",
  "e2e/authenticated/admin/axe-admin-pages.spec.ts",
] as const;

const ADMIN_RESPONSIVE_SPEC =
  "e2e/authenticated/admin/responsive-shell.spec.ts";

const REQUIRED_RESPONSIVE_VIEWPORTS = ["mobile", "tablet", "desktop"] as const;

const ADMIN_ROUTE_URL_KEYS = Object.keys(urls).filter((key) =>
  key.startsWith("admin"),
);

function readSpec(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return "";
  return readFileSync(absolutePath, "utf8");
}

describe("admin responsive and a11y E2E coverage", () => {
  test("admin shell specs cover every admin URL fixture", () => {
    const missing = ADMIN_COVERAGE_SPECS.flatMap((specPath) => {
      const source = readSpec(specPath);

      return ADMIN_ROUTE_URL_KEYS.filter(
        (key) => !source.includes(`urls.${key}`),
      ).map((key) => ({ specPath, key }));
    });

    expect(missing).toEqual([]);
  });

  test("admin responsive shell covers mobile, tablet, and desktop viewports", () => {
    const source = readSpec(ADMIN_RESPONSIVE_SPEC);
    const missing = REQUIRED_RESPONSIVE_VIEWPORTS.filter(
      (viewport) =>
        !source.includes(`name: "${viewport}"`) &&
        !source.includes(`${viewport} viewport`),
    );

    expect(missing).toEqual([]);
  });
});
