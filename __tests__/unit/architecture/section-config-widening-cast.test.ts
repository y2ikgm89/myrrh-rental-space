/**
 * `.claude/rules/type-safety.md` の SectionConfig gate:
 * `as SectionConfig` 直 cast は section registry 経由の narrow を bypass するため
 * `src/` 全体で 0 件を強制する。
 *
 * 2490 行あった `architecture-boundaries.test.ts` の末尾 3 describe を per-concern に
 * 分離した際にここに切り出した。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");

describe("SectionConfig union widening cast 構造解消済（方針: .claude/rules/type-safety.md）", () => {
  test("`as SectionConfig` cast は src/ 全体で 0 件", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const pattern = /\bas\s+SectionConfig\b/;
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      const content = readFileSync(abs, "utf-8");
      if (pattern.test(content)) {
        offenders.push(relative(ROOT, abs));
      }
    }
    expect(offenders).toEqual([]);
  }, 30000);
});
