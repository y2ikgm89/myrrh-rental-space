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
  test("走査対象が空でない（一覧を空にすると gate が無効化される）", () => {
    // 対象はリテラル配列。**空にすると flatMap が 1 度も回らず `missing` が
    // 空になって緑を返す**——「全部覆えている」と「覆う対象を消した」を
    // 区別できない。件数の下限をここで固定する。
    expect(PUBLIC_COVERAGE_SPECS.length).toBeGreaterThan(0);
    expect(PUBLIC_ROUTE_URL_KEYS.length).toBeGreaterThan(0);
    for (const specPath of PUBLIC_COVERAGE_SPECS) {
      expect(readSpec(specPath).length).toBeGreaterThan(0);
    }
  });

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
