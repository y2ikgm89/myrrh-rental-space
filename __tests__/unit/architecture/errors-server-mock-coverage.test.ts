/**
 * `@/shared/lib/errors/server` の mock.module は export 全体を差し替える。
 * safeFetch だけ返すと依存グラフ上の criticalFetch import で
 * `SyntaxError: Export named 'criticalFetch' not found` になる。
 *
 * installErrorsServerMock（実モジュール spread）または criticalFetch の
 * 明示 export が必須。
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
