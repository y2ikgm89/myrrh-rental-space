/**
 * 管理画面: フォーム送信は SubmitButton に統一する（admin-ui-patterns）。
 * `<Button type="submit">` や `<button type="submit">` の直書きを静的に禁止する。
 *
 * @see .agents/skills/admin-ui-review/SKILL.md
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ADMIN_APP_ROOT = join(ROOT, "src", "app", "(admin)");

const SUBMIT_BUTTON_IMPL = join(
  ADMIN_APP_ROOT,
  "admin",
  "(dashboard)",
  "_shared",
  "components",
  "ui",
  "SubmitButton.tsx",
);

/**
 * SubmitButton 適用対象外（複合条件 disabled 等）。
 * これらのファイルは `<Button type="submit" disabled={complexCondition}>` を保持する
 */
const SUBMIT_BUTTON_ALLOWLIST = new Set<string>([
  join(
    ADMIN_APP_ROOT,
    "admin",
    "(dashboard)",
    "settings",
    "_components",
    "sections",
    "SidebarSection.tsx",
  ),
]);

/** JSX / HTML で submit を直指定している疑い（実装ファイルは除外） */
const SUBMIT_ATTR_PATTERNS: RegExp[] = [
  /<Button[^>]*\btype="submit"/,
  /<button[^>]*\btype="submit"/,
  /<Button[^>]*\btype=\{"submit"\}/,
  /<button[^>]*\btype=\{"submit"\}/,
];

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectTsxFiles(p));
    } else if (ent.isFile() && ent.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

function compactForScan(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("admin submit button pattern", () => {
  test("管理画面の .tsx に Button/button の type=submit 直書きがない", () => {
    if (!existsSync(ADMIN_APP_ROOT)) {
      expect(true).toBe(true);
      return;
    }

    const files = collectTsxFiles(ADMIN_APP_ROOT);
    const violations: string[] = [];

    for (const filePath of files) {
      if (filePath === SUBMIT_BUTTON_IMPL) {
        continue;
      }
      if (SUBMIT_BUTTON_ALLOWLIST.has(filePath)) {
        continue;
      }
      const text = readFileSync(filePath, "utf8");
      const compact = compactForScan(text);
      for (const re of SUBMIT_ATTR_PATTERNS) {
        if (re.test(compact)) {
          violations.push(`${filePath}: matches ${re.source}`);
          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
