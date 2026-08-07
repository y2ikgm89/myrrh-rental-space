/**
 * `@/shared/lib/errors/server` の mock.module は export 全体を差し替える。
 * safeFetch だけ返すと依存グラフ上の criticalFetch import で
 * `SyntaxError: Export named 'criticalFetch' not found` になる。
 *
 * installErrorsServerMock（実モジュール spread）または criticalFetch の
 * 明示 export が必須。
 *
 * ## この gate が主張しないこと
 *
 * 免除の判定は**ファイル全体の文字列存在**であって、mock 呼び出しの中身では
 * ない。したがって safeFetch だけを返す部分 mock でも、**どこかのコメントで
 * `criticalFetch` に触れているだけで免除される**（実測: コメント 1 行で
 * fail → pass に変わる）。
 *
 * 呼び出し本体に絞る実装を試したが、既存の正当な形を 3 つとも誤検出した:
 * 共有ヘルパーは docstring 内に同じ呼び出しを書いており正規表現がそちらに
 * 当たる、`...realErrorsServer` のように spread の変数名が `actual` でない、
 * など。堅く判定するには AST + 別名追跡が要る。
 *
 * **抜けたときの帰結が「そのテスト自身が import に失敗して落ちる」**（上記の
 * SyntaxError）なので、これは黙って通る穴ではなく気づきが遅れるだけ。
 * 壊れやすい判定を足すより、範囲を正直に書いて留める。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const TESTS_ROOT = `${ROOT}/__tests__`;

const ERRORS_SERVER_MOCK_RE =
  /mock\.module\(\s*["']@\/shared\/lib\/errors\/server["']/u;

function isCompleteErrorsServerMock(source: string): boolean {
  return (
    source.includes("installErrorsServerMock") ||
    source.includes("criticalFetch") ||
    source.includes("...actual")
  );
}

/**
 * その **1 ファイルが違反か**（gate 本体と fixture はここだけを通す）。
 *
 * 3 条件（対象 module の mock である / safeFetch に触れる / 完全 mock でない）を
 * 個別に fixture すると、**繋ぎ方が壊れても fixture は緑のまま**になる
 * （Codex が PR #2019 で指摘）。合成後の判定を 1 つ export する。
 */
export function isPartialErrorsServerMock(source: string): boolean {
  if (!ERRORS_SERVER_MOCK_RE.test(source)) return false;
  if (!source.includes("safeFetch")) return false;
  return !isCompleteErrorsServerMock(source);
}

describe("errors/server mock.module coverage", () => {
  test("検出できる形・できない形（fixture）", () => {
    const partial =
      'mock.module("@/shared/lib/errors/server", () => ({ safeFetch }));';

    // safeFetch だけの部分 mock は違反。
    expect(isPartialErrorsServerMock(partial)).toBe(true);

    // 免除の 3 形。
    expect(isPartialErrorsServerMock(`${partial} criticalFetch`)).toBe(false);
    expect(isPartialErrorsServerMock(`${partial} ...actual`)).toBe(false);
    expect(
      isPartialErrorsServerMock(`${partial} installErrorsServerMock`),
    ).toBe(false);

    // safeFetch に触れない mock は対象外（この gate の関心事ではない）。
    expect(
      isPartialErrorsServerMock(
        'mock.module("@/shared/lib/errors/server", () => ({ logError }));',
      ),
    ).toBe(false);

    // 別モジュールの mock は対象外。
    expect(
      isPartialErrorsServerMock(
        'mock.module("@/shared/lib/other", () => ({ safeFetch }));',
      ),
    ).toBe(false);

    // **既知の限界（docstring 参照）**: コメントで触れるだけでも免除される。
    // 直せない事実をここで固定し、直したつもりにならないようにする。
    expect(
      isPartialErrorsServerMock(`// criticalFetch は別経路 ${partial}`),
    ).toBe(false);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(collectSourceFiles(TESTS_ROOT).length).toBeGreaterThan(100);
  });

  test("safeFetch-only partial mock.module は禁止（criticalFetch 欠落で import 失敗する）", () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(TESTS_ROOT)) {
      if (!isPartialErrorsServerMock(readFileSync(file, "utf8"))) continue;

      offenders.push(relative(ROOT, file).replaceAll("\\", "/"));
    }

    expect(offenders).toEqual([]);
  });
});
