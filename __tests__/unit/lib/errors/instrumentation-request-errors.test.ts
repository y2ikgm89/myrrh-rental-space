import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { shouldIgnoreRequestError } from "@/instrumentation";

describe("shouldIgnoreRequestError", () => {
  test("ignores Node client aborts reported by Next onRequestError", () => {
    const error = Object.assign(new Error("aborted"), {
      code: "ECONNRESET",
      digest: "1074079976",
    });

    expect(shouldIgnoreRequestError(error)).toBe(true);
  });

  test("keeps non-abort ECONNRESET errors visible", () => {
    const error = Object.assign(new Error("database connection reset"), {
      code: "ECONNRESET",
    });

    expect(shouldIgnoreRequestError(error)).toBe(false);
  });

  test("keeps ordinary application errors visible", () => {
    expect(shouldIgnoreRequestError(new Error("render failed"))).toBe(false);
  });

  // React の RSC renderer は destination stream が閉じたときに
  // `createCancelHandler` 経由で素の Error を投げる。利用者が保存中に画面を
  // 離れると必ず出るので、Error Reporting へ送るとアラートが利用者の離脱で鳴る。
  test("ignores React's destination-closed cancellation", () => {
    expect(
      shouldIgnoreRequestError(
        new Error("The destination stream closed early."),
      ),
    ).toBe(true);
  });

  // 兄弟のメッセージは**意図的に残す**。素の close と違い、書込中の error は
  // transport の障害なので見えなくしてはいけない。
  test("keeps the destination write error visible", () => {
    expect(
      shouldIgnoreRequestError(
        new Error("The destination stream errored while writing data."),
      ),
    ).toBe(false);
  });

  // 判定はメッセージ文字列に依存する（React は code も専用クラスも付けない）。
  // React を上げた際に文言が変わったら、ここで気づけるようにしておく。
  test("matches the strings React actually throws", () => {
    const bundle = readFileSync(
      join(
        process.cwd(),
        "node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js",
      ),
      "utf8",
    );

    // 読めていないファイルに対して toContain を書いても落ちないので、規模を先に測る。
    expect(bundle.length).toBeGreaterThan(100000);
    expect(bundle).toContain("The destination stream closed early.");
    expect(bundle).toContain(
      "The destination stream errored while writing data.",
    );
  });
});
