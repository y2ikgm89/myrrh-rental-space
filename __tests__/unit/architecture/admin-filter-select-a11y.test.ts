import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ADMIN_DASHBOARD_ROOT = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function collectFilterFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFilterFiles(entryPath);
    }

    if (!entry.isFile()) return [];

    return /Filters?\.tsx$/u.test(entry.name) ? [entryPath] : [];
  });
}

function selectTriggerTags(source: string): string[] {
  return Array.from(source.matchAll(/<SelectTrigger\b[\s\S]*?>/gu), (match) =>
    match[0].replace(/\s+/gu, " "),
  );
}

function hasAccessibleName(tag: string): boolean {
  return /\s(?:aria-label|aria-labelledby|id)=/u.test(tag);
}

describe("admin filter select accessibility", () => {
  test("filter SelectTrigger controls expose an accessible name", () => {
    const violations = collectFilterFiles(ADMIN_DASHBOARD_ROOT).flatMap(
      (filePath) => {
        const source = readFileSync(filePath, "utf8");

        return selectTriggerTags(source)
          .filter((tag) => !hasAccessibleName(tag))
          .map((tag) => ({
            file: relative(process.cwd(), filePath),
            tag,
          }));
      },
    );

    expect(violations).toEqual([]);
  });
});
