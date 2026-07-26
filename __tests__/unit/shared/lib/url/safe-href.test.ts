import { describe, expect, test } from "bun:test";
import {
  externalPublicHrefSchema,
  internalNavHrefSchema,
  isExternalPublicHref,
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
