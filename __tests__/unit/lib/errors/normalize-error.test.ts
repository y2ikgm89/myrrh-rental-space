/**
 * `String(value)` は plain object を `"[object Object]"` に潰す。
 *
 * 実測: CI run 33028420525 の E2E で、Cloud Error Reporting へ
 * `{"severity":"ERROR","message":"[object Object]", ...
 *   "context":{"operation":"recordConnectionFailure","integration":"RESEND"}}`
 * が `@type ReportedErrorEvent` として入っていた。何が起きたのかは残っていない。
 *
 * ここで固定するのは 2 つ:
 *
 * 1. error 形状の慣用フィールド (`name` / `code` / `status` / `message`) は残す
 * 2. **それ以外は拾わない** — 戻り値は UI にも出るため、payload を丸ごと
 *    文字列化しない。露出の度合いを「Error の message をそのまま見せている現状」と揃える
 */
import { describe, expect, test } from "bun:test";
import { getErrorMessage, normalizeError } from "@/shared/lib/errors/types";

describe("normalizeError", () => {
  test("passes a real Error through untouched", () => {
    const error = new Error("boom");
    expect(normalizeError(error)).toBe(error);
  });

  // Resend SDK の error は `{ name, message }`。旧実装ではここが
  // "[object Object]" になり、原因が消えていた。
  test("keeps the message of an error-shaped object", () => {
    const normalized = normalizeError({
      name: "invalid_api_key",
      message: "API key is invalid",
    });

    expect(normalized.message).toContain("API key is invalid");
    expect(normalized.message).toContain("invalid_api_key");
    expect(normalized.message).not.toContain("[object Object]");
  });

  test("keeps numeric code / status", () => {
    const normalized = normalizeError({ code: 429, status: 429 });

    expect(normalized.message).toContain("429");
  });

  // 拾える field が 1 つも無ければ従来どおり。payload を漁らないことの確認。
  test("does not serialise an object with no error-shaped fields", () => {
    const normalized = normalizeError({ apiKey: "re_secret_value" });

    expect(normalized.message).not.toContain("re_secret_value");
    expect(normalized.message).toBe("[object Object]");
  });

  test("truncates a very long message", () => {
    const normalized = normalizeError({ message: "x".repeat(2000) });

    expect(normalized.message.length).toBeLessThan(600);
    expect(normalized.message.endsWith("…")).toBe(true);
  });

  test("leaves primitives to String()", () => {
    expect(normalizeError("plain string").message).toBe("plain string");
    expect(normalizeError(null).message).toBe("null");
    expect(normalizeError(undefined).message).toBe("undefined");
  });
});

describe("getErrorMessage", () => {
  test("agrees with normalizeError on error-shaped objects", () => {
    const value = { name: "invalid_api_key", message: "API key is invalid" };

    expect(getErrorMessage(value)).toBe(normalizeError(value).message);
  });

  test("returns the message of a real Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });
});
