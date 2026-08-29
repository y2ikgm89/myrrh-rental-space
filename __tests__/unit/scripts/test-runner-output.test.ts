import { describe, expect, test } from "bun:test";

import {
  decideOutput,
  FAILED_FILE_LIST_LIMIT,
  formatFailedFileLines,
  NON_TTY_OUTPUT_BUDGET_CHARS,
  parseRanTestCount,
} from "../../../scripts/test-runner-output";

/** 実際の `bun test v1.4.0` の stderr（成功ファイル 1 本ぶん）。 */
const REAL_BUN_STDERR = `
 2 pass
 0 fail
 6 expect() calls
Ran 2 tests across 1 file. [31.00ms]
`;

/** 1 失敗あたりの実測出力量（20 件失敗で 12,350 字）。 */
const CHARS_PER_FAILURE = 617;

/** 950 件を 1 件ずつ流したときの集計。`failEvery` 件ごとに失敗させる。 */
function decideAcrossRun(options: {
  isTty: boolean;
  totalFiles: number;
  failEvery?: number;
}): { bodies: number; perFileLines: number; suppressed: number } {
  let bodies = 0;
  let perFileLines = 0;
  let suppressed = 0;
  let emittedChars = 0;

  for (let doneCount = 1; doneCount <= options.totalFiles; doneCount += 1) {
    const failed =
      options.failEvery !== undefined && doneCount % options.failEvery === 0;
    const decision = decideOutput({
      exitCode: failed ? 1 : 0,
      isTty: options.isTty,
      doneCount,
      totalFiles: options.totalFiles,
      emittedChars,
    });
    if (decision.body) {
      bodies += 1;
      emittedChars += CHARS_PER_FAILURE;
    }
    if (decision.perFileLine) perFileLines += 1;
    if (failed && !decision.body && !decision.perFileLine) suppressed += 1;
  }
  return { bodies, perFileLines, suppressed };
}

describe("test runner output", () => {
  test("非 TTY では本文を失敗したファイルだけに絞る", () => {
    expect(
      decideOutput({
        exitCode: 0,
        isTty: false,
        doneCount: 1,
        totalFiles: 950,
        emittedChars: 0,
      }).body,
    ).toBe(false);
    expect(
      decideOutput({
        exitCode: 1,
        isTty: false,
        doneCount: 1,
        totalFiles: 950,
        emittedChars: 0,
      }).body,
    ).toBe(true);
  });

  test("TTY では成功しても本文を出す（console.log デバッグを殺さない）", () => {
    expect(
      decideOutput({
        exitCode: 0,
        isTty: true,
        doneCount: 1,
        totalFiles: 950,
        emittedChars: 0,
      }).body,
    ).toBe(true);
  });

  test("非 TTY の全件成功では本文ゼロ・1 行サマリが 10% 刻みに間引かれる", () => {
    expect(decideAcrossRun({ isTty: false, totalFiles: 950 })).toEqual({
      bodies: 0,
      perFileLines: 10,
      suppressed: 0,
    });
  });

  test("TTY では本文も 1 行サマリも全件出す（人間の体験を変えない）", () => {
    expect(decideAcrossRun({ isTty: true, totalFiles: 950 })).toEqual({
      bodies: 950,
      perFileLines: 950,
      suppressed: 0,
    });
  });

  test("非 TTY の大量失敗では予算を超えたぶんを止める", () => {
    // 950 件すべて失敗。予算 24,000 字 ÷ 617 字 = 38 件ぶんで打ち止め。
    const result = decideAcrossRun({
      isTty: false,
      totalFiles: 950,
      failEvery: 1,
    });
    expect(result.bodies).toBe(
      Math.ceil(NON_TTY_OUTPUT_BUDGET_CHARS / CHARS_PER_FAILURE),
    );
    // 止めた件数は呼び出し側が数えられる（黙って消えない）。
    expect(result.suppressed).toBe(950 - result.bodies);
  });

  test("TTY の大量失敗は予算に縛られない", () => {
    expect(
      decideAcrossRun({ isTty: true, totalFiles: 950, failEvery: 1 }),
    ).toEqual({ bodies: 950, perFileLines: 950, suppressed: 0 });
  });

  test("失敗ファイル一覧は上限を超えたら件数を明示する", () => {
    const files = Array.from({ length: 950 }, (_, i) => `file-${String(i)}`);
    const lines = formatFailedFileLines(files, FAILED_FILE_LIST_LIMIT);
    expect(lines).toHaveLength(FAILED_FILE_LIST_LIMIT + 1);
    expect(lines.at(-1)).toBe(
      `  ... 他 ${String(950 - FAILED_FILE_LIST_LIMIT)} 件`,
    );
  });

  test("上限以内なら「他 N 件」を足さない", () => {
    expect(formatFailedFileLines(["a", "b"], FAILED_FILE_LIST_LIMIT)).toEqual([
      "  - a",
      "  - b",
    ]);
  });

  test("bun の実出力からテスト件数を読む", () => {
    expect(parseRanTestCount(REAL_BUN_STDERR)).toBe(2);
    expect(parseRanTestCount("Ran 1 test across 1 file. [12.00ms]")).toBe(1);
  });

  test("件数が読めない出力は 0 ではなく null を返す", () => {
    // 黙って 0 に落とすと、集計の「N tests」が本当は取りこぼしなのか
    // 本当に 0 件なのか区別できなくなる。
    expect(parseRanTestCount("")).toBeNull();
    expect(parseRanTestCount(" 2 pass\n 0 fail\n")).toBeNull();
  });

  test("失敗ファイルの 1 行サマリは非 TTY でも間引かない", () => {
    // 500 件目は 10% 刻みの境界ではない（境界は 95 の倍数）。
    expect(
      decideOutput({
        exitCode: 0,
        isTty: false,
        doneCount: 500,
        totalFiles: 950,
        emittedChars: 0,
      }).perFileLine,
    ).toBe(false);
    expect(
      decideOutput({
        exitCode: 1,
        isTty: false,
        doneCount: 500,
        totalFiles: 950,
        emittedChars: 0,
      }).perFileLine,
    ).toBe(true);
  });
});
