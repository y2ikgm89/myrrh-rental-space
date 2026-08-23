import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const absentFiles = [
  join(process.cwd(), "scripts", "generate-terms-repair-migration.ts"),
  join(
    process.cwd(),
    "__tests__",
    "tools",
    "repair-terms-content-worker.test.ts",
  ),
  join(
    process.cwd(),
    "src",
    "shared",
    "lib",
    "lexical",
    "is-legacy-flat-lexical-json.ts",
  ),
  join(
    process.cwd(),
    "__tests__",
    "unit",
    "lib",
    "lexical",
    "is-legacy-flat-lexical-json.test.ts",
  ),
];

const sourceRoots = [
  join(process.cwd(), "src"),
  join(process.cwd(), "scripts"),
  join(process.cwd(), "__tests__"),
];

const thisFile = join(
  process.cwd(),
  "__tests__",
  "unit",
  "architecture",
  "terms-lexical-clean-break.test.ts",
);

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    return path === thisFile ? [] : [path];
  });
}

describe("terms Lexical clean-break contract", () => {
  test("does not keep historical terms content repair utilities", () => {
    for (const file of absentFiles) {
      expect(existsSync(file)).toBe(false);
    }

    const files = sourceRoots.flatMap(collectSourceFiles);
    // **走査集合そのもの**の下限（監査 A-25）。
    // 連結した文字列を `not.toContain` で見る形は、走査 0 件なら空文字列を
    // 検査するだけになり黙って緑になる（変異検査で実証済み）。実測 3499 ファイル。
    expect(files.length).toBeGreaterThan(2000);

    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toContain("isLegacyFlatLexicalJson");
    expect(source).not.toContain("generate-terms-repair-migration");
    expect(source).not.toContain("repair-terms-content-worker");
  });
});
