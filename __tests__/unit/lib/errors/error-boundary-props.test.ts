/**
 * error boundary の Next.js バージョン seam テスト
 *
 * `next/error` の `ErrorInfo` は 16.2 → 16.3 で shape が変わる
 * (`error: Error`→`unknown` / `unstable_retry`→`retry`)。この seam が両方を
 * 受理し続けることが、34 個の error boundary を触らずに bump できる前提になる。
 */

import { describe, test, expect } from "bun:test";
import {
  errorBoundaryDigest,
  errorBoundaryRetry,
} from "@/shared/lib/errors/error-boundary-props";

describe("errorBoundaryRetry", () => {
  test("Next 16.2 の unstable_retry を使う", () => {
    let called = 0;
    const retry = errorBoundaryRetry({
      error: new Error("boom"),
      unstable_retry: () => {
        called += 1;
      },
    });

    retry();

    expect(called).toBe(1);
  });

  test("Next 16.3 の retry を使う", () => {
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

  test("両方ある場合は新しい retry を優先する", () => {
    const calls: string[] = [];
    const retry = errorBoundaryRetry({
      error: new Error("boom"),
      retry: () => calls.push("retry"),
      unstable_retry: () => calls.push("unstable_retry"),
    });

    retry();

    expect(calls).toEqual(["retry"]);
  });

  test("どちらも無ければ関数を返す（再試行ボタンを無反応にしない）", () => {
    expect(typeof errorBoundaryRetry({ error: new Error("boom") })).toBe(
      "function",
    );
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
