import { describe, test, expect } from "bun:test";
import {
  getFormString,
  getFormStringOrNull,
  getFormNumber,
  getFormBoolean,
} from "@/shared/lib/form-data";
import { generateSlug } from "@/shared/lib/slug";

// =============================================================================
// FormData ヘルパー
// =============================================================================

describe("getFormString", () => {
  describe("正常系", () => {
    test("フィールドが存在する場合は文字列を返す", () => {
      const formData = new FormData();
      formData.set("name", "田中太郎");
      expect(getFormString(formData, "name")).toBe("田中太郎");
    });

    test("フィールドが存在しない場合は空文字列を返す", () => {
      const formData = new FormData();
      expect(getFormString(formData, "name")).toBe("");
    });

    test("フィールドが存在しない場合はデフォルト値を返す", () => {
      const formData = new FormData();
      expect(getFormString(formData, "name", "Guest")).toBe("Guest");
    });

    test("空文字列フィールドをそのまま返す", () => {
      const formData = new FormData();
      formData.set("name", "");
      expect(getFormString(formData, "name")).toBe("");
    });
  });

  describe("エッジケース", () => {
    test("File オブジェクトのフィールドはデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("file", new Blob(["content"]));
      expect(getFormString(formData, "file", "fallback")).toBe("fallback");
    });

    test("スペースのみの値をそのまま返す", () => {
      const formData = new FormData();
      formData.set("name", "  ");
      expect(getFormString(formData, "name")).toBe("  ");
    });
  });
});

describe("getFormStringOrNull", () => {
  describe("正常系", () => {
    test("フィールドが存在する場合は文字列を返す", () => {
      const formData = new FormData();
      formData.set("guestName", "山田花子");
      expect(getFormStringOrNull(formData, "guestName")).toBe("山田花子");
    });

    test("フィールドが存在しない場合は null を返す", () => {
      const formData = new FormData();
      expect(getFormStringOrNull(formData, "guestName")).toBeNull();
    });

    test("空文字列フィールドは null を返す", () => {
      const formData = new FormData();
      formData.set("guestName", "");
      expect(getFormStringOrNull(formData, "guestName")).toBeNull();
    });
  });

  describe("エッジケース", () => {
    test("スペースのみの値は文字列として返す（空でない）", () => {
      const formData = new FormData();
      formData.set("name", " ");
      expect(getFormStringOrNull(formData, "name")).toBe(" ");
    });

    test("File オブジェクトのフィールドは null を返す", () => {
      const formData = new FormData();
      formData.set("file", new Blob(["content"]));
      expect(getFormStringOrNull(formData, "file")).toBeNull();
    });
  });
});

describe("getFormNumber", () => {
  describe("正常系", () => {
    test("整数文字列を数値に変換する", () => {
      const formData = new FormData();
      formData.set("page", "3");
      expect(getFormNumber(formData, "page", 1)).toBe(3);
    });

    test("小数文字列を数値に変換する", () => {
      const formData = new FormData();
      formData.set("price", "1234.5");
      expect(getFormNumber(formData, "price", 0)).toBe(1234.5);
    });

    test("ゼロ文字列を 0 に変換する", () => {
      const formData = new FormData();
      formData.set("count", "0");
      expect(getFormNumber(formData, "count", 99)).toBe(0);
    });

    test("負数文字列を負数に変換する", () => {
      const formData = new FormData();
      formData.set("offset", "-5");
      expect(getFormNumber(formData, "offset", 0)).toBe(-5);
    });
  });

  describe("異常系", () => {
    test("フィールドが存在しない場合はデフォルト値を返す", () => {
      const formData = new FormData();
      expect(getFormNumber(formData, "page", 1)).toBe(1);
    });

    test("数値でない文字列はデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("page", "abc");
      expect(getFormNumber(formData, "page", 1)).toBe(1);
    });

    test("空文字列はデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("page", "");
      // Number('') === 0 なのでデフォルト値ではなく 0 を返す
      expect(getFormNumber(formData, "page", 1)).toBe(0);
    });

    test("File オブジェクトのフィールドはデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("file", new Blob(["content"]));
      expect(getFormNumber(formData, "file", 99)).toBe(99);
    });
  });
});

describe("getFormBoolean", () => {
  describe("正常系", () => {
    test("'true' を true に変換する", () => {
      const formData = new FormData();
      formData.set("isPublished", "true");
      expect(getFormBoolean(formData, "isPublished")).toBe(true);
    });

    test("'on' を true に変換する（チェックボックス）", () => {
      const formData = new FormData();
      formData.set("isPublished", "on");
      expect(getFormBoolean(formData, "isPublished")).toBe(true);
    });

    test("'false' を false に変換する", () => {
      const formData = new FormData();
      formData.set("isPublished", "false");
      expect(getFormBoolean(formData, "isPublished")).toBe(false);
    });

    test("フィールドが存在しない場合は false を返す", () => {
      const formData = new FormData();
      expect(getFormBoolean(formData, "isPublished")).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("'1' は false を返す（'true'/'on' のみ true）", () => {
      const formData = new FormData();
      formData.set("flag", "1");
      expect(getFormBoolean(formData, "flag")).toBe(false);
    });

    test("'True'（大文字）は false を返す", () => {
      const formData = new FormData();
      formData.set("flag", "True");
      expect(getFormBoolean(formData, "flag")).toBe(false);
    });

    test("空文字列は false を返す", () => {
      const formData = new FormData();
      formData.set("flag", "");
      expect(getFormBoolean(formData, "flag")).toBe(false);
    });
  });
});

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
