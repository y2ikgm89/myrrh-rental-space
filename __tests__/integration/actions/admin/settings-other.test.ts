/**
 * その他の設定 Server Action統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts のテスト
 *
 * 対象スキーマ:
 * - maintenanceSettingsSchema（メンテナンス設定）
 * - cookieConsentSettingsSchema（Cookie同意設定）
 * - reservationSettingsSchema（予約設定）
 * - announcementBarCarouselSettingsSchema（お知らせバーカルーセル設定）
 * - sidebarSettingsSchema（サイドバー設定）
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@generated/prisma/enums";
import {
  DEFAULT_SIDEBAR_WIDGETS,
  sidebarSettingsSchema,
} from "@/shared/lib/validations/sidebar";

// =============================================================================
// スキーマ再現（schemas.ts から）
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

const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationDeadlineHours: z.number().int().min(1).max(720),
  modificationDeadlineHours: z.number().int().min(1).max(720),
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
  cookieConsentPolicyUrl: "/terms/privacy-policy",
};

const VALID_RESERVATION_INPUT = {
  defaultTimeSlot: 60,
  minReservationDuration: 30,
  maxReservationDuration: 480,
  cancellationDeadlineHours: 24,
  modificationDeadlineHours: 24,
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

const VALID_SIDEBAR_INPUT = {
  sidebarEnabled: true,
  sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
  sidebarRecentCount: 5,
  sidebarPopularCount: 5,
  sidebarTocEnabled: true,
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

      test("予約時間フィールドは null 不可", () => {
        const result = reservationSettingsSchema.safeParse({
          defaultTimeSlot: null,
          minReservationDuration: null,
          maxReservationDuration: null,
          cancellationDeadlineHours: null,
          modificationDeadlineHours: null,
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

    describe("cancellationDeadlineHours", () => {
      test("1（最小値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          cancellationDeadlineHours: 1,
        });
        expect(result.success).toBe(true);
      });

      test("0はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          cancellationDeadlineHours: 0,
        });
        expect(result.success).toBe(false);
      });

      test("720（最大値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          cancellationDeadlineHours: 720,
        });
        expect(result.success).toBe(true);
      });

      test("721はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          cancellationDeadlineHours: 721,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("modificationDeadlineHours", () => {
      test("1（最小値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          modificationDeadlineHours: 1,
        });
        expect(result.success).toBe(true);
      });

      test("720（最大値）はOK", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          modificationDeadlineHours: 720,
        });
        expect(result.success).toBe(true);
      });

      test("721はエラー", () => {
        const result = reservationSettingsSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          modificationDeadlineHours: 721,
        });
        expect(result.success).toBe(false);
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
          sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS.map((widget) => ({
            ...widget,
            enabled: false,
          })),
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
          sidebarWidgets: [
            { type: "search", enabled: "true" },
            ...DEFAULT_SIDEBAR_WIDGETS.slice(1),
          ],
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
  });
});
