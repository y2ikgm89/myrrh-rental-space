import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");
const GLOBAL_ERROR_FILE = join(APP_ROOT, "global-error.tsx");
/**
 * `next/error` の `ErrorInfo` は 16.2 → 16.3 で shape が変わる
 * (`error: Error`→`unknown` / `unstable_retry`→`retry`)。差分をこの 1 ファイルに
 * 閉じ込めておかないと、bump のたびに error boundary 全件を触ることになる。
 */
const SEAM_FILE = join(
  ROOT,
  "src",
  "shared",
  "lib",
  "errors",
  "error-boundary-props.ts",
);

function collectErrorFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectErrorFiles(path));
    } else if (entry.isFile() && entry.name === "error.tsx") {
      out.push(path);
    }
  }

  return out;
}

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(path));
    } else if (entry.isFile() && /\.tsx?$/u.test(entry.name)) {
      out.push(path);
    }
  }

  return out;
}

describe("Next.js App Router error boundary contract", () => {
  test("route error files go through the version seam and expose an accessible heading", () => {
    expect(existsSync(APP_ROOT)).toBe(true);

    const clientViolations: string[] = [];
    const retryViolations: string[] = [];
    const directImportViolations: string[] = [];
    const resetViolations: string[] = [];
    const headingViolations: string[] = [];

    for (const filePath of collectErrorFiles(APP_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      const relativePath = relative(ROOT, filePath);

      if (!/^["']use client["'];/u.test(source.trimStart())) {
        clientViolations.push(relativePath);
      }
      if (!source.includes("errorBoundaryRetry")) {
        retryViolations.push(relativePath);
      }
      if (source.includes('from "next/error"')) {
        directImportViolations.push(relativePath);
      }
      if (/\breset\b/u.test(source)) {
        resetViolations.push(relativePath);
      }
      if (!/<h[12]\b|<Heading\s+level=\{?1\}?/u.test(source)) {
        headingViolations.push(relativePath);
      }
    }

    expect(clientViolations).toEqual([]);
    expect(retryViolations).toEqual([]);
    expect(directImportViolations).toEqual([]);
    expect(resetViolations).toEqual([]);
    expect(headingViolations).toEqual([]);
  });

  test("global-error supplies the required document shell and retry affordance", () => {
    expect(existsSync(GLOBAL_ERROR_FILE)).toBe(true);

    const source = readFileSync(GLOBAL_ERROR_FILE, "utf8");

    expect(source.trimStart()).toMatch(/^["']use client["'];/u);
    expect(source).toContain("<html");
    expect(source).toContain("<body");
    expect(source).toContain("errorBoundaryRetry");
    expect(source).not.toContain('from "next/error"');
    expect(source).toMatch(/<h[12]\b|<Heading\s+level=\{?1\}?/u);
  });

  test("the Next.js retry prop rename is referenced only inside the seam", () => {
    expect(existsSync(SEAM_FILE)).toBe(true);
    expect(readFileSync(SEAM_FILE, "utf8")).toContain("unstable_retry");

    const offenders = collectSourceFiles(join(ROOT, "src"))
      .filter((filePath) => filePath !== SEAM_FILE)
      .filter((filePath) =>
        readFileSync(filePath, "utf8").includes("unstable_retry"),
      )
      .map((filePath) => relative(ROOT, filePath));

    expect(offenders).toEqual([]);
  });
});
