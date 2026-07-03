import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { urls } from "../../../e2e/fixtures";

const PUBLIC_APP_ROOT = join(process.cwd(), "src", "app", "(public)");

const PUBLIC_URL_KEYS = [
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
  "mypage",
  "mypageReservations",
  "mypageEvents",
  "mypageInquiries",
  "mypageProfile",
] as const;

const EXPECTED_PUBLIC_URL_KEYS = Object.keys(urls).filter(
  (key) => !key.startsWith("admin"),
);

function publicRoutePagePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`Expected a public URL path, got ${path}`);
  }

  const relativePath = path.replace(/^\/?/u, "");
  if (relativePath.length === 0) {
    return join(PUBLIC_APP_ROOT, "page.tsx");
  }

  return join(PUBLIC_APP_ROOT, ...relativePath.split("/"), "page.tsx");
}

describe("e2e public URL fixtures", () => {
  test("public URL fixture guard tracks every non-admin URL constant", () => {
    const actualKeys: string[] = [...PUBLIC_URL_KEYS].sort();
    const expectedKeys = [...EXPECTED_PUBLIC_URL_KEYS].sort();

    expect(actualKeys).toEqual(expectedKeys);
  });

  test("public URL constants point at existing App Router pages", () => {
    const missing = PUBLIC_URL_KEYS.map((key) => ({
      key,
      path: urls[key],
      pagePath: publicRoutePagePath(urls[key]),
    })).filter(({ pagePath }) => !existsSync(pagePath));

    expect(missing).toEqual([]);
  });
});
