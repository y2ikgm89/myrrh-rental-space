/**
 * スペースバリデーションテスト
 *
 * src/lib/validations/space.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  spaceFormSchema,
  defaultSpaceFormValues,
} from "@/admin/lib/validations/space";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";

const TEST_LOCATION_ID = "11111111-1111-4111-8111-111111111111";

// 有効なスペースデータ
const VALID_SPACE_INPUT = {
  slug: "test-space",
  name: "テストスペース",
  descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
  descriptionHtml: "",
  addressDetail: "3F 会議室A",
  capacity: 10,
  area: 50.5,
  hourlyPrice: 1000,
  dailyPrice: 8000,
  mainImageUrl: "https://example.com/images/main.jpg",
  gallery: [
    { url: "https://example.com/images/1.jpg", alt: "", caption: "" },
    { url: "https://example.com/images/2.jpg", alt: "", caption: "" },
  ],
  facilities: [
    { name: "WiFi", iconName: "" },
    { name: "プロジェクター", iconName: "" },
    { name: "電源", iconName: "" },
  ],
  isPublished: false,
  locationId: TEST_LOCATION_ID,
  categoryId: null,
};

describe("spaceFormSchema", () => {
  describe("正常系", () => {
    test("有効なデータは検証を通過", () => {
      const result = spaceFormSchema.safeParse(VALID_SPACE_INPUT);
      expect(result.success).toBe(true);
    });

    test("オプショナルフィールドを省略可能", () => {
      const minimalInput = {
        slug: "test-space",
        name: "テストスペース",
        descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
        descriptionHtml: "",
        locationId: TEST_LOCATION_ID,
        capacity: 1,
        hourlyPrice: 0,
        mainImageUrl: "https://example.com/images/main.jpg",
      };
      const result = spaceFormSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
    });

    test("デフォルト値が適用される", () => {
      const input = {
        slug: "test-space",
        name: "テストスペース",
        descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
        descriptionHtml: "",
        locationId: TEST_LOCATION_ID,
        capacity: 1,
        hourlyPrice: 0,
        mainImageUrl: "https://example.com/images/main.jpg",
      };
      const result = spaceFormSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gallery).toEqual([]);
        expect(result.data.facilities).toEqual([]);
        expect(result.data.isPublished).toBe(false);
      }
    });
  });

  describe("name", () => {
    test("空文字はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("名前");
      }
    });

    test("100文字超過はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: "あ".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100文字以内");
      }
    });

    test("100文字ちょうどは許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: "あ".repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("descriptionJson", () => {
    test("空文字は Lexical JSON ではないためエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        descriptionJson: "",
      });
      expect(result.success).toBe(false);
    });

    test("プレーン文字列は Lexical JSON ではないためエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        descriptionJson: "123456789",
      });
      expect(result.success).toBe(false);
    });

    test("有効な Lexical EditorState JSON は許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("locationId", () => {
    test("空文字はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        locationId: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("拠点");
      }
    });
  });

  describe("addressDetail", () => {
    test("500文字超過はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        addressDetail: "あ".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("500文字以内");
      }
    });
  });

  describe("capacity", () => {
    test("0はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("1以上");
      }
    });

    test("1001はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 1001,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("1000以下");
      }
    });

    test("小数はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 10.5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("整数");
      }
    });

    test("1と1000は許可", () => {
      for (const capacity of [1, 1000]) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("area", () => {
    test("nullは許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: null,
      });
      expect(result.success).toBe(true);
    });

    test("0以下はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("正の数");
      }
    });

    test("10001はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: 10001,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("10000以下");
      }
    });

    test("小数は許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: 50.5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("hourlyPrice", () => {
    test("負の値はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        hourlyPrice: -1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("0以上");
      }
    });

    test("1000001はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        hourlyPrice: 1000001,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("1000000以下");
      }
    });

    test("0と1000000は許可", () => {
      for (const hourlyPrice of [0, 1000000]) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          hourlyPrice,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("dailyPrice", () => {
    test("nullは許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        dailyPrice: null,
      });
      expect(result.success).toBe(true);
    });

    test("負の値はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        dailyPrice: -1,
      });
      expect(result.success).toBe(false);
    });

    test("10000001はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        dailyPrice: 10000001,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("10000000以下");
      }
    });
  });

  describe("mainImageUrl", () => {
    test("空文字はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        mainImageUrl: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("メイン画像URL");
      }
    });

    test("無効なURLはエラー", () => {
      // Zodの.url()はftp://も有効なURLとして扱う
      const invalidUrls = ["invalid", "not-a-url", "example.com"];

      for (const mainImageUrl of invalidUrls) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl,
        });
        expect(result.success).toBe(false);
      }
    });

    test("有効なURLは許可", () => {
      const validUrls = [
        "https://example.com/image.jpg",
        "http://example.com/image.png",
      ];

      for (const mainImageUrl of validUrls) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("gallery", () => {
    test("空配列は許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        gallery: [],
      });
      expect(result.success).toBe(true);
    });

    test("21枚以上はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        gallery: Array(21).fill({
          url: "https://example.com/image.jpg",
          alt: "",
          caption: "",
        }),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("最大20件");
      }
    });

    test("無効なURLが含まれるとエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        gallery: [{ url: "invalid-url", alt: "", caption: "" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("facilities", () => {
    test("空配列は許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: [],
      });
      expect(result.success).toBe(true);
    });

    test("name 空文字を含む要素はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: [
          { name: "WiFi", iconName: "" },
          { name: "", iconName: "" },
        ],
      });
      expect(result.success).toBe(false);
    });

    test("name が 51文字以上の要素はエラー", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: [{ name: "あ".repeat(51), iconName: "" }],
      });
      expect(result.success).toBe(false);
    });

    test("iconName 付きの要素は許可", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: [
          { name: "WiFi", iconName: "IconWifi" },
          { name: "プロジェクター", iconName: "IconDeviceTv" },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("name 重複はエラー（uniqueness 契約）", () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: [
          { name: "WiFi", iconName: "IconWifi" },
          { name: "WiFi", iconName: "" },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("isPublished", () => {
    test("true/falseは許可", () => {
      for (const isPublished of [true, false]) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          isPublished,
        });
        expect(result.success).toBe(true);
      }
    });

    test("デフォルトはfalse", () => {
      const { isPublished, ...withoutIsPublished } = VALID_SPACE_INPUT;
      const result = spaceFormSchema.safeParse(withoutIsPublished);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isPublished).toBe(false);
      }
    });
  });
});

describe("defaultSpaceFormValues", () => {
  test("デフォルト値が正しく定義されている", () => {
    expect(defaultSpaceFormValues).toEqual({
      slug: "",
      name: "",
      descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      descriptionHtml: "",
      addressDetail: "",
      capacity: 10,
      area: null,
      hourlyPrice: 0,
      dailyPrice: null,
      mainImageUrl: "",
      gallery: [],
      facilities: [],
      isPublished: false,
      reviewsEnabled: true,
      locationId: "",
      categoryId: null,
      // 割引設定
      discountType: "none",
      discountValue: null,
      durationDiscountOverride: "inherit",
      // 税率設定
      taxRateType: "standard",
      metaDescription: null,
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
    });
  });
});
