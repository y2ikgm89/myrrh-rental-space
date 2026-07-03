import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");

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

describe("dialog accessible name contract", () => {
  test("DialogContent and AlertDialogContent expose an accessible name in the content subtree", () => {
    expect(existsSync(APP_ROOT)).toBe(true);

    const violations: string[] = [];
    const contentPattern =
      /<(?<name>DialogContent|AlertDialogContent)\b(?<attrs>[^>]*)>(?<children>[\s\S]*?)<\/\k<name>>/gu;

    for (const filePath of collectTsxFiles(APP_ROOT)) {
      const source = readFileSync(filePath, "utf8");

      for (const match of source.matchAll(contentPattern)) {
        const attrs = match.groups?.["attrs"] ?? "";
        const children = match.groups?.["children"] ?? "";
        const hasContentName =
          /aria-label\s*=|aria-labelledby\s*=/u.test(attrs) ||
          /<(DialogTitle|AlertDialogTitle)\b/u.test(children);

        if (!hasContentName) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, match.index)}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
