import { describe, expect, test } from "bun:test";
import {
  externalPublicHrefSchema,
  internalNavHrefSchema,
  isExternalPublicHref,
  isHttpOrInternalPublicHref,
  isInternalNavHref,
  isSafePublicHref,
  optionalSafePublicHrefSchema,
  toSafePublicHref,
} from "@/shared/lib/url/safe-href";

describe("isSafePublicHref", () => {
  test("allows internal app routes", () => {
    expect(isSafePublicHref("/")).toBe(true);
    expect(isSafePublicHref("/about")).toBe(true);
    expect(isSafePublicHref("/blog/post-1")).toBe(true);
  });

  test("rejects protocol-relative and dangerous schemes", () => {
    expect(isSafePublicHref("//evil.example")).toBe(false);
    expect(isSafePublicHref("/\\evil.example")).toBe(false);
    expect(isSafePublicHref("/%5Cevil.example")).toBe(false);
    expect(isSafePublicHref("javascript:alert(1)")).toBe(false);
    expect(isSafePublicHref("data:text/html,hi")).toBe(false);
    expect(isSafePublicHref("vbscript:x")).toBe(false);
  });

  test("allows http(s)/mailto/tel", () => {
    expect(isSafePublicHref("https://example.com")).toBe(true);
    expect(isSafePublicHref("http://example.com")).toBe(true);
    expect(isSafePublicHref("mailto:a@example.com")).toBe(true);
    expect(isSafePublicHref("tel:+819012345678")).toBe(true);
  });

  test("rejects leading/trailing whitespace", () => {
    expect(isSafePublicHref(" /about")).toBe(false);
    expect(isSafePublicHref("/about ")).toBe(false);
  });
});

describe("isInternalNavHref / isExternalPublicHref", () => {
  test("internal requires app route", () => {
    expect(isInternalNavHref("/spaces")).toBe(true);
    expect(isInternalNavHref("https://example.com")).toBe(false);
  });

  test("external rejects relative paths", () => {
    expect(isExternalPublicHref("https://example.com")).toBe(true);
    expect(isExternalPublicHref("/spaces")).toBe(false);
    expect(isExternalPublicHref("javascript:alert(1)")).toBe(false);
  });

  test("rejects leading/trailing whitespace", () => {
    // `new URL(" https://x")` は WHATWG 仕様どおり空白を捨てて解釈するので、
    // scheme だけ見る実装だとここが true になってしまう。
    expect(isExternalPublicHref(" https://example.com")).toBe(false);
    expect(isExternalPublicHref("https://example.com ")).toBe(false);
    expect(isHttpOrInternalPublicHref(" https://example.com")).toBe(false);
    expect(isHttpOrInternalPublicHref(" /about")).toBe(false);
  });
});

/**
 * 保存側の述語が通した href は、描画側の `toSafePublicHref` も通さなければならない。
 *
 * 破れると**管理者にはエラーが出ないまま、公開ページのリンクだけが href 無しで
 * 描画される**。実際 `isExternalPublicHref` が前後の空白を許していたため、
 * ナビゲーションに `" https://example.com"` を貼り付けると保存は成功し、
 * 公開側ではリンクが消えていた。
 */
describe("保存を通る href は描画も通る", () => {
  const CANDIDATES = [
    "https://example.com",
    "http://example.com",
    "mailto:a@example.com",
    "tel:+819012345678",
    "/about",
    "/",
    " https://example.com",
    "https://example.com ",
    "\thttps://example.com",
    " /about",
    "/about ",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
    "",
  ];

  for (const value of CANDIDATES) {
    test(`${JSON.stringify(value)}`, () => {
      if (isExternalPublicHref(value) || isInternalNavHref(value)) {
        expect(toSafePublicHref(value)).toBe(value);
      }
    });
  }
});

describe("schemas", () => {
  test("internalNavHrefSchema", () => {
    expect(internalNavHrefSchema.safeParse("/ok").success).toBe(true);
    expect(internalNavHrefSchema.safeParse("https://x.com").success).toBe(
      false,
    );
  });

  test("externalPublicHrefSchema", () => {
    expect(externalPublicHrefSchema.safeParse("https://x.com").success).toBe(
      true,
    );
    expect(externalPublicHrefSchema.safeParse("/ok").success).toBe(false);
    expect(
      externalPublicHrefSchema.safeParse("javascript:alert(1)").success,
    ).toBe(false);
  });

  test("貼り付けに紛れた前後の空白は正規化して受け入れる", () => {
    // 述語は空白付きを拒否するので、schema が先に落とさないと通らない。
    // 空白は入力の不備であって拒否の理由ではないため、ここで正規化する。
    const external = externalPublicHrefSchema.safeParse(" https://x.com ");
    expect(external.success).toBe(true);
    expect(external.success && external.data).toBe("https://x.com");

    const internal = internalNavHrefSchema.safeParse("  /ok  ");
    expect(internal.success).toBe(true);
    expect(internal.success && internal.data).toBe("/ok");

    // 空白だけの入力は `.min(1)` に落ちる（`.trim()` が先に効くため）
    expect(externalPublicHrefSchema.safeParse("   ").success).toBe(false);
    expect(internalNavHrefSchema.safeParse("   ").success).toBe(false);
  });

  test("optionalSafePublicHrefSchema allows empty/null and safe urls", () => {
    expect(optionalSafePublicHrefSchema.safeParse(undefined).success).toBe(
      true,
    );
    expect(optionalSafePublicHrefSchema.safeParse("").success).toBe(true);
    expect(optionalSafePublicHrefSchema.safeParse(null).success).toBe(true);
    expect(optionalSafePublicHrefSchema.safeParse("/contact").success).toBe(
      true,
    );
    expect(
      optionalSafePublicHrefSchema.safeParse("javascript:alert(1)").success,
    ).toBe(false);
  });
});

describe("toSafePublicHref", () => {
  test("returns null for unsafe values", () => {
    expect(toSafePublicHref("javascript:alert(1)")).toBeNull();
    expect(toSafePublicHref(null)).toBeNull();
    expect(toSafePublicHref("/ok")).toBe("/ok");
  });
});
