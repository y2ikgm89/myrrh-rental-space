import { describe, test, expect } from "bun:test";
import { locationFormSchema } from "@/shared/lib/validations/location";

describe("locationFormSchema", () => {
  test("正常なデータが検証を通過する", () => {
    const validData = {
      name: "施設名",
      slug: "test-location",
      description: "施設の説明",
      address: "東京都渋谷区1-2-3",
      accessLines: [{ value: "渋谷駅から徒歩5分" }],
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
      isPublished: true,
    };

    const result = locationFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("最小限のフィールドで検証を通過する", () => {
    const minimalData = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: [],
      isPublished: false,
    };

    const result = locationFormSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  test("name が必須である", () => {
    const data = {
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = {
      name: "",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameIssue = result.error.issues.find(
        (issue) => issue.path[0] === "name",
      );
      expect(nameIssue?.message).toBe("名前を入力してください");
    }
  });

  test("name が100文字を超える場合エラーになる", () => {
    const data = {
      name: "a".repeat(101),
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameIssue = result.error.issues.find(
        (issue) => issue.path[0] === "name",
      );
      expect(nameIssue?.message).toBe("名前は100文字以内で入力してください");
    }
  });

  test("description が2000文字を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      description: "a".repeat(2001),
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const descriptionIssue = result.error.issues.find(
        (issue) => issue.path[0] === "description",
      );
      expect(descriptionIssue?.message).toBe(
        "説明は2000文字以内で入力してください",
      );
    }
  });

  test("description が空文字列の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
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
      slug: "test-location",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("address が空文字列の場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const addressIssue = result.error.issues.find(
        (issue) => issue.path[0] === "address",
      );
      expect(addressIssue?.message).toBe("住所を入力してください");
    }
  });

  test("address が500文字を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "a".repeat(501),
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const addressIssue = result.error.issues.find(
        (issue) => issue.path[0] === "address",
      );
      expect(addressIssue?.message).toBe("住所は500文字以内で入力してください");
    }
  });

  test("accessLines の各行が200文字を超える場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      accessLines: [{ value: "a".repeat(201) }],
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const accessIssue = result.error.issues.find(
        (issue) => issue.path[0] === "accessLines",
      );
      expect(accessIssue?.message).toBe("1 行 200 文字以内で入力してください");
    }
  });

  test("accessLines が空配列の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      accessLines: [],
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("imageUrl が必須である", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("imageUrl が空文字列の場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const imageUrlIssue = result.error.issues.find(
        (issue) => issue.path[0] === "imageUrl",
      );
      expect(imageUrlIssue?.message).toBe("建物画像URLを入力してください");
    }
  });

  test("imageUrl が不正なURL形式の場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "invalid-url",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const imageUrlIssue = result.error.issues.find(
        (issue) => issue.path[0] === "imageUrl",
      );
      expect(imageUrlIssue?.message).toBe("有効なURLを入力してください");
    }
  });

  test("imageUrls が空配列の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
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
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      imageUrls: Array.from({ length: 11 }, (_, i) => ({
        url: `https://example.com/img${i}.jpg`,
      })),
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const imageUrlsIssue = result.error.issues.find(
        (issue) => issue.path[0] === "imageUrls",
      );
      expect(imageUrlsIssue?.message).toBe("画像は最大10枚までです");
    }
  });

  test("imageUrls に不正なURL形式が含まれる場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
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
      const imageUrlsIssue = result.error.issues.find(
        (issue) => issue.path[0] === "imageUrls",
      );
      expect(imageUrlsIssue?.message).toBe("有効なURLを入力してください");
    }
  });

  test("businessHours の openTime が HH:MM 形式でない場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
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
      const openTimeIssue = result.error.issues.find((issue) =>
        issue.path.includes("openTime"),
      );
      expect(openTimeIssue?.message).toBe(
        "開店時刻は HH:mm 形式で入力してください",
      );
    }
  });

  test("businessHours の closeTime が HH:MM 形式でない場合エラーになる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
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
      const closeTimeIssue = result.error.issues.find((issue) =>
        issue.path.includes("closeTime"),
      );
      expect(closeTimeIssue?.message).toBe(
        "閉店時刻は HH:mm 形式で入力してください",
      );
    }
  });

  test("businessHours が null の場合検証を通過する", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
      businessHours: null,
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("sortOrder は schema に含まれない（システム管理）", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
      address: "東京都渋谷区1-2-3",
      imageUrl: "https://example.com/image.jpg",
    };

    const result = locationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("sortOrder" in result.data).toBe(false);
    }
  });

  test("isPublished がデフォルトで false になる", () => {
    const data = {
      name: "施設名",
      slug: "test-location",
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
