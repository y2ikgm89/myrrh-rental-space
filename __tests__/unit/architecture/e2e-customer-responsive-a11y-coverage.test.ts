import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CUSTOMER_ROUTE_URL_KEYS = [
  "mypageReservations",
  "mypageEvents",
  "mypageInquiries",
  "mypageProfile",
] as const;

const CUSTOMER_COVERAGE_SPECS = [
  "e2e/authenticated/customer/responsive-shell.spec.ts",
  "e2e/authenticated/customer/axe-customer-pages.spec.ts",
] as const;

function readSpec(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return "";
  return readFileSync(absolutePath, "utf8");
}

describe("customer responsive and a11y E2E coverage", () => {
  test("authenticated customer shell specs cover every primary customer URL fixture", () => {
    const missing = CUSTOMER_COVERAGE_SPECS.flatMap((specPath) => {
      const source = readSpec(specPath);

      return CUSTOMER_ROUTE_URL_KEYS.filter(
        (key) => !source.includes(`urls.${key}`),
      ).map((key) => ({ specPath, key }));
    });

    expect(missing).toEqual([]);
  });
});
