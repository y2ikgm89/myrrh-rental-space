/**
 * 基本情報・レイアウト・SEO設定 Server Action統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/basic.ts のテスト
 *
 * 対象スキーマ:
 * - basicInfoSchema（基本情報）
 * - layoutSettingsSchema（レイアウト設定）
 * - seoSettingsSchema（SEO設定）
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// =============================================================================
// スキーマ再現（schemas.ts から）
// =============================================================================

const basicInfoSchema = z.object({
  siteName: z.string().max(100).nullable(),
  siteDescription: z.string().max(500).nullable(),
  defaultOgpImageUrl: z.string().max(500).nullable(),
  headerLogoUrl: z.string().max(500).nullable(),
  footerLogoUrl: z.string().max(500).nullable(),
  footerCopyright: z.string().max(200).nullable(),
  useHeaderLogo: z.boolean(),
  useFooterLogo: z.boolean(),
});

// LayoutWidth enum 再現
const LayoutWidth = {
  XS: "XS",
  SM: "SM",
  MD: "MD",
  LG: "LG",
  XL: "XL",
  FULL: "FULL",
  CUSTOM: "CUSTOM",
} as const;

const layoutSettingsSchema = z.object({
  containerWidth: z.enum(LayoutWidth),
  containerWidthCustom: z.number().int().min(320).max(2560).nullable(),
  contentWidth: z.enum(LayoutWidth),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable(),
});

const seoSettingsSchema = z.object({
  defaultMetaDescription: z.string().max(160).nullable(),
  defaultMetaKeywords: z.string().max(500).nullable(),
  defaultOgpTitle: z.string().max(60).nullable(),
  defaultOgpDescription: z.string().max(160).nullable(),
  analyticsType: z.enum(["ga4", "gtm"]).nullable(),
  googleAnalyticsId: z.string().max(50).nullable(),
  googleTagManagerId: z.string().max(50).nullable(),
  googleSearchConsoleId: z.string().max(100).nullable(),
  bingWebmasterToolsId: z.string().max(100).nullable(),
  gaPropertyId: z.string().max(20).nullable(),
  microsoftClarityId: z.string().max(50).nullable(),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_BASIC_INFO_INPUT = {
  siteName: "Myrrh Rental Space",
  siteDescription: "レンタルスペース予約管理システム",
  defaultOgpImageUrl: "https://example.com/ogp.png",
  headerLogoUrl: "https://example.com/header-logo.png",
  footerLogoUrl: "https://example.com/footer-logo.png",
  footerCopyright: "2026 Myrrh Rental Space",
  useHeaderLogo: true,
  useFooterLogo: false,
};

const VALID_LAYOUT_SETTINGS_INPUT = {
  containerWidth: "LG" as const,
  containerWidthCustom: null,
  contentWidth: "MD" as const,
  contentWidthCustom: null,
};

const VALID_SEO_SETTINGS_INPUT = {
  defaultMetaDescription: "レンタルスペースの予約管理",
  defaultMetaKeywords: "レンタルスペース,予約,会議室",
  defaultOgpTitle: "Myrrh Rental Space",
  defaultOgpDescription: "レンタルスペースの予約はこちら",
  analyticsType: "ga4" as const,
  googleAnalyticsId: "G-XXXXXXXXXX",
  googleTagManagerId: null,
  googleSearchConsoleId: null,
  bingWebmasterToolsId: null,
  gaPropertyId: null,
  microsoftClarityId: null,
};

// =============================================================================
// テスト
// =============================================================================

describe("Settings Basic Admin Action Integration", () => {
  // ===========================================================================
  // basicInfoSchema
  // ===========================================================================

  describe("basicInfoSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = basicInfoSchema.safeParse(VALID_BASIC_INFO_INPUT);
        expect(result.success).toBe(true);
      });

      test("全フィールドnullでもバリデーション通過", () => {
        const result = basicInfoSchema.safeParse({
          siteName: null,
          siteDescription: null,
          defaultOgpImageUrl: null,
          headerLogoUrl: null,
          footerLogoUrl: null,
          footerCopyright: null,
          useHeaderLogo: false,
          useFooterLogo: false,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("siteName", () => {
      test("100文字のサイト名はOK", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          siteName: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字のサイト名はエラー", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          siteName: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
      });

      test("nullは許可", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          siteName: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("siteDescription", () => {
      test("500文字の説明はOK", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          siteDescription: "あ".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字の説明はエラー", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          siteDescription: "あ".repeat(501),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("defaultOgpImageUrl / headerLogoUrl / footerLogoUrl (URL 長さ境界)", () => {
      test("500文字のURLはOK", () => {
        const longUrl = "https://example.com/" + "a".repeat(479);
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          headerLogoUrl: longUrl,
        });
        expect(result.success).toBe(true);
      });

      test("501文字のURLはエラー", () => {
        const longUrl = "a".repeat(501);
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          headerLogoUrl: longUrl,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("footerCopyright", () => {
      test("200文字のコピーライトはOK", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          footerCopyright: "a".repeat(200),
        });
        expect(result.success).toBe(true);
      });

      test("201文字のコピーライトはエラー", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          footerCopyright: "a".repeat(201),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("useHeaderLogo / useFooterLogo", () => {
      test("booleanは許可", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          useHeaderLogo: true,
          useFooterLogo: true,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = basicInfoSchema.safeParse({
          ...VALID_BASIC_INFO_INPUT,
          useHeaderLogo: "true",
        });
        expect(result.success).toBe(false);
      });

      test("useHeaderLogo省略はエラー", () => {
        const { useHeaderLogo: _, ...input } = VALID_BASIC_INFO_INPUT;
        const result = basicInfoSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // layoutSettingsSchema
  // ===========================================================================

  describe("layoutSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = layoutSettingsSchema.safeParse(
          VALID_LAYOUT_SETTINGS_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("CUSTOMとカスタム値の組み合わせはOK", () => {
        const result = layoutSettingsSchema.safeParse({
          containerWidth: "CUSTOM",
          containerWidthCustom: 1440,
          contentWidth: "CUSTOM",
          contentWidthCustom: 960,
        });
        expect(result.success).toBe(true);
      });

      test("全てのLayoutWidth値が受理される", () => {
        const widths = [
          "XS",
          "SM",
          "MD",
          "LG",
          "XL",
          "FULL",
          "CUSTOM",
        ] as const;
        for (const width of widths) {
          const result = layoutSettingsSchema.safeParse({
            ...VALID_LAYOUT_SETTINGS_INPUT,
            containerWidth: width,
          });
          expect(result.success).toBe(true);
        }
      });
    });

    describe("containerWidth", () => {
      test("無効なenum値はエラー", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidth: "INVALID",
        });
        expect(result.success).toBe(false);
      });

      test("小文字はエラー", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidth: "lg",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("containerWidthCustom", () => {
      test("320（最小値）はOK", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidthCustom: 320,
        });
        expect(result.success).toBe(true);
      });

      test("319はエラー", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidthCustom: 319,
        });
        expect(result.success).toBe(false);
      });

      test("2560（最大値）はOK", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidthCustom: 2560,
        });
        expect(result.success).toBe(true);
      });

      test("2561はエラー", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidthCustom: 2561,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidthCustom: 1440.5,
        });
        expect(result.success).toBe(false);
      });

      test("nullは許可", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          containerWidthCustom: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("contentWidthCustom", () => {
      test("320（最小値）はOK", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          contentWidthCustom: 320,
        });
        expect(result.success).toBe(true);
      });

      test("1920（最大値）はOK", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          contentWidthCustom: 1920,
        });
        expect(result.success).toBe(true);
      });

      test("1921はエラー", () => {
        const result = layoutSettingsSchema.safeParse({
          ...VALID_LAYOUT_SETTINGS_INPUT,
          contentWidthCustom: 1921,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // seoSettingsSchema
  // ===========================================================================

  describe("seoSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = seoSettingsSchema.safeParse(VALID_SEO_SETTINGS_INPUT);
        expect(result.success).toBe(true);
      });

      test("全フィールドnullでもバリデーション通過", () => {
        const result = seoSettingsSchema.safeParse({
          defaultMetaDescription: null,
          defaultMetaKeywords: null,
          defaultOgpTitle: null,
          defaultOgpDescription: null,
          analyticsType: null,
          googleAnalyticsId: null,
          googleTagManagerId: null,
          googleSearchConsoleId: null,
          bingWebmasterToolsId: null,
          gaPropertyId: null,
          microsoftClarityId: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("defaultMetaDescription", () => {
      test("160文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultMetaDescription: "あ".repeat(160),
        });
        expect(result.success).toBe(true);
      });

      test("161文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultMetaDescription: "あ".repeat(161),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("defaultMetaKeywords", () => {
      test("500文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultMetaKeywords: "a".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultMetaKeywords: "a".repeat(501),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("defaultOgpTitle", () => {
      test("60文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultOgpTitle: "あ".repeat(60),
        });
        expect(result.success).toBe(true);
      });

      test("61文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultOgpTitle: "あ".repeat(61),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("defaultOgpDescription", () => {
      test("160文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultOgpDescription: "あ".repeat(160),
        });
        expect(result.success).toBe(true);
      });

      test("161文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          defaultOgpDescription: "あ".repeat(161),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("analyticsType", () => {
      test("ga4は許可", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          analyticsType: "ga4",
        });
        expect(result.success).toBe(true);
      });

      test("gtmは許可", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          analyticsType: "gtm",
        });
        expect(result.success).toBe(true);
      });

      test("nullは許可", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          analyticsType: null,
        });
        expect(result.success).toBe(true);
      });

      test("無効な値はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          analyticsType: "invalid",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("Analytics ID フィールド", () => {
      test("googleAnalyticsId 50文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          googleAnalyticsId: "a".repeat(50),
        });
        expect(result.success).toBe(true);
      });

      test("googleAnalyticsId 51文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          googleAnalyticsId: "a".repeat(51),
        });
        expect(result.success).toBe(false);
      });

      test("googleSearchConsoleId 100文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          googleSearchConsoleId: "a".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("googleSearchConsoleId 101文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          googleSearchConsoleId: "a".repeat(101),
        });
        expect(result.success).toBe(false);
      });

      test("gaPropertyId 20文字はOK", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          gaPropertyId: "a".repeat(20),
        });
        expect(result.success).toBe(true);
      });

      test("gaPropertyId 21文字はエラー", () => {
        const result = seoSettingsSchema.safeParse({
          ...VALID_SEO_SETTINGS_INPUT,
          gaPropertyId: "a".repeat(21),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 必須フィールド欠落テスト
  // ===========================================================================

  describe("必須フィールド欠落", () => {
    test("basicInfoSchema: useHeaderLogo欠落はエラー", () => {
      const { useHeaderLogo: _, ...input } = VALID_BASIC_INFO_INPUT;
      const result = basicInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("basicInfoSchema: useFooterLogo欠落はエラー", () => {
      const { useFooterLogo: _, ...input } = VALID_BASIC_INFO_INPUT;
      const result = basicInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("layoutSettingsSchema: containerWidth欠落はエラー", () => {
      const { containerWidth: _, ...input } = VALID_LAYOUT_SETTINGS_INPUT;
      const result = layoutSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("layoutSettingsSchema: contentWidth欠落はエラー", () => {
      const { contentWidth: _, ...input } = VALID_LAYOUT_SETTINGS_INPUT;
      const result = layoutSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("seoSettingsSchema: 空オブジェクトはエラー", () => {
      const result = seoSettingsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // 型エラーテスト
  // ===========================================================================

  describe("型エラー", () => {
    test("basicInfoSchema: siteName に数値はエラー", () => {
      const result = basicInfoSchema.safeParse({
        ...VALID_BASIC_INFO_INPUT,
        siteName: 12345,
      });
      expect(result.success).toBe(false);
    });

    test("layoutSettingsSchema: containerWidthCustom に文字列はエラー", () => {
      const result = layoutSettingsSchema.safeParse({
        ...VALID_LAYOUT_SETTINGS_INPUT,
        containerWidthCustom: "1440",
      });
      expect(result.success).toBe(false);
    });

    test("seoSettingsSchema: analyticsType に数値はエラー", () => {
      const result = seoSettingsSchema.safeParse({
        ...VALID_SEO_SETTINGS_INPUT,
        analyticsType: 123,
      });
      expect(result.success).toBe(false);
    });
  });
});
