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

describe("errors/server mock.module coverage", () => {
  test("safeFetch-only partial mock.module は禁止（criticalFetch 欠落で import 失敗する）", () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(TESTS_ROOT)) {
      const source = readFileSync(file, "utf8");
      if (!ERRORS_SERVER_MOCK_RE.test(source)) continue;
      if (!source.includes("safeFetch")) continue;
      if (isCompleteErrorsServerMock(source)) continue;

      offenders.push(relative(ROOT, file).replaceAll("\\", "/"));
    }

    expect(offenders).toEqual([]);
  });
});
