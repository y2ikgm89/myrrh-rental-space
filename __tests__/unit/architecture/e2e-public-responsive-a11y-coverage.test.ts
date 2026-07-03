import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_ROUTE_URL_KEYS = [
  "home",
  "about",
  "access",
  "spaces",
  "reservation",
  "blog",
  "news",
  "contact",
  "events",
  "faq",
  "terms",
  "customerLogin",
] as const;

const PUBLIC_COVERAGE_SPECS = [
  "e2e/public/responsive-shell.spec.ts",
  "e2e/a11y/axe-public-pages.spec.ts",
] as const;

function readSpec(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return "";
  return readFileSync(absolutePath, "utf8");
}

describe("public responsive and a11y E2E coverage", () => {
  test("public shell specs cover every primary unauthenticated public URL fixture", () => {
    const missing = PUBLIC_COVERAGE_SPECS.flatMap((specPath) => {
      const source = readSpec(specPath);

      return PUBLIC_ROUTE_URL_KEYS.filter(
        (key) => !source.includes(`urls.${key}`),
      ).map((key) => ({ specPath, key }));
    });

    expect(missing).toEqual([]);
  });
});
