/**
 * `__tests__` の `as any` を 0 件に固定する。
 *
 * 実害: refundPolicy の shape 破損 case が `as any` で Prisma JSON に渡っており、
 * 本体の InputJsonValue が変わってもテストは緑のままになる。置き換え後に再侵入
 * させない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const TESTS_ROOT = join(ROOT, "__tests__");

describe("__tests__ type escapes", () => {
  test("`as any` は 0 件", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const scanned: string[] = [];
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: TESTS_ROOT })) {
      if (rel.replaceAll("\\", "/").endsWith("tests-no-explicit-any.test.ts")) {
        continue;
      }
      scanned.push(rel);
      const source = readFileSync(join(TESTS_ROOT, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/\bas\s+any\b/.test(source)) {
        offenders.push(rel.replaceAll("\\", "/"));
      }
    }
    expect(scanned.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
