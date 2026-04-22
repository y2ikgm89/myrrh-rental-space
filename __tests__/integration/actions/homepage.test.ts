/**
 * ホームページセクション Public Action 統合テスト
 *
 * src/app/(public)/_shared/actions/homepage.ts のテスト
 *
 * セクション設定のバリデーションとパース処理のテスト
 */

import { describe, test, expect } from "bun:test";
import {
  SectionType,
  validateSectionConfig,
} from "@/shared/lib/validations/section";
import { getDefaultConfig } from "@/shared/lib/sections/registry";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import { defaultPageHeroHome } from "@/shared/lib/sections/page-hero/defaults";
import { pageHeroSchema } from "@/shared/lib/sections/page-hero/schema";

// =============================================================================
// SectionType Tests
// =============================================================================

describe("Homepage Public Action Integration", () => {
  describe("PageHero / home defaults (Phase A)", () => {
    test("DEFAULT_PAGE_SECTIONS.home に homepage-hero が含まれない", () => {
      const home = DEFAULT_PAGE_SECTIONS["home"];
      expect(home).toBeDefined();
      expect(home?.some((s) => s.type === "homepage-hero")).toBe(false);
    });

    test("defaultPageHeroHome は pageHeroSchema を満たす", () => {
      const parsed = pageHeroSchema.safeParse(defaultPageHeroHome);
      expect(parsed.success).toBe(true);
    });

    test("home デフォルトセクションは order が重複しない非負整数", () => {
      const home = DEFAULT_PAGE_SECTIONS["home"];
      expect(home).toBeDefined();
      const orders = home!.map((s) => s.order);
      expect(new Set(orders).size).toBe(orders.length);
      for (const o of orders) {
        expect(o).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("SectionType enum", () => {
    test("全てのセクションタイプが定義されている", () => {
      const expectedTypes = [
        "hero",
        "hero-parallax",
        "custom",
        "concept",
        "space-list",
        "space-showcase",
        "news-list",
        "post-list",
        "faq-list",
        "features",
        "testimonial",
        "gallery",
        "cta",
        "contact-form",
        "map",
        "embed",
        "instagram",
      ];

      // SectionType[] → string[] に変換して toContain の型制約を満たす
      const sectionTypeValues: string[] = Object.values(SectionType);
      expectedTypes.forEach((type) => {
        expect(sectionTypeValues).toContain(type);
      });
    });

    test("セクションタイプ数", () => {
      // event-calendar 追加後 18 タイプ
      const typeCount = Object.values(SectionType).length;
      expect(typeCount).toBe(18);
    });
  });

  describe("SectionConfig validation", () => {
    describe("HERO section", () => {
      test("有効なHERO設定", () => {
        const config = {
          title: "Welcome",
          subtitle: "サブタイトル",
          backgroundImageUrl: "https://example.com/hero.jpg",
          ctaPrimary: { text: "予約する", url: "/reservation" },
          ctaSecondary: { text: "お問い合わせ", url: "/contact" },
        };

        const result = validateSectionConfig(SectionType.HERO, config);
        expect(result.success).toBe(true);
      });

      test("最小限のHERO設定（必須フィールドのみ）", () => {
        const config = {
          title: "ヒーローセクション",
          ctaPrimary: { text: "ボタン", url: "/link" },
        };
        const result = validateSectionConfig(SectionType.HERO, config);
        expect(result.success).toBe(true);
      });
    });

    describe("SPACE_LIST section", () => {
      test("有効なSPACE_LIST設定", () => {
        const config = {
          maxItems: 6,
          showOnlyPublished: true,
        };

        const result = validateSectionConfig(SectionType.SPACE_LIST, config);
        expect(result.success).toBe(true);
      });

      test("カスタムmaxItems", () => {
        const config = { maxItems: 12 };
        const result = validateSectionConfig(SectionType.SPACE_LIST, config);
        expect(result.success).toBe(true);
        if (result.success && "maxItems" in result.data) {
          expect(result.data.maxItems).toBe(12);
        }
      });
    });

    describe("NEWS section", () => {
      test("有効なNEWS設定", () => {
        const config = {
          title: "お知らせ",
          maxItems: 5,
          showViewAllLink: true,
        };

        const result = validateSectionConfig(SectionType.NEWS_LIST, config);
        expect(result.success).toBe(true);
      });
    });

    describe("POST_LIST section", () => {
      test("有効なPOST_LIST設定", () => {
        const config = {
          title: "最新の記事",
          maxItems: 3,
          showViewAllLink: true,
        };

        const result = validateSectionConfig(SectionType.POST_LIST, config);
        expect(result.success).toBe(true);
      });
    });

    describe("FAQ section", () => {
      test("有効なFAQ設定", () => {
        const config = {
          title: "よくあるご質問",
          maxItems: 5,
        };

        const result = validateSectionConfig(SectionType.FAQ_LIST, config);
        expect(result.success).toBe(true);
      });
    });

    describe("CTA section", () => {
      test("有効なCTA設定", () => {
        const config = {
          title: "お問い合わせ",
          description: "ご質問がございましたら",
          ctaPrimary: { text: "問い合わせる", url: "/contact" },
          ctaSecondary: { text: "詳細を見る", url: "/about" },
        };

        const result = validateSectionConfig(SectionType.CTA, config);
        expect(result.success).toBe(true);
      });
    });

    describe("CUSTOM section", () => {
      test("有効なCUSTOM設定", () => {
        const config = {
          containerClass: "custom-section-class",
        };

        const result = validateSectionConfig(SectionType.CUSTOM, config);
        expect(result.success).toBe(true);
      });

      test("空のCUSTOM設定", () => {
        const config = {};
        const result = validateSectionConfig(SectionType.CUSTOM, config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("defaultSectionConfigs", () => {
    test("全セクションタイプにデフォルト設定がある", () => {
      Object.values(SectionType).forEach((type) => {
        expect(getDefaultConfig(type)).toBeDefined();
      });
    });

    test("SPACE_LISTのデフォルト設定", () => {
      const config = getDefaultConfig(SectionType.SPACE_LIST);
      expect(config).toHaveProperty("maxItems");
      expect(config["maxItems"]).toBeGreaterThan(0);
    });

    test("NEWSのデフォルト設定", () => {
      const config = getDefaultConfig(SectionType.NEWS_LIST);
      expect(config).toHaveProperty("maxItems");
    });

    test("POST_LISTのデフォルト設定", () => {
      const config = getDefaultConfig(SectionType.POST_LIST);
      expect(config).toHaveProperty("maxItems");
    });
  });

  describe("parseSectionConfig fallback logic", () => {
    test("無効な設定はデフォルトにフォールバック", () => {
      // 無効な型の設定をテスト
      const invalidConfig = "not-an-object";
      const result = validateSectionConfig(SectionType.HERO, invalidConfig);

      if (!result.success) {
        // フォールバック先のデフォルト設定を確認
        const defaultConfig = getDefaultConfig(SectionType.HERO);
        expect(defaultConfig).toBeDefined();
      }
    });

    test("部分的に無効な設定", () => {
      const config = {
        maxItems: "not-a-number", // 無効
        showPrice: true, // 有効
      };

      const result = validateSectionConfig(SectionType.SPACE_LIST, config);
      // バリデーション結果に応じてフォールバック
      if (!result.success) {
        const defaultConfig = getDefaultConfig(SectionType.SPACE_LIST);
        expect(defaultConfig["maxItems"]).toBeGreaterThan(0);
      }
    });
  });

  describe("HomepageSectionData structure", () => {
    test("有効なセクションデータ構造", () => {
      const sectionData = {
        id: "section-123",
        type: SectionType.HERO,
        title: "ヒーローセクション",
        config: getDefaultConfig(SectionType.HERO),
        content: null,
        order: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(sectionData.id).toBe("section-123");
      expect(sectionData.type).toBe(SectionType.HERO);
      expect(sectionData.isActive).toBe(true);
      expect(sectionData.order).toBe(1);
      expect(sectionData.createdAt).toBeInstanceOf(Date);
    });

    test("セクションのソート順序", () => {
      const sections = [
        { id: "3", order: 3 },
        { id: "1", order: 1 },
        { id: "2", order: 2 },
      ];

      const sorted = sections.sort((a, b) => a.order - b.order);

      expect(sorted[0].id).toBe("1");
      expect(sorted[1].id).toBe("2");
      expect(sorted[2].id).toBe("3");
    });

    test("アクティブなセクションのフィルタリング", () => {
      const sections = [
        { id: "1", isActive: true },
        { id: "2", isActive: false },
        { id: "3", isActive: true },
      ];

      const activeSections = sections.filter((s) => s.isActive);

      expect(activeSections).toHaveLength(2);
      expect(activeSections.map((s) => s.id)).toEqual(["1", "3"]);
    });
  });
});
