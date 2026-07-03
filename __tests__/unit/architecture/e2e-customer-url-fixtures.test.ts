import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { urls } from "../../../e2e/fixtures";

const PUBLIC_APP_ROOT = join(process.cwd(), "src", "app", "(public)");

const CUSTOMER_URL_KEYS = [
  "mypage",
  "mypageReservations",
  "mypageEvents",
  "mypageInquiries",
  "mypageProfile",
] as const;

function publicRoutePagePath(path: string): string {
  const routePath = path.split("?")[0] ?? path;

  if (!routePath.startsWith("/")) {
    throw new Error(`Expected a public URL path, got ${path}`);
  }

  const relativePath = routePath.replace(/^\/?/u, "");
  if (relativePath.length === 0) {
    return join(PUBLIC_APP_ROOT, "page.tsx");
  }

  return join(PUBLIC_APP_ROOT, ...relativePath.split("/"), "page.tsx");
}

describe("e2e customer URL fixtures", () => {
  test("customer URL constants point at existing App Router pages", () => {
    const urlRecord: Readonly<Record<string, string | undefined>> = urls;
    const missing = CUSTOMER_URL_KEYS.map((key) => ({
      key,
      path: urlRecord[key],
    }))
      .map(({ key, path }) => ({
        key,
        path,
        pagePath: path ? publicRoutePagePath(path) : null,
      }))
      .filter(({ pagePath }) => !pagePath || !existsSync(pagePath));

    expect(missing).toEqual([]);
  });
});
