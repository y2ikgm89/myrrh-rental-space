/**
 * page-hero media variant schema ユニットテスト（背景スライドショー対応）
 */

import { describe, expect, test } from "bun:test";

import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero/schema";

describe("pageHeroConfigSchema media variant（背景スライドショー）", () => {
  test("media variant 空でも safeParse 成功し media は []", () => {
    const result = pageHeroConfigSchema.safeParse({ variant: "media" });
    expect(result.success).toBe(true);
    if (result.success && result.data.variant === "media") {
      expect(result.data.media).toEqual([]);
      expect(result.data.transition).toBe("crossfade");
      expect(result.data.autoPlayInterval).toBe(5);
    }
  });

  test("複数メディアでバリデーション成功", () => {
    const result = pageHeroConfigSchema.safeParse({
      variant: "media",
      media: [
        { url: "https://cdn.example.com/a.jpg", alt: "A", caption: "" },
        { url: "https://cdn.example.com/b.mp4", alt: "B", caption: "" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.variant === "media") {
      expect(result.data.media).toHaveLength(2);
    }
  });

  test("editorial-split variant は従来通り（回帰なし）", () => {
    const result = pageHeroConfigSchema.safeParse({
      variant: "editorial-split",
    });
    expect(result.success).toBe(true);
  });

  test("media variant で scrimTone/scrimOpacity default、overlay 系は持たない", () => {
    const result = pageHeroConfigSchema.safeParse({ variant: "media" });
    expect(result.success).toBe(true);
    if (result.success && result.data.variant === "media") {
      expect(result.data.scrimTone).toBe("dark");
      expect(result.data.scrimOpacity).toBe(40);
      expect("overlay" in result.data).toBe(false);
      expect("overlayOpacity" in result.data).toBe(false);
    }
  });
});
