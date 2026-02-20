import { describe, test, expect } from "bun:test";
import { locationFormSchema } from "@/admin/lib/validations/location";

describe("locationFormSchema", () => {
  test("正常なデータが検証を通過する", () => {
    const validData = {
      name: "施設名",
      description: "施設の説明",
      address: "東京都渋谷区1-2-3",
      access: "渋谷駅から徒歩5分",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: [
        { url: "https://example.com/img1.jpg" },
        { url: "https://example.com/img2.jpg" },
      ],
      businessHours: {
        monday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "17:00" }],
        },
        tuesday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "17:00" }],
        },
        wednesday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "17:00" }],
        },
        thursday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "17:00" }],
        },
        friday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "17:00" }],
        },
        saturday: { isOpen: false, slots: [] },
        sunday: { isOpen: false, slots: [] },
      },
      sortOrder: 1,
      isPublished: true,
    };

    const result = locationFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("最小限のフィールドで検証を通過する", () => {
    const minimalData = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: [],
      sortOrder: 0,
      isPublished: false,
    };

    const result = locationFormSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  test("name が必須である", () => {
    const data = {
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = {
      name: "",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名前を入力してください");
    }
  });

  test("name が100文字を超える場合エラーになる", () => {
    const data = {
      name: "a".repeat(101),
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "名前は100文字以内で入力してください",
      );
    }
  });

  test("description が1000文字を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      description: "a".repeat(1001),
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "説明は1000文字以内で入力してください",
      );
    }
  });

  test("description が空文字列の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      description: "",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("address が必須である", () => {
    const data = {
      name: "施設名",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("address が空文字列の場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("住所を入力してください");
    }
  });

  test("address が500文字を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "a".repeat(501),
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "住所は500文字以内で入力してください",
      );
    }
  });

  test("access が1000文字を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      access: "a".repeat(1001),
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "アクセス情報は1000文字以内で入力してください",
      );
    }
  });

  test("access が空文字列の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      access: "",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("imageUrl が必須である", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("imageUrl が空文字列の場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "建物画像URLを入力してください",
      );
    }
  });

  test("imageUrl が不正なURL形式の場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "invalid-url",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "有効なURLを入力してください",
      );
    }
  });

  test("imageUrls が空配列の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: [],
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("imageUrls が10枚を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: Array(11).fill({ url: "https://example.com/img.jpg" }),
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("画像は最大10枚までです");
    }
  });

  test("imageUrls に不正なURL形式が含まれる場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: [
        { url: "https://example.com/valid.jpg" },
        { url: "invalid-url" },
      ],
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "有効なURLを入力してください",
      );
    }
  });

  test("businessHours の openTime が HH:MM 形式でない場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      businessHours: {
        monday: {
          isOpen: true,
          slots: [{ openTime: "9:00", closeTime: "17:00" }],
        },
        tuesday: { isOpen: false, slots: [] },
        wednesday: { isOpen: false, slots: [] },
        thursday: { isOpen: false, slots: [] },
        friday: { isOpen: false, slots: [] },
        saturday: { isOpen: false, slots: [] },
        sunday: { isOpen: false, slots: [] },
      },
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "開店時刻は HH:MM 形式で入力してください",
      );
    }
  });

  test("businessHours の closeTime が HH:MM 形式でない場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      businessHours: {
        monday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "5:00" }],
        },
        tuesday: { isOpen: false, slots: [] },
        wednesday: { isOpen: false, slots: [] },
        thursday: { isOpen: false, slots: [] },
        friday: { isOpen: false, slots: [] },
        saturday: { isOpen: false, slots: [] },
        sunday: { isOpen: false, slots: [] },
      },
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "閉店時刻は HH:MM 形式で入力してください",
      );
    }
  });

  test("businessHours が null の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      businessHours: null,
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("sortOrder がデフォルトで0になる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  test("sortOrder が負の数の場合エラーになる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      sortOrder: -1,
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("isPublished がデフォルトで false になる", () => {
    const data = {
      name: "施設名",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPublished).toBe(false);
    }
  });
});
