import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  NO_DOM_BUNFIG_PATH,
  NO_DOM_TEST_TREES,
  noDomBunfigArgs,
} from "../../../scripts/test-runner-bunfig";

/**
 * DOM 抜き起動の判定と、その前提が壊れていないこと。
 *
 * ここで守りたいのは 2 つ。
 *
 * 1. **対象の線引き**（architecture ツリーだけ。似た名前の隣接ファイルを巻き込まない）
 * 2. **フラグの形**（`--config=<path>` の等号形。スペース形は bun が黙って無視する）
 *
 * 2 が壊れると「差分は入った・テストは緑・なのに速くならない」になり、
 * 誰も気づけない。だから形そのものを assert する。
 */

const ROOT = process.cwd();

describe("DOM 抜きで起動するテストの選別", () => {
  test("architecture ツリーは DOM 抜きの bunfig を渡す", () => {
    expect(
      noDomBunfigArgs("__tests__/unit/architecture/cache-tag-literals.test.ts"),
    ).toEqual([`--config=${NO_DOM_BUNFIG_PATH}`]);
  });

  test("Windows の区切りでも同じ判定になる", () => {
    expect(
      noDomBunfigArgs(
        "__tests__\\unit\\architecture\\cache-tag-literals.test.ts",
      ),
    ).toEqual([`--config=${NO_DOM_BUNFIG_PATH}`]);
  });

  test("**似た名前の隣接ファイルを巻き込まない**（末尾スラッシュの見本）", () => {
    // `architecture-boundaries` は `architecture/` 配下ではない別ファイル。
    // 末尾スラッシュを外すと前方一致でこれを拾ってしまう。
    expect(
      noDomBunfigArgs("__tests__/unit/architecture-boundaries.test.ts"),
    ).toEqual([]);
  });

  test("DOM を使いうるツリーには渡さない", () => {
    expect(noDomBunfigArgs("__tests__/unit/forms/contact.test.tsx")).toEqual(
      [],
    );
    expect(
      noDomBunfigArgs("__tests__/integration/prisma/redundant-index.test.ts"),
    ).toEqual([]);
  });

  test("フラグは**等号形**（スペース形は bun が黙って無視する）", () => {
    const [flag] = noDomBunfigArgs(
      "__tests__/unit/architecture/cache-tag-literals.test.ts",
    );

    expect(flag).toBeDefined();
    // 1 引数であること。`["--config", path]` に分けると効かなくなる。
    expect(
      noDomBunfigArgs("__tests__/unit/architecture/cache-tag-literals.test.ts"),
    ).toHaveLength(1);
    expect(flag).toStartWith("--config=");
    expect(flag).not.toBe("--config");
  });

  test("渡す bunfig が実在し、DOM の preload を持たない", () => {
    const path = join(ROOT, NO_DOM_BUNFIG_PATH);
    expect(existsSync(path)).toBe(true);

    const contents = readFileSync(path, "utf8");
    // これが入っていたら DOM 抜きになっていない = 速くならない。
    expect(contents).not.toContain("setup-dom");
    // 非 DOM のグローバル設定は残す（env / server-only mock）。
    expect(contents).toContain("setup.ts");
  });

  test("対象ツリーは末尾スラッシュで終わる（前方一致の事故防止）", () => {
    for (const tree of NO_DOM_TEST_TREES) {
      expect(tree.endsWith("/")).toBe(true);
    }
  });
});
