/**
 * error boundary seam のテスト
 *
 * seam の仕事は 2 つ。Next 16.3.0 の `retry` を 34 個の boundary へ素通しする
 * 単一入口であることと、`ErrorInfo["error"]` が `unknown` である前提で digest を
 * 取り出すこと。
 */

import { describe, test, expect } from "bun:test";
import {
  errorBoundaryDigest,
  errorBoundaryRetry,
} from "@/shared/lib/errors/error-boundary-props";

describe("errorBoundaryRetry", () => {
  test("Next が渡した retry をそのまま返す（包まない・飲まない）", () => {
    let called = 0;
    const retry = errorBoundaryRetry({
      error: new Error("boom"),
      retry: () => {
        called += 1;
      },
    });

    retry();

    expect(called).toBe(1);
  });
});

describe("errorBoundaryDigest", () => {
  test("本番ビルドの digest を取り出す", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    expect(errorBoundaryDigest(error)).toBe("abc123");
  });

  test("digest が無いエラーは undefined", () => {
    expect(errorBoundaryDigest(new Error("boom"))).toBeUndefined();
  });

  test("digest が文字列でなければ undefined", () => {
    expect(errorBoundaryDigest({ digest: 42 })).toBeUndefined();
  });

  test("オブジェクト以外は undefined（16.3 の error: unknown 対応）", () => {
    expect(errorBoundaryDigest("just a string")).toBeUndefined();
    expect(errorBoundaryDigest(null)).toBeUndefined();
    expect(errorBoundaryDigest(undefined)).toBeUndefined();
  });
});
