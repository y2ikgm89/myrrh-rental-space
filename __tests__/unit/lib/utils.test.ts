import { describe, test, expect } from "bun:test";
import { generateSlug } from "@/shared/lib/slug";

// =============================================================================
// generateSlug（URL スラッグ生成）
// =============================================================================

describe("generateSlug", () => {
  describe("正常系", () => {
    test("スペースをハイフンに変換する", () => {
      expect(generateSlug("Hello World")).toBe("hello-world");
    });

    test("大文字を小文字に変換する", () => {
      expect(generateSlug("HELLO WORLD")).toBe("hello-world");
    });

    test("数字を含む文字列を正しく処理する", () => {
      expect(generateSlug("Article 2024")).toBe("article-2024");
    });

    test("既存のハイフンを保持する", () => {
      expect(generateSlug("hello-world")).toBe("hello-world");
    });

    test("連続スペースを単一ハイフンに変換する", () => {
      expect(generateSlug("hello   world")).toBe("hello-world");
    });

    test("連続ハイフンを単一ハイフンに変換する", () => {
      expect(generateSlug("hello--world")).toBe("hello-world");
    });

    test("先頭・末尾のハイフンを除去する", () => {
      expect(generateSlug("-hello-world-")).toBe("hello-world");
    });

    test("アクセント記号を除去する", () => {
      expect(generateSlug("café")).toBe("cafe");
    });

    test("特殊文字を除去する", () => {
      expect(generateSlug("hello!@#world")).toBe("helloworld");
    });

    test("maxLength で切り詰める", () => {
      const longText = "a".repeat(100);
      expect(generateSlug(longText, "item", 20)).toHaveLength(20);
    });

    test("デフォルト maxLength（50）で切り詰める", () => {
      const longText = "a ".repeat(30); // "a a a a..." → "a-a-a-a..."
      const result = generateSlug(longText);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe("フォールバック（非ASCII文字のみ）", () => {
    test("日本語のみの場合はプレフィックス付きランダムIDを返す", () => {
      const result = generateSlug("日本語タグ");
      expect(result).toMatch(/^item-[a-f0-9-]+$/);
    });

    test("日本語のみでカスタムプレフィックスを使用する", () => {
      const result = generateSlug("タイトル", "tag");
      expect(result).toMatch(/^tag-[a-f0-9-]+$/);
    });

    test("中国語のみの場合もフォールバックを返す", () => {
      const result = generateSlug("中文", "post");
      expect(result).toMatch(/^post-[a-f0-9-]+$/);
    });

    test("ASCII と非ASCII 混在の場合は ASCII 部分のみのスラッグを返す", () => {
      // "Mix 混合" → ASCII 部分の "mix" のみ残る
      expect(generateSlug("Mix 混合", "tag")).toBe("mix");
    });

    test("空文字列の場合はデフォルトプレフィックスでフォールバックを返す", () => {
      const result = generateSlug("");
      expect(result).toMatch(/^item-[a-f0-9-]+$/);
    });

    test("記号のみの場合もフォールバックを返す", () => {
      const result = generateSlug("!@#$%^&*()");
      expect(result).toMatch(/^item-[a-f0-9-]+$/);
    });
  });

  describe("境界値", () => {
    test("maxLength=1 で1文字に切り詰める", () => {
      expect(generateSlug("hello world", "item", 1)).toBe("h");
    });

    test("maxLength がスラッグ長より長い場合は切り詰めない", () => {
      expect(generateSlug("hi", "item", 100)).toBe("hi");
    });

    test("数字のみの文字列を処理する", () => {
      expect(generateSlug("12345")).toBe("12345");
    });

    test("英字1文字を処理する", () => {
      expect(generateSlug("a")).toBe("a");
    });
  });
});
