/**
 * `.claude/rules/type-safety.md` の SectionConfig gate:
 * `as SectionConfig` 直 cast は section registry 経由の narrow を bypass するため
 * `src/` 全体で 0 件を強制する。
 *
 * `architecture-boundaries.test.ts` の末尾の describe 群を per-concern に
 * 分離した際にここへ切り出した。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");

/** `as SectionConfig` の widening cast を含むか。 */
export function hasSectionConfigWideningCast(source: string): boolean {
  return /\bas\s+SectionConfig\b/u.test(source);
}

describe("SectionConfig union widening cast 構造解消済（方針: .claude/rules/type-safety.md）", () => {
  test("検出できる形・できない形（fixture）", () => {
    expect(
      hasSectionConfigWideningCast("const c = raw as SectionConfig;"),
    ).toBe(true);
    // 改行を挟んでも同じ cast。
    expect(
      hasSectionConfigWideningCast("const c = raw as\n  SectionConfig;"),
    ).toBe(true);
    // 型注釈は cast ではない。
    expect(
      hasSectionConfigWideningCast("const c: SectionConfig = parse(x);"),
    ).toBe(false);
    // 名前が前方一致するだけの別の型は拾わない。
    expect(
      hasSectionConfigWideningCast("const c = raw as SectionConfigDraft;"),
    ).toBe(false);
  });

  test("`as SectionConfig` cast は src/ 全体で 0 件", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const scanned: string[] = [];
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      scanned.push(abs);
      if (hasSectionConfigWideningCast(readFileSync(abs, "utf-8"))) {
        offenders.push(relative(ROOT, abs));
      }
    }
    // 走査が 0 件に落ちると違反ゼロと区別が付かない。
    expect(scanned.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  }, 30000);
});
