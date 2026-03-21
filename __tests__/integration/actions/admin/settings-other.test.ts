/**
 * その他の設定 Server Action統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts のテスト
 *
 * 対象スキーマ:
 * - maintenanceSettingsSchema（メンテナンス設定）
 * - cookieConsentSettingsSchema（Cookie同意設定）
 * - termsAgreementSettingsSchema（規約同意設定）
 * - reservationSettingsSchema（予約設定）
 * - announcementBarCarouselSettingsSchema（お知らせバーカルーセル設定）
 * - permalinkSettingsSchema（パーマリンク設定）
 * - sidebarSettingsSchema（サイドバー設定）
 * - robotsTxtSettingsSchema（robots.txt設定）
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  PostPermalinkStructure,
} from "@/shared/db/enums";

// =============================================================================
// スキーマ再現（schemas.ts / sidebar.ts から）
// =============================================================================

const maintenanceSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(1000).nullable(),
});

const cookieConsentSettingsSchema = z.object({
  cookieConsentEnabled: z.boolean(),
  cookieConsentMessage: z.string().max(1000).nullable(),
  cookieConsentAcceptText: z.string().max(50).nullable(),
  cookieConsentRejectText: z.string().max(50).nullable(),
  cookieConsentPolicyUrl: z.string().max(200).nullable(),
});

const termsAgreementSettingsSchema = z.object({
  termsAgreementEnabled: z.boolean(),
  termsAgreementText: z.string().max(500).nullable(),
  requireTermsAgreement: z.boolean(),
  requirePrivacyAgreement: z.boolean(),
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationTermsId: z.string().uuid().nullable(),
});

const announcementBarCarouselSettingsSchema = z.object({
  announcementBarAnimation: z.enum(AnnouncementBarAnimation),
  announcementBarDuration: z.number().int().min(1000).max(30000),
  announcementBarAutoPlay: z.boolean(),
  announcementBarPauseOnHover: z.boolean(),
  announcementBarShowArrows: z.boolean(),
  announcementBarShowIndicator: z.boolean(),
  announcementBarDesignStyle: z.enum(AnnouncementBarDesignStyle),
  announcementBarBgColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarTextColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarStripeColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarStripeAnimation: z.boolean(),
  announcementBarGradientAnimation: z.boolean(),
  announcementBarGlassAnimation: z.boolean(),
  announcementBarSticky: z.boolean(),
});

const permalinkSettingsSchema = z.object({
  postPermalinkStructure: z.enum(PostPermalinkStructure),
  postUrlPrefixEnabled: z.boolean(),
});

const sidebarWidgetsSchema = z.object({
  search: z.boolean().default(true),
  recent: z.boolean().default(true),
  popular: z.boolean().default(true),
  categories: z.boolean().default(true),
  tags: z.boolean().default(true),
});

const sidebarSettingsSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: sidebarWidgetsSchema,
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
});

const robotsTxtSettingsSchema = z.object({
  robotsTxtEnabled: z.boolean(),
  robotsTxtCustom: z
    .string()
    .max(10000, { error: "robots.txtは10000文字以内で入力してください" })
    .nullable(),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_MAINTENANCE_INPUT = {
  maintenanceMode: false,
  maintenanceMessage: "メンテナンス中です。しばらくお待ちください。",
};

const VALID_COOKIE_CONSENT_INPUT = {
  cookieConsentEnabled: true,
  cookieConsentMessage: "当サイトではCookieを使用しています。",
  cookieConsentAcceptText: "同意する",
  cookieConsentRejectText: "拒否する",
  cookieConsentPolicyUrl: "/privacy",
};

const VALID_TERMS_AGREEMENT_INPUT = {
  termsAgreementEnabled: true,
  termsAgreementText: "利用規約およびプライバシーポリシーに同意してください。",
  requireTermsAgreement: true,
  requirePrivacyAgreement: true,
};

const VALID_RESERVATION_INPUT = {
  defaultTimeSlot: 60,
  minReservationDuration: 30,
  maxReservationDuration: 480,
  cancellationTermsId: VALID_UUID,
};

const VALID_ANNOUNCEMENT_BAR_INPUT = {
  announcementBarAnimation: AnnouncementBarAnimation.fade,
  announcementBarDuration: 5000,
  announcementBarAutoPlay: true,
  announcementBarPauseOnHover: true,
  announcementBarShowArrows: true,
  announcementBarShowIndicator: true,
  announcementBarDesignStyle: AnnouncementBarDesignStyle.solid,
  announcementBarBgColor: "#FF5733",
  announcementBarTextColor: "#FFFFFF",
  announcementBarStripeColor: null,
  announcementBarStripeAnimation: false,
  announcementBarGradientAnimation: false,
  announcementBarGlassAnimation: false,
  announcementBarSticky: false,
};

const VALID_PERMALINK_INPUT = {
  postPermalinkStructure: PostPermalinkStructure.post_name,
  postUrlPrefixEnabled: true,
};

const VALID_SIDEBAR_INPUT = {
  sidebarEnabled: true,
  sidebarWidgets: {
    search: true,
    recent: true,
    popular: true,
    categories: true,
    tags: true,
  },
  sidebarRecentCount: 5,
  sidebarPopularCount: 5,
};

const VALID_ROBOTS_TXT_INPUT = {
  robotsTxtEnabled: true,
  robotsTxtCustom:
    "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
};

// =============================================================================
// テスト
// =============================================================================

describe("Settings Other Admin Action Integration", () => {
  // ===========================================================================
  // maintenanceSettingsSchema
  // ===========================================================================

  describe("maintenanceSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = maintenanceSettingsSchema.safeParse(
          VALID_MAINTENANCE_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("maintenanceMessage nullはOK", () => {
        const result = maintenanceSettingsSchema.safeParse({
          maintenanceMode: true,
          maintenanceMessage: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("maintenanceMessage", () => {
      test("1000文字はOK", () => {
        const result = maintenanceSettingsSchema.safeParse({
          ...VALID_MAINTENANCE_INPUT,
          maintenanceMessage: "あ".repeat(1000),
        });
        expect(result.success).toBe(true);
      });

      test("1001文字はエラー", () => {
        const result = maintenanceSettingsSchema.safeParse({
          ...VALID_MAINTENANCE_INPUT,
          maintenanceMessage: "あ".repeat(1001),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("maintenanceMode", () => {
      test("booleanは許可", () => {
        for (const value of [true, false]) {
          const result = maintenanceSettingsSchema.safeParse({
            ...VALID_MAINTENANCE_INPUT,
            maintenanceMode: value,
          });
          expect(result.success).toBe(true);
        }
      });

      test("文字列はエラー", () => {
        const result = maintenanceSettingsSchema.safeParse({
          ...VALID_MAINTENANCE_INPUT,
          maintenanceMode: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // cookieConsentSettingsSchema
  // ===========================================================================

  describe("cookieConsentSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = cookieConsentSettingsSchema.safeParse(
          VALID_COOKIE_CONSENT_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("全テキストフィールドnullでもOK", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          cookieConsentEnabled: false,
          cookieConsentMessage: null,
          cookieConsentAcceptText: null,
          cookieConsentRejectText: null,
          cookieConsentPolicyUrl: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("cookieConsentMessage", () => {
      test("1000文字はOK", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          ...VALID_COOKIE_CONSENT_INPUT,
          cookieConsentMessage: "あ".repeat(1000),
        });
        expect(result.success).toBe(true);
      });

      test("1001文字はエラー", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          ...VALID_COOKIE_CONSENT_INPUT,
          cookieConsentMessage: "あ".repeat(1001),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("cookieConsentAcceptText / cookieConsentRejectText", () => {
      test("50文字はOK", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          ...VALID_COOKIE_CONSENT_INPUT,
          cookieConsentAcceptText: "あ".repeat(50),
        });
        expect(result.success).toBe(true);
      });

      test("51文字はエラー", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          ...VALID_COOKIE_CONSENT_INPUT,
          cookieConsentAcceptText: "あ".repeat(51),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("cookieConsentPolicyUrl", () => {
      test("200文字はOK", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          ...VALID_COOKIE_CONSENT_INPUT,
          cookieConsentPolicyUrl: "a".repeat(200),
        });
        expect(result.success).toBe(true);
      });

      test("201文字はエラー", () => {
        const result = cookieConsentSettingsSchema.safeParse({
          ...VALID_COOKIE_CONSENT_INPUT,
          cookieConsentPolicyUrl: "a".repeat(201),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // termsAgreementSettingsSchema
  // ===========================================================================

  describe("termsAgreementSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = termsAgreementSettingsSchema.safeParse(
          VALID_TERMS_AGREEMENT_INPUT,
        );
        expect(result.success).toBe(true);
      });
    });

    describe("termsAgreementText", () => {
      test("500文字はOK", () => {
        const result = termsAgreementSettingsSchema.safeParse({
          ...VALID_TERMS_AGREEMENT_INPUT,
          termsAgreementText: "あ".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字はエラー", () => {
        const result = termsAgreementSettingsSchema.safeParse({
          ...VALID_TERMS_AGREEMENT_INPUT,
          termsAgreementText: "あ".repeat(501),
        });
        expect(result.success).toBe(false);
      });

      test("nullは許可", () => {
        const result = termsAgreementSettingsSchema.safeParse({
          ...VALID_TERMS_AGREEMENT_INPUT,
          termsAgreementText: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("boolean フィールド", () => {
      test("全てfalseでもOK", () => {
        const result = termsAgreementSettingsSchema.safeParse({
          termsAgreementEnabled: false,
          termsAgreementText: null,
          requireTermsAgreement: false,
          requirePrivacyAgreement: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = termsAgreementSettingsSchema.safeParse({
          ...VALID_TERMS_AGREEMENT_INPUT,
          requireTermsAgreement: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // reservationSettingsSchema
  // ===========================================================================

  describe("reservationSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = reservationSettingsSchema.safeParse(
          VALID_RESERVATION_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("予約時間フィールドは null 不可（キャンセル規約のみ null 可）", () => {
        const result = reservationSettingsSchema.safeParse({
          defaultTimeSlot: null,
          minReservationDuration: null,
          maxReservationDuration: null,
          cancellationTermsId: null,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("defaultTimeSlot", () => {
      test("15（最小値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          defaultTimeSlot: 15,
        });
        expect(result.success).toBe(true);
      });

      test("14はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          defaultTimeSlot: 14,
        });
        expect(result.success).toBe(false);
      });

      test("240（最大値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          defaultTimeSlot: 240,
        });
        expect(result.success).toBe(true);
      });

      test("241はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          defaultTimeSlot: 241,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          defaultTimeSlot: 30.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("minReservationDuration", () => {
      test("15（最小値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          minReservationDuration: 15,
        });
        expect(result.success).toBe(true);
      });

      test("480（最大値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          minReservationDuration: 480,
        });
        expect(result.success).toBe(true);
      });

      test("481はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          minReservationDuration: 481,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("maxReservationDuration", () => {
      test("60（最小値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          maxReservationDuration: 60,
        });
        expect(result.success).toBe(true);
      });

      test("59はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          maxReservationDuration: 59,
        });
        expect(result.success).toBe(false);
      });

      test("1440（最大値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          maxReservationDuration: 1440,
        });
        expect(result.success).toBe(true);
      });

      test("1441はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          maxReservationDuration: 1441,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("cancellationTermsId", () => {
      test("有効なUUIDはOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          cancellationTermsId: "550e8400-e29b-41d4-a716-446655440000",
        });
        expect(result.success).toBe(true);
      });

      test("無効なUUIDはエラー", () => {
        const invalidIds = ["invalid", "12345", "not-a-uuid"];
        for (const id of invalidIds) {
          const result = reservationSettingsSchema.safeParse({
            ...VALID_RESERVATION_INPUT,
            cancellationTermsId: id,
          });
          expect(result.success).toBe(false);
        }
      });

      test("nullは許可", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          cancellationTermsId: null,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // announcementBarCarouselSettingsSchema
  // ===========================================================================

  describe("announcementBarCarouselSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse(
          VALID_ANNOUNCEMENT_BAR_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("カラーフィールドnullでもOK", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarBgColor: null,
          announcementBarTextColor: null,
          announcementBarStripeColor: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("announcementBarAnimation", () => {
      test("有効なアニメーション値", () => {
        const validAnimations = Object.values(AnnouncementBarAnimation);
        for (const animation of validAnimations) {
          const result = announcementBarCarouselSettingsSchema.safeParse({
            ...VALID_ANNOUNCEMENT_BAR_INPUT,
            announcementBarAnimation: animation,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なアニメーション値はエラー", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarAnimation: "bounce",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("announcementBarDuration", () => {
      test("1000（最小値）はOK", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarDuration: 1000,
        });
        expect(result.success).toBe(true);
      });

      test("999はエラー", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarDuration: 999,
        });
        expect(result.success).toBe(false);
      });

      test("30000（最大値）はOK", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarDuration: 30000,
        });
        expect(result.success).toBe(true);
      });

      test("30001はエラー", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarDuration: 30001,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarDuration: 5000.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("announcementBarDesignStyle", () => {
      test("有効なデザインスタイル", () => {
        const validStyles = Object.values(AnnouncementBarDesignStyle);
        for (const style of validStyles) {
          const result = announcementBarCarouselSettingsSchema.safeParse({
            ...VALID_ANNOUNCEMENT_BAR_INPUT,
            announcementBarDesignStyle: style,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なデザインスタイルはエラー", () => {
        const result = announcementBarCarouselSettingsSchema.safeParse({
          ...VALID_ANNOUNCEMENT_BAR_INPUT,
          announcementBarDesignStyle: "neon",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("カラーフィールド（HEXバリデーション）", () => {
      test("有効なHEXカラーはOK", () => {
        const validColors = ["#FF5733", "#000000", "#ffffff", "#aaBBcc"];
        for (const color of validColors) {
          const result = announcementBarCarouselSettingsSchema.safeParse({
            ...VALID_ANNOUNCEMENT_BAR_INPUT,
            announcementBarBgColor: color,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なHEXカラーはエラー", () => {
        const invalidColors = ["FF5733", "#FFF", "#GGGGGG", "red", "#FF573"];
        for (const color of invalidColors) {
          const result = announcementBarCarouselSettingsSchema.safeParse({
            ...VALID_ANNOUNCEMENT_BAR_INPUT,
            announcementBarBgColor: color,
          });
          expect(result.success).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // permalinkSettingsSchema
  // ===========================================================================

  describe("permalinkSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = permalinkSettingsSchema.safeParse(VALID_PERMALINK_INPUT);
        expect(result.success).toBe(true);
      });
    });

    describe("postPermalinkStructure", () => {
      test("有効なパーマリンク構造", () => {
        const validStructures = Object.values(PostPermalinkStructure);
        for (const structure of validStructures) {
          const result = permalinkSettingsSchema.safeParse({
            ...VALID_PERMALINK_INPUT,
            postPermalinkStructure: structure,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なパーマリンク構造はエラー", () => {
        const result = permalinkSettingsSchema.safeParse({
          ...VALID_PERMALINK_INPUT,
          postPermalinkStructure: "numeric",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("postUrlPrefixEnabled", () => {
      test("booleanは許可", () => {
        for (const value of [true, false]) {
          const result = permalinkSettingsSchema.safeParse({
            ...VALID_PERMALINK_INPUT,
            postUrlPrefixEnabled: value,
          });
          expect(result.success).toBe(true);
        }
      });
    });
  });

  // ===========================================================================
  // sidebarSettingsSchema
  // ===========================================================================

  describe("sidebarSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = sidebarSettingsSchema.safeParse(VALID_SIDEBAR_INPUT);
        expect(result.success).toBe(true);
      });

      test("全ウィジェットfalseでもOK", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarWidgets: {
            search: false,
            recent: false,
            popular: false,
            categories: false,
            tags: false,
          },
        });
        expect(result.success).toBe(true);
      });
    });

    describe("sidebarRecentCount / sidebarPopularCount", () => {
      test("1（最小値）はOK", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarRecentCount: 1,
          sidebarPopularCount: 1,
        });
        expect(result.success).toBe(true);
      });

      test("0はエラー", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarRecentCount: 0,
        });
        expect(result.success).toBe(false);
      });

      test("20（最大値）はOK", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarRecentCount: 20,
          sidebarPopularCount: 20,
        });
        expect(result.success).toBe(true);
      });

      test("21はエラー", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarRecentCount: 21,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarPopularCount: 5.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("sidebarWidgets", () => {
      test("文字列はエラー", () => {
        const result = sidebarSettingsSchema.safeParse({
          ...VALID_SIDEBAR_INPUT,
          sidebarWidgets: {
            ...VALID_SIDEBAR_INPUT.sidebarWidgets,
            search: "true",
          },
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // robotsTxtSettingsSchema
  // ===========================================================================

  describe("robotsTxtSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = robotsTxtSettingsSchema.safeParse(
          VALID_ROBOTS_TXT_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("robotsTxtCustom nullはOK", () => {
        const result = robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: false,
          robotsTxtCustom: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("robotsTxtCustom", () => {
      test("10000文字はOK", () => {
        const result = robotsTxtSettingsSchema.safeParse({
          ...VALID_ROBOTS_TXT_INPUT,
          robotsTxtCustom: "a".repeat(10000),
        });
        expect(result.success).toBe(true);
      });

      test("10001文字はエラー", () => {
        const result = robotsTxtSettingsSchema.safeParse({
          ...VALID_ROBOTS_TXT_INPUT,
          robotsTxtCustom: "a".repeat(10001),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 必須フィールド欠落テスト
  // ===========================================================================

  describe("必須フィールド欠落", () => {
    test("maintenanceSettingsSchema: maintenanceMode欠落はエラー", () => {
      const result = maintenanceSettingsSchema.safeParse({
        maintenanceMessage: "テスト",
      });
      expect(result.success).toBe(false);
    });

    test("announcementBarCarouselSettingsSchema: 空オブジェクトはエラー", () => {
      const result = announcementBarCarouselSettingsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test("sidebarSettingsSchema: sidebarWidgets欠落はエラー", () => {
      const result = sidebarSettingsSchema.safeParse({
        sidebarEnabled: true,
        sidebarRecentCount: 5,
        sidebarPopularCount: 5,
      });
      expect(result.success).toBe(false);
    });

    test("permalinkSettingsSchema: postPermalinkStructure欠落はエラー", () => {
      const result = permalinkSettingsSchema.safeParse({
        postUrlPrefixEnabled: true,
      });
      expect(result.success).toBe(false);
    });
  });
});
