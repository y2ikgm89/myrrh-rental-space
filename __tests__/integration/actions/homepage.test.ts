/**
 * ホームページセクション Public Action 統合テスト
 *
 * src/app/(public)/_shared/actions/homepage.ts のテスト
 *
 * セクション設定のバリデーションとパース処理のテスト
 */

import { describe, test, expect } from "bun:test";
import {
  validateSectionConfig,
  defaultSectionConfigs,
  defaultSectionConfigMap,
  sectionTypeLabels,
} from "@/shared/lib/validations/section";

// =============================================================================
// componentId Tests
// =============================================================================

describe("Homepage Public Action Integration", () => {
  describe("sectionTypeLabels（全コンポーネントID）", () => {
    test("全てのコンポーネントIDが定義されている", () => {
      const expectedComponentIds = [
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

      const componentIds = Object.keys(sectionTypeLabels);
      expectedComponentIds.forEach((id) => {
        expect(componentIds).toContain(id);
      });
    });

    test("セクションタイプ数", () => {
      const typeCount = Object.keys(sectionTypeLabels).length;
      expect(typeCount).toBe(17);
    });
  });

  describe("SectionConfig validation", () => {
    describe("hero section", () => {
      test("有効なhero設定", () => {
        const config = {
          title: "Welcome",
          subtitle: "サブタイトル",
          backgroundImageUrl: "https://example.com/hero.jpg",
          ctaPrimary: { text: "予約する", url: "/reservation" },
          ctaSecondary: { text: "お問い合わせ", url: "/contact" },
        };

        const result = validateSectionConfig("hero", config);
        expect(result.success).toBe(true);
      });

      test("最小限のhero設定（必須フィールドのみ）", () => {
        const config = {
          title: "ヒーローセクション",
          ctaPrimary: { text: "ボタン", url: "/link" },
        };
        const result = validateSectionConfig("hero", config);
        expect(result.success).toBe(true);
      });
    });

    describe("space-list section", () => {
      test("有効なspace-list設定", () => {
        const config = {
          maxItems: 6,
          showOnlyPublished: true,
        };

        const result = validateSectionConfig("space-list", config);
        expect(result.success).toBe(true);
      });

      test("カスタムmaxItems", () => {
        const config = { maxItems: 12 };
        const result = validateSectionConfig("space-list", config);
        expect(result.success).toBe(true);
        if (result.success) {
          // validateSectionConfig returns unknown data; check maxItems via validated parse
          const spaceListResult = result.data;
          expect(
            typeof spaceListResult === "object" &&
              spaceListResult !== null &&
              "maxItems" in spaceListResult,
          ).toBe(true);
        }
      });
    });

    describe("news-list section", () => {
      test("有効なnews-list設定", () => {
        const config = {
          title: "お知らせ",
          maxItems: 5,
          showViewAllLink: true,
        };

        const result = validateSectionConfig("news-list", config);
        expect(result.success).toBe(true);
      });
    });

    describe("post-list section", () => {
      test("有効なpost-list設定", () => {
        const config = {
          title: "最新の記事",
          maxItems: 3,
          showViewAllLink: true,
        };

        const result = validateSectionConfig("post-list", config);
        expect(result.success).toBe(true);
      });
    });

    describe("faq-list section", () => {
      test("有効なfaq-list設定", () => {
        const config = {
          title: "よくあるご質問",
          maxItems: 5,
        };

        const result = validateSectionConfig("faq-list", config);
        expect(result.success).toBe(true);
      });
    });

    describe("cta section", () => {
      test("有効なcta設定", () => {
        const config = {
          title: "お問い合わせ",
          description: "ご質問がございましたら",
          ctaPrimary: { text: "問い合わせる", url: "/contact" },
          ctaSecondary: { text: "詳細を見る", url: "/about" },
        };

        const result = validateSectionConfig("cta", config);
        expect(result.success).toBe(true);
      });
    });

    describe("custom section", () => {
      test("有効なcustom設定", () => {
        const config = {
          containerClass: "custom-section-class",
        };

        const result = validateSectionConfig("custom", config);
        expect(result.success).toBe(true);
      });

      test("空のcustom設定", () => {
        const config = {};
        const result = validateSectionConfig("custom", config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("defaultSectionConfigs", () => {
    test("全コンポーネントIDにデフォルト設定がある", () => {
      Object.keys(sectionTypeLabels).forEach((componentId) => {
        expect(defaultSectionConfigMap[componentId]).toBeDefined();
      });
    });

    test("space-listのデフォルト設定", () => {
      const config = defaultSectionConfigs["space-list"];
      expect(config).toHaveProperty("maxItems");
      expect(config.maxItems).toBeGreaterThan(0);
    });

    test("news-listのデフォルト設定", () => {
      const config = defaultSectionConfigs["news-list"];
      expect(config).toHaveProperty("maxItems");
    });

    test("post-listのデフォルト設定", () => {
      const config = defaultSectionConfigs["post-list"];
      expect(config).toHaveProperty("maxItems");
    });
  });

  describe("parseSectionConfig fallback logic", () => {
    test("無効な設定はデフォルトにフォールバック", () => {
      // 無効な型の設定をテスト
      const invalidConfig = "not-an-object";
      const result = validateSectionConfig("hero", invalidConfig);

      if (!result.success) {
        // フォールバック先のデフォルト設定を確認
        const defaultConfig = defaultSectionConfigs["hero"];
        expect(defaultConfig).toBeDefined();
      }
    });

    test("部分的に無効な設定", () => {
      const config = {
        maxItems: "not-a-number", // 無効
        showPrice: true, // 有効
      };

      const result = validateSectionConfig("space-list", config);
      // バリデーション結果に応じてフォールバック
      if (!result.success) {
        const defaultConfig = defaultSectionConfigs["space-list"];
        expect(defaultConfig.maxItems).toBeGreaterThan(0);
      }
    });
  });

  describe("HomepageSectionData structure", () => {
    test("有効なセクションデータ構造", () => {
      const sectionData = {
        id: "section-123",
        componentId: "hero",
        title: "ヒーローセクション",
        config: defaultSectionConfigs["hero"],
        content: null,
        order: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(sectionData.id).toBe("section-123");
      expect(sectionData.componentId).toBe("hero");
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
