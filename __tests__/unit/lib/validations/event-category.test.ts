import { describe, test, expect } from "bun:test";
import { eventCategoryFormSchema } from "@/shared/lib/validations/event-category";

describe("eventCategoryFormSchema", () => {
  test("正常なデータが検証を通過する", () => {
    const validData = {
      name: "ワークショップ",
      description: "体験型のワークショップイベント",
      icon: "icon-name",
      color: "#ff0000",
    };

    const result = eventCategoryFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("最小限のフィールドで検証を通過する", () => {
    const minimalData = {
      name: "ワークショップ",
    };

    const result = eventCategoryFormSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  test("name が必須である", () => {
    const data = {
      description: "説明",
    };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = { name: "" };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "カテゴリー名を入力してください",
      );
    }
  });

  test("name が50文字を超える場合エラーになる", () => {
    const data = { name: "a".repeat(51) };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "カテゴリー名は50文字以内で入力してください",
      );
    }
  });

  test("description が500文字を超える場合エラーになる", () => {
    const data = { name: "ワークショップ", description: "a".repeat(501) };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "説明は500文字以内で入力してください",
      );
    }
  });

  test("color が不正な形式の場合エラーになる", () => {
    const data = { name: "ワークショップ", color: "red" };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "有効なカラーコードを入力してください",
      );
    }
  });

  test("sortOrder は schema に含まれない（システム管理）", () => {
    const result = eventCategoryFormSchema.safeParse({
      name: "ワークショップ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("sortOrder" in result.data).toBe(false);
    }
  });
});
