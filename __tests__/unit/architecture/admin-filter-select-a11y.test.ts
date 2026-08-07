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
  return /\s(?:aria-label|aria-labelledby)=/u.test(tag);
}

describe("admin filter select accessibility", () => {
  test("検出できる形・できない形（fixture）", () => {
    // 属性なしは違反。
    const bare = selectTriggerTags('<SelectTrigger className="w-40">');
    expect(bare).toHaveLength(1);
    expect(hasAccessibleName(bare[0] ?? "")).toBe(false);

    // aria-label / aria-labelledby のどちらでも名前が付く。
    expect(
      hasAccessibleName('<SelectTrigger aria-label="ステータス で絞り込む">'),
    ).toBe(true);
    expect(
      hasAccessibleName('<SelectTrigger aria-labelledby="status-label">'),
    ).toBe(true);

    // **属性名の前方一致で誤魔化せない。**
    expect(hasAccessibleName('<SelectTrigger data-aria-label="x">')).toBe(
      false,
    );

    // 複数行に跨る tag も 1 件として拾う。
    expect(
      selectTriggerTags('<SelectTrigger\n  className="w-40"\n  id="s"\n>'),
    ).toHaveLength(1);

    // 別コンポーネントは拾わない。
    expect(selectTriggerTags('<SelectTriggerLike aria-label="x">')).toEqual([]);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(collectFilterFiles(ADMIN_DASHBOARD_ROOT).length).toBeGreaterThan(0);
  });

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
