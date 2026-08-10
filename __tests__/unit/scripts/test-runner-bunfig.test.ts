import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  DOM_REQUIRED_EXTENSIONS,
  DOM_REQUIRED_FILES,
  DOM_REQUIRED_PREFIXES,
  NO_DOM_BUNFIG_PATH,
  NO_DOM_DEFAULT_TREES,
  noDomBunfigArgs,
} from "../../../scripts/test-runner-bunfig";

/**
 * DOM 抜き起動の判定と、その前提が壊れていないこと。
 *
 * ここで守りたいのは 3 つ。
 *
 * 1. **既定の向き**（`__tests__/unit` は DOM 抜き。それ以外は従来どおり）
 * 2. **例外の実在**（DOM_REQUIRED_* が指すファイル・ディレクトリが今もあること）
 * 3. **フラグの形**（`--config=<path>` の等号形。スペース形は bun が黙って無視する）
 *
 * 2 が壊れる経路が非自明。リネームで例外が空振りしても**テストは緑のまま**
 * DOM 抜きに落ちるので、`typeof window` ガードを持つコードなら分岐だけが
 * 静かに反転する。3 が壊れると「差分は入った・テストは緑・なのに速くならない」。
 * どちらも自力では気づけないので、ここで固定する。
 */

const ROOT = process.cwd();

describe("DOM 抜きで起動するテストの選別", () => {
  test("`__tests__/unit` は既定で DOM 抜き", () => {
    for (const file of [
      "__tests__/unit/architecture/cache-tag-literals.test.ts",
      "__tests__/unit/domain/reservation/overlap.test.ts",
      "__tests__/unit/lib/crypto.test.ts",
      "__tests__/unit/architecture-boundaries.test.ts",
    ]) {
      expect(noDomBunfigArgs(file)).toEqual([`--config=${NO_DOM_BUNFIG_PATH}`]);
    }
  });

  test("Windows の区切りでも同じ判定になる", () => {
    expect(
      noDomBunfigArgs(
        "__tests__\\unit\\architecture\\cache-tag-literals.test.ts",
      ),
    ).toEqual([`--config=${NO_DOM_BUNFIG_PATH}`]);
  });

  test("`.test.tsx` は DOM を渡す（component を render する）", () => {
    expect(
      noDomBunfigArgs("__tests__/unit/components/admin/top-bar.test.tsx"),
    ).toEqual([]);
  });

  test("Lexical ツリーは `.ts` でも DOM を渡す", () => {
    expect(
      noDomBunfigArgs(
        "__tests__/unit/components/editor/lexical/space-card-node.test.ts",
      ),
    ).toEqual([]);
  });

  test("DOM_REQUIRED_FILES の単独指定は DOM を渡す", () => {
    for (const file of DOM_REQUIRED_FILES) {
      expect(noDomBunfigArgs(file)).toEqual([]);
    }
  });

  test("**`__tests__/unit` の外は既定のまま**（integration は全件未検証）", () => {
    expect(
      noDomBunfigArgs("__tests__/integration/prisma/redundant-index.test.ts"),
    ).toEqual([]);
    expect(noDomBunfigArgs("__tests__/helpers/factory.test.ts")).toEqual([]);
  });

  test("フラグは**等号形**（スペース形は bun が黙って無視する）", () => {
    const args = noDomBunfigArgs(
      "__tests__/unit/architecture/cache-tag-literals.test.ts",
    );

    // 1 引数であること。`["--config", path]` に分けると効かなくなる。
    expect(args).toHaveLength(1);
    expect(args[0]).toStartWith("--config=");
    expect(args[0]).not.toBe("--config");
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
});

describe("DOM 例外リストの前提", () => {
  test("ツリー指定は末尾スラッシュで終わる（前方一致の事故防止）", () => {
    for (const tree of [...NO_DOM_DEFAULT_TREES, ...DOM_REQUIRED_PREFIXES]) {
      expect(tree.endsWith("/")).toBe(true);
    }
  });

  test("**例外が空振りしていない**（リネームすると無言で DOM 抜きに落ちる）", () => {
    for (const prefix of DOM_REQUIRED_PREFIXES) {
      expect(existsSync(join(ROOT, prefix))).toBe(true);
    }
    for (const file of DOM_REQUIRED_FILES) {
      expect(existsSync(join(ROOT, file))).toBe(true);
    }
  });

  test("拡張子指定は `.test.tsx` の形（`.tsx` だけだと helper も掴む）", () => {
    for (const ext of DOM_REQUIRED_EXTENSIONS) {
      expect(ext).toStartWith(".test.");
    }
  });
});
