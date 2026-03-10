/**
 * URLパラメータバリデーションテスト
 *
 * src/shared/lib/validations/params.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  slugParamSchema,
  idParamSchema,
} from "@/shared/lib/validations/params";

describe("slugParamSchema", () => {
  describe("正常系", () => {
    test("単純な小文字英数字のみのスラッグは通過", () => {
      const result = slugParamSchema.safeParse("hello");
      expect(result.success).toBe(true);
    });

    test("ハイフン区切りの複数セグメントは通過", () => {
      const result = slugParamSchema.safeParse("hello-world");
      expect(result.success).toBe(true);
    });

    test("数字を含むスラッグは通過", () => {
      const result = slugParamSchema.safeParse("post-123");
      expect(result.success).toBe(true);
    });

    test("複数のハイフン区切りは通過", () => {
      const result = slugParamSchema.safeParse("my-blog-post-title");
      expect(result.success).toBe(true);
    });

    test("数字のみのスラッグは通過", () => {
      const result = slugParamSchema.safeParse("123");
      expect(result.success).toBe(true);
    });

    test("英数字混在のスラッグは通過", () => {
      const result = slugParamSchema.safeParse("abc123def");
      expect(result.success).toBe(true);
    });

    test("1文字のスラッグ（最小長）は通過", () => {
      const result = slugParamSchema.safeParse("a");
      expect(result.success).toBe(true);
    });

    test("100文字のスラッグ（最大長）は通過", () => {
      // "a" * 96 + "-" + "b" * 3 = 100文字
      const slug = "a".repeat(96) + "-" + "b".repeat(3);
      expect(slug.length).toBe(100);
      const result = slugParamSchema.safeParse(slug);
      expect(result.success).toBe(true);
    });

    test("数字から始まるスラッグは通過", () => {
      const result = slugParamSchema.safeParse("2024-release");
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("空文字はエラー", () => {
      const result = slugParamSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    test("大文字を含む文字列はエラー", () => {
      const result = slugParamSchema.safeParse("Hello-World");
      expect(result.success).toBe(false);
    });

    test("全角文字はエラー", () => {
      const result = slugParamSchema.safeParse("スラッグ");
      expect(result.success).toBe(false);
    });

    test("先頭がハイフンの文字列はエラー", () => {
      const result = slugParamSchema.safeParse("-hello");
      expect(result.success).toBe(false);
    });

    test("末尾がハイフンの文字列はエラー", () => {
      const result = slugParamSchema.safeParse("hello-");
      expect(result.success).toBe(false);
    });

    test("連続するハイフンはエラー", () => {
      const result = slugParamSchema.safeParse("hello--world");
      expect(result.success).toBe(false);
    });

    test("アンダースコアを含む文字列はエラー", () => {
      const result = slugParamSchema.safeParse("hello_world");
      expect(result.success).toBe(false);
    });

    test("スペースを含む文字列はエラー", () => {
      const result = slugParamSchema.safeParse("hello world");
      expect(result.success).toBe(false);
    });

    test("スラッシュを含む文字列はエラー", () => {
      const result = slugParamSchema.safeParse("hello/world");
      expect(result.success).toBe(false);
    });

    test("ピリオドを含む文字列はエラー", () => {
      const result = slugParamSchema.safeParse("hello.world");
      expect(result.success).toBe(false);
    });

    test("101文字の文字列は最大長超過でエラー", () => {
      const slug = "a".repeat(101);
      const result = slugParamSchema.safeParse(slug);
      expect(result.success).toBe(false);
    });

    test("nullはエラー", () => {
      const result = slugParamSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    test("undefinedはエラー", () => {
      const result = slugParamSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test("数値型はエラー", () => {
      const result = slugParamSchema.safeParse(123);
      expect(result.success).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("ハイフンのみの文字列はエラー", () => {
      const result = slugParamSchema.safeParse("-");
      expect(result.success).toBe(false);
    });

    test("URLエンコードされた文字列はエラー", () => {
      const result = slugParamSchema.safeParse("hello%20world");
      expect(result.success).toBe(false);
    });

    test("英数字とハイフンで構成される長い複合スラッグは通過", () => {
      const result = slugParamSchema.safeParse("a1b2-c3d4-e5f6");
      expect(result.success).toBe(true);
    });

    test("safeParse 成功時にデータが取得できる", () => {
      const slug = "my-page";
      const result = slugParamSchema.safeParse(slug);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(slug);
      }
    });
  });
});

describe("idParamSchema", () => {
  describe("正常系", () => {
    test("CUID形式の文字列は通過", () => {
      const result = idParamSchema.safeParse("clh7xk2w40000356oh8tqxp6j");
      expect(result.success).toBe(true);
    });

    test("UUID形式の文字列は通過", () => {
      const result = idParamSchema.safeParse(
        "550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result.success).toBe(true);
    });

    test("単純な数字文字列は通過", () => {
      const result = idParamSchema.safeParse("12345");
      expect(result.success).toBe(true);
    });

    test("1文字のID（最小長）は通過", () => {
      const result = idParamSchema.safeParse("1");
      expect(result.success).toBe(true);
    });

    test("100文字のID（最大長）は通過", () => {
      const id = "a".repeat(100);
      const result = idParamSchema.safeParse(id);
      expect(result.success).toBe(true);
    });

    test("大文字・小文字・数字・記号を含む文字列は通過", () => {
      const result = idParamSchema.safeParse("AbC-123_xyz");
      expect(result.success).toBe(true);
    });

    test("大文字のみの文字列は通過", () => {
      const result = idParamSchema.safeParse("ABCDE");
      expect(result.success).toBe(true);
    });

    test("スラッシュを含む文字列も通過（制約なし）", () => {
      const result = idParamSchema.safeParse("path/to/id");
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("空文字はエラー", () => {
      const result = idParamSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    test("101文字の文字列は最大長超過でエラー", () => {
      const id = "a".repeat(101);
      const result = idParamSchema.safeParse(id);
      expect(result.success).toBe(false);
    });

    test("nullはエラー", () => {
      const result = idParamSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    test("undefinedはエラー", () => {
      const result = idParamSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test("数値型はエラー", () => {
      const result = idParamSchema.safeParse(123);
      expect(result.success).toBe(false);
    });

    test("配列はエラー", () => {
      const result = idParamSchema.safeParse(["id-1"]);
      expect(result.success).toBe(false);
    });

    test("オブジェクトはエラー", () => {
      const result = idParamSchema.safeParse({ id: "abc" });
      expect(result.success).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("safeParse 成功時にデータが取得できる", () => {
      const id = "clh7xk2w40000356oh8tqxp6j";
      const result = idParamSchema.safeParse(id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(id);
      }
    });

    test("スペースのみの文字列は通過（空文字以外はmin(1)を満たす）", () => {
      const result = idParamSchema.safeParse(" ");
      expect(result.success).toBe(true);
    });

    test("全角文字を含む文字列も通過（制約なし）", () => {
      const result = idParamSchema.safeParse("テスト");
      expect(result.success).toBe(true);
    });

    test("100文字ちょうど（境界値）は通過", () => {
      const id = "z".repeat(100);
      const result = idParamSchema.safeParse(id);
      expect(result.success).toBe(true);
    });

    test("101文字（境界値超過）はエラー", () => {
      const id = "z".repeat(101);
      const result = idParamSchema.safeParse(id);
      expect(result.success).toBe(false);
    });
  });
});
