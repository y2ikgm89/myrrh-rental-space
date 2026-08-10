import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");
const GLOBAL_ERROR_FILE = join(APP_ROOT, "global-error.tsx");

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

describe("Next.js App Router error boundary contract", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    // 収集が黙って 0 件になると offenders も必ず空になり、緑が「違反なし」を
    // 意味しなくなる（local/gate-scan-must-not-be-silently-empty が強制）。
    expect(collectErrorFiles(APP_ROOT).length).toBeGreaterThan(0);
  });

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
});
