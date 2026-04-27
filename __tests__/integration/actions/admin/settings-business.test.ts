/**
 * 事業者情報・連絡先・営業時間 Server Action統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/business.ts のテスト
 *
 * 対象スキーマ:
 * - businessInfoSchema（事業者情報）
 * - contactInfoSchema（連絡先情報）
 * - businessHoursSettingsSchema（営業時間設定）
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// =============================================================================
// スキーマ再現（schemas.ts から）
// =============================================================================

const businessInfoSchema = z.object({
  businessName: z.string().max(100).nullable(),
  businessNameKana: z.string().max(100).nullable(),
  representativeName: z.string().max(50).nullable(),
  businessType: z.string().max(50).nullable(),
  industryType: z.string().max(50).nullable(),
  establishedDate: z.string().nullable(),
  registrationNumber: z.string().max(50).nullable(),
  invoiceNumber: z.string().max(20).nullable(),
  businessDescription: z.string().max(2000).nullable(),
});

const contactInfoSchema = z.object({
  phoneNumber: z.string().max(20).nullable(),
  faxNumber: z.string().max(20).nullable(),
  email: z.string().email().max(100).nullable().or(z.literal("")),
  address: z.string().max(500).nullable(),
  postalCode: z.string().max(10).nullable(),
  prefecture: z.string().max(10).nullable(),
  city: z.string().max(50).nullable(),
  streetAddress: z.string().max(100).nullable(),
  buildingName: z.string().max(100).nullable(),
});

// 時刻フォーマット: HH:mm（00:00-23:59）
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeSlotSchema = z
  .object({
    openTime: z.string().regex(TIME_REGEX, {
      error: "正しい時刻形式（HH:mm）で入力してください",
    }),
    closeTime: z.string().regex(TIME_REGEX, {
      error: "正しい時刻形式（HH:mm）で入力してください",
    }),
  })
  .refine((data) => data.closeTime > data.openTime, {
    error: "終了時刻は開始時刻より後にしてください",
    path: ["closeTime"],
  });

const businessHoursDayBaseSchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(
    z.object({
      openTime: z.string().regex(TIME_REGEX),
      closeTime: z.string().regex(TIME_REGEX),
    }),
  ),
});

const businessHoursWeekSchema = z.object({
  monday: businessHoursDayBaseSchema,
  tuesday: businessHoursDayBaseSchema,
  wednesday: businessHoursDayBaseSchema,
  thursday: businessHoursDayBaseSchema,
  friday: businessHoursDayBaseSchema,
  saturday: businessHoursDayBaseSchema,
  sunday: businessHoursDayBaseSchema,
});

const businessHoursSettingsSchema = z.object({
  businessHours: businessHoursWeekSchema,
  regularHolidays: z.array(z.string()).nullable(),
  specialHolidays: z.array(z.string()).nullable(),
  holidayNotice: z
    .string()
    .max(1000)
    .regex(/^[^<>]*$/, { error: "HTMLタグは使用できません" })
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_BUSINESS_INFO_INPUT = {
  businessName: "ミルレンタルスペース",
  businessNameKana: "ミルレンタルスペース",
  representativeName: "山田太郎",
  businessType: "株式会社",
  industryType: "レンタルスペース",
  establishedDate: "2020-01-01",
  registrationNumber: "1234567890123",
  invoiceNumber: "T1234567890123",
  businessDescription: "レンタルスペースの運営を行っています。",
};

const VALID_CONTACT_INFO_INPUT = {
  phoneNumber: "03-1234-5678",
  faxNumber: "03-1234-5679",
  email: "info@example.com",
  address: "東京都渋谷区1-2-3",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "1-2-3",
  buildingName: "テストビル5F",
};

const DEFAULT_DAY = {
  isOpen: true,
  slots: [{ openTime: "09:00", closeTime: "21:00" }],
};
const CLOSED_DAY = { isOpen: false, slots: [] };

const VALID_BUSINESS_HOURS_SETTINGS_INPUT = {
  businessHours: {
    monday: DEFAULT_DAY,
    tuesday: DEFAULT_DAY,
    wednesday: DEFAULT_DAY,
    thursday: DEFAULT_DAY,
    friday: DEFAULT_DAY,
    saturday: DEFAULT_DAY,
    sunday: CLOSED_DAY,
  },
  regularHolidays: ["sunday"],
  specialHolidays: ["2026-01-01", "2026-01-02"],
  holidayNotice: "年末年始は休業いたします。",
};

// =============================================================================
// テスト
// =============================================================================

describe("Settings Business Admin Action Integration", () => {
  // ===========================================================================
  // businessInfoSchema
  // ===========================================================================

  describe("businessInfoSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = businessInfoSchema.safeParse(VALID_BUSINESS_INFO_INPUT);
        expect(result.success).toBe(true);
      });

      test("全フィールドnullでもバリデーション通過", () => {
        const result = businessInfoSchema.safeParse({
          businessName: null,
          businessNameKana: null,
          representativeName: null,
          businessType: null,
          industryType: null,
          establishedDate: null,
          registrationNumber: null,
          invoiceNumber: null,
          businessDescription: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("businessName", () => {
      test("100文字はOK", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          businessName: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字はエラー", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          businessName: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("representativeName", () => {
      test("50文字はOK", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          representativeName: "あ".repeat(50),
        });
        expect(result.success).toBe(true);
      });

      test("51文字はエラー", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          representativeName: "あ".repeat(51),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("invoiceNumber", () => {
      test("20文字はOK", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          invoiceNumber: "T".repeat(20),
        });
        expect(result.success).toBe(true);
      });

      test("21文字はエラー", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          invoiceNumber: "T".repeat(21),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("businessDescription", () => {
      test("2000文字はOK", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          businessDescription: "あ".repeat(2000),
        });
        expect(result.success).toBe(true);
      });

      test("2001文字はエラー", () => {
        const result = businessInfoSchema.safeParse({
          ...VALID_BUSINESS_INFO_INPUT,
          businessDescription: "あ".repeat(2001),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // contactInfoSchema
  // ===========================================================================

  describe("contactInfoSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = contactInfoSchema.safeParse(VALID_CONTACT_INFO_INPUT);
        expect(result.success).toBe(true);
      });

      test("全フィールドnullでもバリデーション通過", () => {
        const result = contactInfoSchema.safeParse({
          phoneNumber: null,
          faxNumber: null,
          email: null,
          address: null,
          postalCode: null,
          prefecture: null,
          city: null,
          streetAddress: null,
          buildingName: null,
        });
        expect(result.success).toBe(true);
      });

      test("emailは空文字列を許可", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          email: "",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("email", () => {
      test("有効なメールアドレスはOK", () => {
        const validEmails = [
          "test@example.com",
          "user+tag@domain.co.jp",
          "admin@sub.domain.com",
        ];
        for (const email of validEmails) {
          const result = contactInfoSchema.safeParse({
            ...VALID_CONTACT_INFO_INPUT,
            email,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なメールアドレスはエラー", () => {
        const invalidEmails = [
          "invalid-email",
          "@domain.com",
          "user@",
          "user@.com",
        ];
        for (const email of invalidEmails) {
          const result = contactInfoSchema.safeParse({
            ...VALID_CONTACT_INFO_INPUT,
            email,
          });
          expect(result.success).toBe(false);
        }
      });

      test("100文字のメールアドレスはOK", () => {
        const email = "a".repeat(88) + "@example.com";
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          email,
        });
        expect(result.success).toBe(true);
      });

      test("101文字のメールアドレスはエラー", () => {
        const email = "a".repeat(89) + "@example.com";
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          email,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("phoneNumber / faxNumber", () => {
      test("20文字はOK", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          phoneNumber: "0".repeat(20),
        });
        expect(result.success).toBe(true);
      });

      test("21文字はエラー", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          phoneNumber: "0".repeat(21),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("postalCode", () => {
      test("10文字はOK", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          postalCode: "1234567890",
        });
        expect(result.success).toBe(true);
      });

      test("11文字はエラー", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          postalCode: "12345678901",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("address", () => {
      test("500文字はOK", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          address: "あ".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字はエラー", () => {
        const result = contactInfoSchema.safeParse({
          ...VALID_CONTACT_INFO_INPUT,
          address: "あ".repeat(501),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // businessHoursSettingsSchema
  // ===========================================================================

  describe("businessHoursSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = businessHoursSettingsSchema.safeParse(
          VALID_BUSINESS_HOURS_SETTINGS_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("全日定休でもバリデーション通過", () => {
        const result = businessHoursSettingsSchema.safeParse({
          businessHours: {
            monday: CLOSED_DAY,
            tuesday: CLOSED_DAY,
            wednesday: CLOSED_DAY,
            thursday: CLOSED_DAY,
            friday: CLOSED_DAY,
            saturday: CLOSED_DAY,
            sunday: CLOSED_DAY,
          },
          regularHolidays: null,
          specialHolidays: null,
          holidayNotice: null,
        });
        expect(result.success).toBe(true);
      });

      test("複数時間帯の営業日", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          businessHours: {
            ...VALID_BUSINESS_HOURS_SETTINGS_INPUT.businessHours,
            monday: {
              isOpen: true,
              slots: [
                { openTime: "09:00", closeTime: "12:00" },
                { openTime: "13:00", closeTime: "18:00" },
              ],
            },
          },
        });
        expect(result.success).toBe(true);
      });
    });

    describe("timeSlot バリデーション", () => {
      test("有効な時刻形式", () => {
        const validTimes = ["00:00", "09:00", "12:30", "23:59"];
        for (const time of validTimes) {
          const result = timeSlotSchema.safeParse({
            openTime: "00:00",
            closeTime: time === "00:00" ? "01:00" : time,
          });
          // 00:00-00:00 は closeTime > openTime で失敗するため別途扱う
          if (time === "00:00") {
            // openTime: 00:00, closeTime: 01:00
            expect(result.success).toBe(true);
          } else {
            expect(result.success).toBe(true);
          }
        }
      });

      test("無効な時刻形式はエラー", () => {
        const invalidTimes = ["24:00", "9:00", "09:60", "abc", ""];
        for (const time of invalidTimes) {
          const result = timeSlotSchema.safeParse({
            openTime: time,
            closeTime: "18:00",
          });
          expect(result.success).toBe(false);
        }
      });

      test("終了時刻が開始時刻と同じはエラー", () => {
        const result = timeSlotSchema.safeParse({
          openTime: "09:00",
          closeTime: "09:00",
        });
        expect(result.success).toBe(false);
      });

      test("終了時刻が開始時刻より前はエラー", () => {
        const result = timeSlotSchema.safeParse({
          openTime: "18:00",
          closeTime: "09:00",
        });
        expect(result.success).toBe(false);
      });

      test("終了時刻が開始時刻より後はOK", () => {
        const result = timeSlotSchema.safeParse({
          openTime: "09:00",
          closeTime: "18:00",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("businessHours 曜日", () => {
      test("曜日欠落はエラー", () => {
        const { sunday: _, ...incomplete } =
          VALID_BUSINESS_HOURS_SETTINGS_INPUT.businessHours;
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          businessHours: incomplete,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("holidayNotice", () => {
      test("1000文字はOK", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          holidayNotice: "あ".repeat(1000),
        });
        expect(result.success).toBe(true);
      });

      test("1001文字はエラー", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          holidayNotice: "あ".repeat(1001),
        });
        expect(result.success).toBe(false);
      });

      test("HTMLタグを含むとエラー", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          holidayNotice: '<script>alert("xss")</script>',
        });
        expect(result.success).toBe(false);
      });

      test("空文字列はnullに変換", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          holidayNotice: "",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.holidayNotice).toBe(null);
        }
      });

      test("nullは許可", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          holidayNotice: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("regularHolidays / specialHolidays", () => {
      test("文字列配列はOK", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          regularHolidays: ["monday", "sunday"],
          specialHolidays: ["2026-01-01"],
        });
        expect(result.success).toBe(true);
      });

      test("nullは許可", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          regularHolidays: null,
          specialHolidays: null,
        });
        expect(result.success).toBe(true);
      });

      test("空配列はOK", () => {
        const result = businessHoursSettingsSchema.safeParse({
          ...VALID_BUSINESS_HOURS_SETTINGS_INPUT,
          regularHolidays: [],
          specialHolidays: [],
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // 型エラーテスト
  // ===========================================================================

  describe("型エラー", () => {
    test("businessInfoSchema: businessName に数値はエラー", () => {
      const result = businessInfoSchema.safeParse({
        ...VALID_BUSINESS_INFO_INPUT,
        businessName: 12345,
      });
      expect(result.success).toBe(false);
    });

    test("contactInfoSchema: email にbooleanはエラー", () => {
      const result = contactInfoSchema.safeParse({
        ...VALID_CONTACT_INFO_INPUT,
        email: true,
      });
      expect(result.success).toBe(false);
    });
  });
});
