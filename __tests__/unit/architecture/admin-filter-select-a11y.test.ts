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

/**
 * そのソースにある「アクセシブルネームを持たない `<SelectTrigger>`」。
 *
 * **gate 本体と fixture は必ずこの合成後の判定を通す。** 部品
 * （`selectTriggerTags` / `hasAccessibleName`）を個別に fixture すると、
 * 両者を繋ぐ filter が壊れても fixture は緑のままになる（Codex が PR #2019 で指摘）。
 */
export function unnamedSelectTriggers(source: string): string[] {
  return selectTriggerTags(source).filter((tag) => !hasAccessibleName(tag));
}

describe("admin filter select accessibility", () => {
  test("検出できる形・できない形（fixture）", () => {
    // 属性なしは違反。
    expect(unnamedSelectTriggers('<SelectTrigger className="w-40">')).toEqual([
      '<SelectTrigger className="w-40">',
    ]);

    // aria-label / aria-labelledby のどちらでも名前が付く。
    expect(
      unnamedSelectTriggers(
        '<SelectTrigger aria-label="ステータス で絞り込む">',
      ),
    ).toEqual([]);
    expect(
      unnamedSelectTriggers('<SelectTrigger aria-labelledby="status-label">'),
    ).toEqual([]);

    // **属性名の前方一致で誤魔化せない。**
    expect(
      unnamedSelectTriggers('<SelectTrigger data-aria-label="x">'),
    ).toHaveLength(1);

    // 複数行に跨る tag も 1 件として拾う。
    expect(
      unnamedSelectTriggers('<SelectTrigger\n  className="w-40"\n  id="s"\n>'),
    ).toHaveLength(1);

    // 別コンポーネントは拾わない。
    expect(unnamedSelectTriggers('<SelectTriggerLike aria-label="x">')).toEqual(
      [],
    );

    // 名前付きと名前なしが混在するとき、名前なしだけを拾う。
    expect(
      unnamedSelectTriggers(
        '<SelectTrigger aria-label="a">\n<SelectTrigger className="b">',
      ),
    ).toEqual(['<SelectTrigger className="b">']);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(collectFilterFiles(ADMIN_DASHBOARD_ROOT).length).toBeGreaterThan(0);
  });

  test("filter SelectTrigger controls expose an accessible name", () => {
    const violations = collectFilterFiles(ADMIN_DASHBOARD_ROOT).flatMap(
      (filePath) =>
        unnamedSelectTriggers(readFileSync(filePath, "utf8")).map((tag) => ({
          file: relative(process.cwd(), filePath),
          tag,
        })),
    );

    expect(violations).toEqual([]);
  });
});
