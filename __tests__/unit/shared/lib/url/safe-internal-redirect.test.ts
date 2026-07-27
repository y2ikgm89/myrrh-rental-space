import { describe, expect, test } from "bun:test";
import {
  isSafeInternalRedirect,
  isSafeInternalRedirectPath,
} from "@/shared/lib/url/safe-internal-redirect";

describe("isSafeInternalRedirectPath", () => {
  test("allows safe internal paths", () => {
    expect(isSafeInternalRedirectPath("/mypage")).toBe(true);
    expect(isSafeInternalRedirectPath("/mypage/reservations")).toBe(true);
    expect(isSafeInternalRedirectPath("/about?tab=info")).toBe(true);
  });

  test("rejects protocol-relative URLs", () => {
    expect(isSafeInternalRedirectPath("//evil")).toBe(false);
    expect(isSafeInternalRedirectPath("//evil.example.com/mypage")).toBe(false);
  });

  test("rejects backslash open-redirect bypass", () => {
    expect(isSafeInternalRedirectPath("/\\evil")).toBe(false);
    expect(isSafeInternalRedirectPath("/\\\\evil")).toBe(false);
    expect(isSafeInternalRedirectPath("/\\attacker.com")).toBe(false);
  });

  test("rejects encoded bypass variants", () => {
    expect(isSafeInternalRedirectPath("/%5Cevil")).toBe(false);
    expect(isSafeInternalRedirectPath("/%5C%5Cevil")).toBe(false);
    expect(isSafeInternalRedirectPath("/%2F/evil")).toBe(false);
    expect(isSafeInternalRedirectPath("/%2f/evil")).toBe(false);
  });

  test("rejects parent directory segments", () => {
    expect(isSafeInternalRedirectPath("/mypage/../admin")).toBe(false);
    expect(isSafeInternalRedirectPath("/mypage/%2e%2e/admin")).toBe(false);
  });

  test("rejects scheme and external URLs", () => {
    expect(isSafeInternalRedirectPath("https://evil.example.com")).toBe(false);
    expect(isSafeInternalRedirectPath("/https://evil.example.com")).toBe(false);
    expect(isSafeInternalRedirectPath("javascript:alert(1)")).toBe(false);
  });

  test("rejects whitespace and control characters", () => {
    expect(isSafeInternalRedirectPath(" /mypage")).toBe(false);
    expect(isSafeInternalRedirectPath("/mypage ")).toBe(false);
    expect(isSafeInternalRedirectPath("/mypage\n")).toBe(false);
  });
});

describe("isSafeInternalRedirect", () => {
  test("narrows nullish values to false", () => {
    expect(isSafeInternalRedirect(null)).toBe(false);
    expect(isSafeInternalRedirect(undefined)).toBe(false);
    expect(isSafeInternalRedirect("/mypage")).toBe(true);
  });
});
