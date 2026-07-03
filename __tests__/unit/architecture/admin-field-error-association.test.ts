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

describe("admin field error association", () => {
  test("inline Conform field errors expose the field error id", () => {
    expect(existsSync(ADMIN_DASHBOARD_ROOT)).toBe(true);

    const violations: string[] = [];
    const fieldErrorPattern =
      /fields\.([A-Za-z0-9_]+)\.errors\s*&&\s*\(\s*<p(?<attrs>[\s\S]*?)>/gu;

    for (const filePath of collectTsxFiles(ADMIN_DASHBOARD_ROOT)) {
      const source = readFileSync(filePath, "utf8");

      for (const match of source.matchAll(fieldErrorPattern)) {
        const fieldName = match[1];
        const attrs = match.groups?.["attrs"] ?? "";

        if (!attrs.includes(`id={fields.${fieldName}.errorId}`)) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
