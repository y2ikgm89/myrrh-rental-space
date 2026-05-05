/**
 * createImageGroupSchema / createCompactImageGroupSchema factory のユニットテスト
 *
 * Phase 2B で導入された画像メタ構造化（{url, alt, caption?}）の contract 検証。
 */

import { describe, expect, test } from "bun:test";

import {
  createCompactImageGroupSchema,
  createImageGroupSchema,
} from "@/shared/lib/sections/definitions/_shared/image";

describe("createImageGroupSchema", () => {
  const schema = createImageGroupSchema();

  test("最小構成（url + alt）でパース成功", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt text",
    });
    expect(result.success).toBe(true);
  });

  test("caption も含めてパース成功", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt text",
      caption: "キャプション",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caption).toBe("キャプション");
    }
  });

  test("caption は空文字 default", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // field.text("...", { ... }) は default("") のため空文字補完される
      expect(typeof result.data.caption).toBe("string");
    }
  });

  test("alt 200 文字超は reject（maxLength）", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test("caption 300 文字超は reject", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
      caption: "a".repeat(301),
    });
    expect(result.success).toBe(false);
  });

  test("空オブジェクトは default 補完でパース成功（全フィールド空文字）", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("");
      expect(result.data.alt).toBe("");
      expect(result.data.caption).toBe("");
    }
  });
});

describe("createCompactImageGroupSchema", () => {
  const schema = createCompactImageGroupSchema();

  test("最小構成（url + alt）でパース成功", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(result.success).toBe(true);
  });

  test("caption フィールドは含まれない（compact 版）", () => {
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("caption" in result.data).toBe(false);
    }
  });

  test("caption を渡しても schema は無視（または unknown key として通過）", () => {
    // z.object().strict() を使っていないので unknown key は無視される
    const result = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
      caption: "should-be-ignored",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("caption" in result.data).toBe(false);
    }
  });
});
