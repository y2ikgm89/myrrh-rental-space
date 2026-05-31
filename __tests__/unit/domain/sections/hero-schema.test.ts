/**
 * hero セクション schema ユニットテスト（背景スライドショー対応）
 *
 * - safeParse({}) 成立契約（fallback chain 互換）
 * - backgroundMedia の配列化（default []）
 * - 同一 URL 重複の refine（admin write-side）
 * - transition / autoPlayInterval の default
 */

import { describe, expect, test } from "bun:test";

import { heroConfigSchema } from "@/shared/lib/sections/definitions/hero/schema";

describe("heroConfigSchema（背景スライドショー）", () => {
  test("空 config でも safeParse 成功し backgroundMedia は []", () => {
    const result = heroConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundMedia).toEqual([]);
      expect(result.data.transition).toBe("crossfade");
      expect(result.data.autoPlayInterval).toBe(5);
    }
  });

  test("複数メディアでバリデーション成功", () => {
    const result = heroConfigSchema.safeParse({
      backgroundMedia: [
        { url: "https://cdn.example.com/a.jpg", alt: "A", caption: "" },
        { url: "https://cdn.example.com/b.mp4", alt: "B", caption: "" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundMedia).toHaveLength(2);
    }
  });

  test("同一 URL の重複は refine で失敗", () => {
    const result = heroConfigSchema.safeParse({
      backgroundMedia: [
        { url: "https://cdn.example.com/a.jpg", alt: "A", caption: "" },
        { url: "https://cdn.example.com/a.jpg", alt: "A2", caption: "" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("autoPlayInterval は 2-20 の範囲外で失敗", () => {
    const tooFast = heroConfigSchema.safeParse({ autoPlayInterval: 1 });
    expect(tooFast.success).toBe(false);
  });
});
