import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsxFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }

  return out;
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/u).length;
}

describe("admin form error notifications", () => {
  test("form-level Conform errors are announced to assistive technology", () => {
    expect(existsSync(ADMIN_DASHBOARD_ROOT)).toBe(true);

    const violations: string[] = [];
    const marker = "form.errors && form.errors.length > 0";

    for (const filePath of collectTsxFiles(ADMIN_DASHBOARD_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      let index = source.indexOf(marker);

      while (index >= 0) {
        const errorBlock = source.slice(index, index + 700);
        if (!/role="alert"|aria-live=/u.test(errorBlock)) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, index)}`,
          );
        }
        index = source.indexOf(marker, index + marker.length);
      }
    }

    expect(violations).toEqual([]);
  });
});
