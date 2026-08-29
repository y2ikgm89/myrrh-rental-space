import { describe, expect, test } from "bun:test";

import {
  decideOutput,
  parseRanTestCount,
} from "../../../scripts/test-runner-output";

/** 実際の `bun test v1.4.0` の stderr（成功ファイル 1 本ぶん）。 */
const REAL_BUN_STDERR = `
 2 pass
 0 fail
 6 expect() calls
Ran 2 tests across 1 file. [31.00ms]
`;

/** 950 件（`__tests__/unit` の実サイズ）を 1 件ずつ流したときの判定列。 */
function decideAcrossRun(options: {
  isTty: boolean;
  totalFiles: number;
  failingAt?: number;
}): { bodies: number; perFileLines: number } {
  let bodies = 0;
  let perFileLines = 0;
  for (let doneCount = 1; doneCount <= options.totalFiles; doneCount += 1) {
    const decision = decideOutput({
      exitCode: doneCount === options.failingAt ? 1 : 0,
      isTty: options.isTty,
      doneCount,
      totalFiles: options.totalFiles,
    });
    if (decision.body) bodies += 1;
    if (decision.perFileLine) perFileLines += 1;
  }
  return { bodies, perFileLines };
}

describe("test runner output", () => {
  test("非 TTY では本文を失敗したファイルだけに絞る", () => {
    expect(
      decideOutput({ exitCode: 0, isTty: false, doneCount: 1, totalFiles: 950 })
        .body,
    ).toBe(false);
    expect(
      decideOutput({ exitCode: 1, isTty: false, doneCount: 1, totalFiles: 950 })
        .body,
    ).toBe(true);
  });

  test("TTY では成功しても本文を出す（console.log デバッグを殺さない）", () => {
    expect(
      decideOutput({ exitCode: 0, isTty: true, doneCount: 1, totalFiles: 950 })
        .body,
    ).toBe(true);
  });

  test("非 TTY の全件成功では本文ゼロ・1 行サマリが 10% 刻みに間引かれる", () => {
    expect(decideAcrossRun({ isTty: false, totalFiles: 950 })).toEqual({
      bodies: 0,
      perFileLines: 10,
    });
  });

  test("TTY では本文も 1 行サマリも全件出す（人間の体験を変えない）", () => {
    expect(decideAcrossRun({ isTty: true, totalFiles: 950 })).toEqual({
      bodies: 950,
      perFileLines: 950,
    });
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
      }).perFileLine,
    ).toBe(false);
    expect(
      decideOutput({
        exitCode: 1,
        isTty: false,
        doneCount: 500,
        totalFiles: 950,
      }).perFileLine,
    ).toBe(true);
  });
});
