import { describe, expect, test } from "bun:test";

import { toMediaArray } from "@/shared/lib/sections/migrations/media-array";

describe("toMediaArray", () => {
  test("単一オブジェクト { url, alt, caption } を配列に変換", () => {
    expect(
      toMediaArray({ url: "https://x/a.jpg", alt: "A", caption: "C" }),
    ).toEqual([{ url: "https://x/a.jpg", alt: "A", caption: "C" }]);
  });

  test("url 空のオブジェクトは [] に変換", () => {
    expect(toMediaArray({ url: "", alt: "", caption: "" })).toEqual([]);
  });

  test("url 不在のオブジェクトは [] に変換", () => {
    expect(toMediaArray({})).toEqual([]);
  });

  test("既に配列なら no-op（冪等）", () => {
    const arr = [{ url: "https://x/a.jpg", alt: "A", caption: "" }];
    expect(toMediaArray(arr)).toEqual(arr);
  });

  test("null / undefined は []", () => {
    expect(toMediaArray(null)).toEqual([]);
    expect(toMediaArray(undefined)).toEqual([]);
  });

  test("alt / caption 欠落は空文字で補完", () => {
    expect(toMediaArray({ url: "https://x/a.jpg" })).toEqual([
      { url: "https://x/a.jpg", alt: "", caption: "" },
    ]);
  });
});
