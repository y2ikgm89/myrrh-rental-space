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
});
