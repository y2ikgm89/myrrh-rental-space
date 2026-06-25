/**
 * 管理画面: セマンティックトークン規約で禁止されている Tailwind パレット直指定が
 * src/app/(admin) に混入していないことを静的に検証する。
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ADMIN_APP_ROOT = join(ROOT, "src", "app", "(admin)");

/** admin-ui-patterns の禁止例に相当するパターン（コメント内は検査対象外にしない — 稀な誤検知より混入防止を優先） */
const FORBIDDEN_ADMIN_CLASS_PATTERNS: RegExp[] = [
  /bg-black\/\d+/,
  /bg-gray-\d+/,
  /text-gray-\d+/,
  /border-gray-\d+/,
  /bg-slate-\d+/,
  /text-slate-\d+/,
  /border-slate-\d+/,
  /hover:bg-white\/\d+/,
  /hover:bg-gray-\d+/,
];

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectTsxFiles(p));
    } else if (
      ent.isFile() &&
      (ent.name.endsWith(".tsx") || ent.name.endsWith(".ts"))
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("admin design tokens", () => {
  test("管理画面に禁止パレット相当のユーティリティクラスが含まれない", () => {
    // admin route group の rename/消滅を silent green で見逃さない hard-fail
    expect(existsSync(ADMIN_APP_ROOT)).toBe(true);

    const files = collectTsxFiles(ADMIN_APP_ROOT);
    const violations: string[] = [];

    for (const filePath of files) {
      const text = readFileSync(filePath, "utf8");
      for (const re of FORBIDDEN_ADMIN_CLASS_PATTERNS) {
        if (re.test(text)) {
          violations.push(`${filePath}: matches ${re.source}`);
          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
