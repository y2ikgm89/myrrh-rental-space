import { describe, expect, test } from "bun:test";

import { resolvePlaywrightReporters } from "../../../scripts/playwright-reporter";

describe("playwright reporter", () => {
  test("端末では list（公式の非 CI 既定と同じ）", () => {
    expect(resolvePlaywrightReporters(true)).toEqual([
      ["html", { outputFolder: "playwright-report" }],
      ["list"],
    ]);
  });

  test("非 TTY では dot（381 tests を 1 行ずつ出さない）", () => {
    expect(resolvePlaywrightReporters(false)).toEqual([
      ["html", { outputFolder: "playwright-report" }],
      ["dot"],
    ]);
  });

  test("html reporter はどちらでも外さない（失敗の詳細の置き場）", () => {
    for (const isTty of [true, false]) {
      expect(resolvePlaywrightReporters(isTty)[0]).toEqual([
        "html",
        { outputFolder: "playwright-report" },
      ]);
    }
  });

  test("playwright.config.ts が この解決関数を配線している", async () => {
    const source = await Bun.file("playwright.config.ts").text();
    // 行頭に固定する。`toContain` だとコメントアウトされた呼び出しにも
    // 一致して、配線を外しても緑になる（console-guard で実際に踏んだ）。
    expect(source).toMatch(/^\s*reporter: resolvePlaywrightReporters\(/mu);
  });
});
