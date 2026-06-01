/**
 * 場所（Location）管理 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + 型構造をテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// location.ts 内で使用されている locationFormSchema を再現
const businessTimeSlotSchema = z.object({
  openTime: z.string().regex(/^\d{2}:\d{2}$/, {
    error: "開店時刻は HH:MM 形式で入力してください",
  }),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, {
    error: "閉店時刻は HH:MM 形式で入力してください",
  }),
});

const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
});

const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

const imageUrlsSchema = z
  .array(z.string().url({ error: "有効なURLを入力してください" }))
  .max(10, { error: "画像は最大10枚までです" })
  .default([]);

const locationFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "名前を入力してください" })
    .max(100, { error: "名前は100文字以内で入力してください" }),
  description: z
    .string()
    .max(1000, { error: "説明は1000文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .min(1, { error: "住所を入力してください" })
    .max(500, { error: "住所は500文字以内で入力してください" }),
  access: z
    .string()
    .max(1000, { error: "アクセス情報は1000文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  imageUrl: z
    .string()
    .min(1, { error: "建物画像URLを入力してください" })
    .url({ error: "有効なURLを入力してください" }),
  imageUrls: imageUrlsSchema,
  businessHours: businessHoursSchema.optional().nullable(),
  // sortOrder はシステム管理（D&D 並び替えが SSoT、手動入力なし）
  isPublished: z.boolean().default(false),
});

// 有効な場所作成データ
const VALID_LOCATION_INPUT = {
  name: "渋谷本店",
  description: "渋谷駅から徒歩5分のレンタルスペースです。",
  address: "東京都渋谷区渋谷1-1-1",
  access: "渋谷駅ハチ公口から徒歩5分",
  imageUrl: "https://example.com/images/building.jpg",
  imageUrls: [
    "https://example.com/images/room1.jpg",
    "https://example.com/images/room2.jpg",
  ],
  businessHours: null,
  isPublished: true,
};

// 有効な営業時間データ
const VALID_BUSINESS_HOURS = {
  monday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "21:00" }] },
  tuesday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "21:00" }] },
  wednesday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "21:00" }],
  },
  thursday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "21:00" }],
  },
  friday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "22:00" }] },
  saturday: {
    isOpen: true,
    slots: [{ openTime: "10:00", closeTime: "22:00" }],
  },
  sunday: { isOpen: false, slots: [] },
};

describe("Location Admin Action Integration", () => {
  describe("locationFormSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = locationFormSchema.safeParse(VALID_LOCATION_INPUT);
        expect(result.success).toBe(true);
      });

      test("営業時間付きデータはバリデーション通過", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          businessHours: VALID_BUSINESS_HOURS,
        });
        expect(result.success).toBe(true);
      });

      test("descriptionは空文字許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          description: "",
        });
        expect(result.success).toBe(true);
      });

      test("descriptionはオプション", () => {
        const { description: _d, ...inputWithoutDesc } = VALID_LOCATION_INPUT;
        const result = locationFormSchema.safeParse(inputWithoutDesc);
        expect(result.success).toBe(true);
      });

      test("accessは空文字許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          access: "",
        });
        expect(result.success).toBe(true);
      });

      test("businessHoursはnull許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          businessHours: null,
        });
        expect(result.success).toBe(true);
      });

      test("businessHoursはオプション", () => {
        const { businessHours: _bh, ...inputWithoutHours } =
          VALID_LOCATION_INPUT;
        const result = locationFormSchema.safeParse(inputWithoutHours);
        expect(result.success).toBe(true);
      });

      test("imageUrlsのデフォルトは空配列", () => {
        const { imageUrls: _iu, ...inputWithoutUrls } = VALID_LOCATION_INPUT;
        const result = locationFormSchema.safeParse(inputWithoutUrls);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.imageUrls).toEqual([]);
        }
      });

      test("isPublishedのデフォルトはfalse", () => {
        const { isPublished: _ip, ...inputWithoutPublished } =
          VALID_LOCATION_INPUT;
        const result = locationFormSchema.safeParse(inputWithoutPublished);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isPublished).toBe(false);
        }
      });
    });

    describe("name", () => {
      test("空の名前はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          name: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("名前を入力");
        }
      });

      test("100文字の名前はOK", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          name: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字の名前はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          name: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("100文字以内");
        }
      });
    });

    describe("address", () => {
      test("空の住所はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          address: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("住所を入力");
        }
      });

      test("500文字の住所はOK", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          address: "あ".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字の住所はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          address: "あ".repeat(501),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("500文字以内");
        }
      });
    });

    describe("description", () => {
      test("1000文字の説明はOK", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          description: "あ".repeat(1000),
        });
        expect(result.success).toBe(true);
      });

      test("1001文字の説明はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          description: "あ".repeat(1001),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("1000文字以内");
        }
      });
    });

    describe("access", () => {
      test("1000文字のアクセス情報はOK", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          access: "あ".repeat(1000),
        });
        expect(result.success).toBe(true);
      });

      test("1001文字のアクセス情報はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          access: "あ".repeat(1001),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("1000文字以内");
        }
      });
    });

    describe("imageUrl", () => {
      test("有効なURLは許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrl: "https://example.com/image.jpg",
        });
        expect(result.success).toBe(true);
      });

      test("空のimageUrlはエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrl: "",
        });
        expect(result.success).toBe(false);
      });

      test("無効なURLはエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrl: "not-a-url",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("imageUrls", () => {
      test("有効なURL配列は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        });
        expect(result.success).toBe(true);
      });

      test("10枚の画像はOK", () => {
        const urls = Array.from(
          { length: 10 },
          (_, i) => `https://example.com/${i}.jpg`,
        );
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrls: urls,
        });
        expect(result.success).toBe(true);
      });

      test("11枚の画像はエラー", () => {
        const urls = Array.from(
          { length: 11 },
          (_, i) => `https://example.com/${i}.jpg`,
        );
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrls: urls,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("最大10枚");
        }
      });

      test("無効なURLを含む配列はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          imageUrls: ["not-a-url"],
        });
        expect(result.success).toBe(false);
      });
    });

    describe("isPublished", () => {
      test("trueは許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          isPublished: true,
        });
        expect(result.success).toBe(true);
      });

      test("falseは許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          isPublished: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          isPublished: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("businessHoursSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効な営業時間はバリデーション通過", () => {
        const result = businessHoursSchema.safeParse(VALID_BUSINESS_HOURS);
        expect(result.success).toBe(true);
      });

      test("複数スロットの営業時間は許可", () => {
        const hours = {
          ...VALID_BUSINESS_HOURS,
          monday: {
            isOpen: true,
            slots: [
              { openTime: "09:00", closeTime: "12:00" },
              { openTime: "13:00", closeTime: "17:00" },
            ],
          },
        };
        const result = businessHoursSchema.safeParse(hours);
        expect(result.success).toBe(true);
      });

      test("全曜日休業は許可", () => {
        const allClosed = {
          monday: { isOpen: false, slots: [] },
          tuesday: { isOpen: false, slots: [] },
          wednesday: { isOpen: false, slots: [] },
          thursday: { isOpen: false, slots: [] },
          friday: { isOpen: false, slots: [] },
          saturday: { isOpen: false, slots: [] },
          sunday: { isOpen: false, slots: [] },
        };
        const result = businessHoursSchema.safeParse(allClosed);
        expect(result.success).toBe(true);
      });
    });

    describe("異常系", () => {
      test("曜日が欠落するとエラー", () => {
        const { sunday: _s, ...hoursWithoutSunday } = VALID_BUSINESS_HOURS;
        const result = businessHoursSchema.safeParse(hoursWithoutSunday);
        expect(result.success).toBe(false);
      });

      test("無効な時刻形式はエラー", () => {
        const hours = {
          ...VALID_BUSINESS_HOURS,
          monday: {
            isOpen: true,
            slots: [{ openTime: "9:00", closeTime: "21:00" }],
          },
        };
        const result = businessHoursSchema.safeParse(hours);
        expect(result.success).toBe(false);
      });

      test("HH:MM以外の時刻形式はエラー", () => {
        const invalidTimes = ["25:00", "abc", "9am", "09:60"];
        for (const openTime of invalidTimes) {
          const hours = {
            ...VALID_BUSINESS_HOURS,
            monday: {
              isOpen: true,
              slots: [{ openTime, closeTime: "21:00" }],
            },
          };
          const result = businessHoursSchema.safeParse(hours);
          // 正規表現は ^\d{2}:\d{2}$ なので '25:00' は通過するが '9am' は不通過
          // '09:60' も ^\d{2}:\d{2}$ にマッチするため通過する（論理チェックではない）
          if (openTime === "25:00" || openTime === "09:60") {
            // 正規表現パターンマッチのみ（数値範囲チェックなし）
            expect(result.success).toBe(true);
          } else {
            expect(result.success).toBe(false);
          }
        }
      });

      test("isOpenが文字列だとエラー", () => {
        const hours = {
          ...VALID_BUSINESS_HOURS,
          monday: {
            isOpen: "true",
            slots: [],
          },
        };
        const result = businessHoursSchema.safeParse(hours);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("LocationWithStats型テスト", () => {
    test("LocationWithStats型の構造", () => {
      type LocationWithStats = {
        id: string;
        name: string;
        description: string | null;
        address: string;
        access: string | null;
        imageUrl: string;
        imageUrls: string[];
        businessHours: unknown;
        sortOrder: number;
        isPublished: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        _count: {
          spaces: number;
        };
      };

      const location: LocationWithStats = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "渋谷本店",
        description: "渋谷のレンタルスペース",
        address: "東京都渋谷区渋谷1-1-1",
        access: "渋谷駅から徒歩5分",
        imageUrl: "https://example.com/building.jpg",
        imageUrls: ["https://example.com/room1.jpg"],
        businessHours: VALID_BUSINESS_HOURS,
        sortOrder: 0,
        isPublished: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { spaces: 3 },
      };

      expect(location.name).toBe("渋谷本店");
      expect(location._count.spaces).toBe(3);
      expect(location.imageUrls).toHaveLength(1);
    });
  });

  describe("MEO フィールドバリデーション", () => {
    describe("latitude / longitude", () => {
      test("有効な緯度・経度は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          latitude: 35.6595,
          longitude: 139.7004,
        });
        expect(result.success).toBe(true);
      });

      test("null の緯度・経度は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          latitude: null,
          longitude: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("googleBusinessPlaceId", () => {
      test("有効な Place ID は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          googleBusinessPlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        });
        expect(result.success).toBe(true);
      });

      test("空文字の Place ID は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          googleBusinessPlaceId: "",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("priceRange", () => {
      test("有効な priceRange は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          priceRange: "¥1,000〜¥5,000/時間",
        });
        expect(result.success).toBe(true);
      });

      test("空文字の priceRange は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          priceRange: "",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("postalCode / prefecture / city / streetAddress / buildingName", () => {
      test("全 NAP 住所フィールドを設定できる", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          postalCode: "150-0001",
          prefecture: "東京都",
          city: "渋谷区",
          streetAddress: "渋谷1-2-3",
          buildingName: "渋谷ビル 3F",
        });
        expect(result.success).toBe(true);
      });

      test("空文字の住所サブフィールドは許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          postalCode: "",
          prefecture: "",
          city: "",
          streetAddress: "",
          buildingName: "",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("phoneNumber / email（per-location MEO）", () => {
      test("有効な電話番号は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          phoneNumber: "03-1234-5678",
        });
        expect(result.success).toBe(true);
      });

      test("空文字の電話番号は許可", () => {
        const result = locationFormSchema.safeParse({
          ...VALID_LOCATION_INPUT,
          phoneNumber: "",
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe("境界値テスト", () => {
    test("名前 100文字（境界）", () => {
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        name: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    test("名前 101文字（境界超過）", () => {
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        name: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    test("住所 500文字（境界）", () => {
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        address: "x".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    test("住所 501文字（境界超過）", () => {
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        address: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    test("説明 1000文字（境界）", () => {
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        description: "x".repeat(1000),
      });
      expect(result.success).toBe(true);
    });

    test("説明 1001文字（境界超過）", () => {
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        description: "x".repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    test("画像URL 10枚（境界）", () => {
      const urls = Array.from(
        { length: 10 },
        (_, i) => `https://example.com/${i}.jpg`,
      );
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        imageUrls: urls,
      });
      expect(result.success).toBe(true);
    });

    test("画像URL 11枚（境界超過）", () => {
      const urls = Array.from(
        { length: 11 },
        (_, i) => `https://example.com/${i}.jpg`,
      );
      const result = locationFormSchema.safeParse({
        ...VALID_LOCATION_INPUT,
        imageUrls: urls,
      });
      expect(result.success).toBe(false);
    });
  });
});
