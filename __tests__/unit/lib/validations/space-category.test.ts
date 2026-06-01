import { describe, test, expect } from "bun:test";
import { spaceCategoryFormSchema } from "@/shared/lib/validations/space-category";

describe("spaceCategoryFormSchema", () => {
  test("正常なデータが検証を通過する", () => {
    const validData = {
      name: "カテゴリー名",
      description: "カテゴリーの説明",
      icon: "icon-name",
      color: "#ff0000",
    };

    const result = spaceCategoryFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("最小限のフィールドで検証を通過する", () => {
    const minimalData = {
      name: "カテゴリー名",
    };

    const result = spaceCategoryFormSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  test("name が必須である", () => {
    const data = {
      description: "説明",
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = {
      name: "",
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "カテゴリー名を入力してください",
      );
    }
  });

  test("name が50文字を超える場合エラーになる", () => {
    const data = {
      name: "a".repeat(51),
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "カテゴリー名は50文字以内で入力してください",
      );
    }
  });

  test("description が500文字を超える場合エラーになる", () => {
    const data = {
      name: "カテゴリー名",
      description: "a".repeat(501),
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "説明は500文字以内で入力してください",
      );
    }
  });

  test("description が空文字列の場合検証を通過する", () => {
    const data = {
      name: "カテゴリー名",
      description: "",
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("icon が50文字を超える場合エラーになる", () => {
    const data = {
      name: "カテゴリー名",
      icon: "a".repeat(51),
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "アイコン名は50文字以内で入力してください",
      );
    }
  });

  test("icon が空文字列の場合検証を通過する", () => {
    const data = {
      name: "カテゴリー名",
      icon: "",
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("color が正しい6桁16進数形式の場合検証を通過する", () => {
    const validColors = ["#ff0000", "#00FF00", "#0000ff", "#ABC123"];

    for (const color of validColors) {
      const data = {
        name: "カテゴリー名",
        color,
      };
      const result = spaceCategoryFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  test("color が正しい3桁16進数形式の場合検証を通過する", () => {
    const validColors = ["#f00", "#0F0", "#00f", "#ABC"];

    for (const color of validColors) {
      const data = {
        name: "カテゴリー名",
        color,
      };
      const result = spaceCategoryFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  test("color が不正な形式の場合エラーになる", () => {
    const invalidColors = [
      "#fffff",
      "#ggg",
      "#123456789",
      "red",
      "ffffff",
      "#",
    ];

    for (const color of invalidColors) {
      const data = {
        name: "カテゴリー名",
        color,
      };
      const result = spaceCategoryFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "有効なカラーコードを入力してください",
        );
      }
    }
  });

  test("color が空文字列の場合検証を通過する", () => {
    const data = {
      name: "カテゴリー名",
      color: "",
    };

    const result = spaceCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("sortOrder は schema に含まれない（システム管理）", () => {
    const result = spaceCategoryFormSchema.safeParse({ name: "カテゴリー名" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("sortOrder" in result.data).toBe(false);
    }
  });
});
