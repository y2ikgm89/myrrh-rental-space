import { describe, test, expect } from "bun:test";
import { sanitizeReturnTo } from "@/app/(public)/mypage/terms/reagree/_lib/sanitize-return-to";

describe("sanitizeReturnTo", () => {
  test("undefined / null / 空文字 → /mypage", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/mypage");
    expect(sanitizeReturnTo(null)).toBe("/mypage");
    expect(sanitizeReturnTo("")).toBe("/mypage");
  });

  test("/mypage 配下の相対パスは許可", () => {
    expect(sanitizeReturnTo("/mypage")).toBe("/mypage");
    expect(sanitizeReturnTo("/mypage/reservations")).toBe(
      "/mypage/reservations",
    );
    expect(sanitizeReturnTo("/mypage/reservations/abc-123")).toBe(
      "/mypage/reservations/abc-123",
    );
    expect(sanitizeReturnTo("/mypage/settings?require_email=true")).toBe(
      "/mypage/settings?require_email=true",
    );
  });

  test("/mypage 外の相対パスは拒否 (open redirect 対策)", () => {
    expect(sanitizeReturnTo("/admin")).toBe("/mypage");
    expect(sanitizeReturnTo("/login")).toBe("/mypage");
    expect(sanitizeReturnTo("/")).toBe("/mypage");
  });

  test("protocol-relative URL (//example.com) は拒否", () => {
    expect(sanitizeReturnTo("//evil.example.com")).toBe("/mypage");
    expect(sanitizeReturnTo("//example.com/mypage")).toBe("/mypage");
  });

  test("フルスキーマの URL は拒否", () => {
    expect(sanitizeReturnTo("https://evil.example.com/mypage")).toBe("/mypage");
    expect(sanitizeReturnTo("http://localhost/mypage")).toBe("/mypage");
  });

  test("reagree 本体への redirect は循環防止で拒否", () => {
    expect(sanitizeReturnTo("/mypage/terms/reagree")).toBe("/mypage");
    expect(sanitizeReturnTo("/mypage/terms/reagree?returnTo=/mypage")).toBe(
      "/mypage",
    );
  });

  test("配列（?returnTo= の重複指定）はクラッシュせず /mypage にフォールバックする", () => {
    // Next.js の searchParams は同名クエリを重複指定すると string[] になる。
    // sanitizeReturnTo は open redirect 対策 SSoT のため、呼び出し側の型注釈に
    // 依存せず自身で安全側に倒す契約を持つ（回帰: .startsWith は配列に無く TypeError）。
    expect(sanitizeReturnTo(["/mypage", "/mypage/settings"])).toBe("/mypage");
    expect(sanitizeReturnTo([])).toBe("/mypage");
  });
});
