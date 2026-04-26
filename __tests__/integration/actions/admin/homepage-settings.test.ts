/**
 * セクションスキーマ・バリデーション統合テスト
 *
 * @/shared/lib/validations/section のスキーマと validateSectionConfig のテスト
 */

import { describe, test, expect } from "bun:test";
import {
  SectionType,
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  validateSectionConfig,
} from "@/shared/lib/validations/section";
import { getDefaultConfig } from "@/shared/lib/sections/registry";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const VALID_CREATE_INPUT = {
  type: SectionType.HERO,
  isActive: true,
};

describe("Homepage Settings Admin Action Integration", () => {
  describe("createSectionSchema バリデーション", () => {
    describe("正常系", () => {
      test("HERO タイプの最小入力でパス", () => {
        const result = createSectionSchema.safeParse(VALID_CREATE_INPUT);
        expect(result.success).toBe(true);
      });

      test("全 SectionType での作成が可能", () => {
        for (const type of Object.values(SectionType)) {
          const result = createSectionSchema.safeParse({
            type,
            isActive: true,
          });
          expect(result.success).toBe(true);
        }
      });

      test("pageId はオプション（ホームページ = null）", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          pageId: undefined,
        });
        expect(result.success).toBe(true);
      });

      test("pageId に有効な UUID を指定できる", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          pageId: VALID_UUID,
        });
        expect(result.success).toBe(true);
      });

      test("title はオプション", () => {
        const withTitle = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          title: "テスト",
        });
        const withoutTitle = createSectionSchema.safeParse(VALID_CREATE_INPUT);
        expect(withTitle.success).toBe(true);
        expect(withoutTitle.success).toBe(true);
      });

      test("config のデフォルトは空オブジェクト", () => {
        const result = createSectionSchema.safeParse(VALID_CREATE_INPUT);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.config).toEqual({});
        }
      });

      test("isActive のデフォルトは true", () => {
        const result = createSectionSchema.safeParse({
          type: SectionType.HERO,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isActive).toBe(true);
        }
      });

      test("order はオプション", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          order: undefined,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("type バリデーション", () => {
      test("無効なセクションタイプはエラー", () => {
        const result = createSectionSchema.safeParse({
          type: "INVALID_TYPE",
          isActive: true,
        });
        expect(result.success).toBe(false);
      });

      test("type が欠落するとエラー", () => {
        const result = createSectionSchema.safeParse({ isActive: true });
        expect(result.success).toBe(false);
      });
    });

    describe("pageId バリデーション", () => {
      test("無効な UUID はエラー", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          pageId: "not-a-uuid",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("title バリデーション", () => {
      test("100 文字のタイトルはOK", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          title: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101 文字のタイトルはエラー", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          title: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("100文字以内");
        }
      });
    });

    describe("contentJson バリデーション", () => {
      test("500,000 文字のコンテンツはOK", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          contentJson: "a".repeat(500000),
        });
        expect(result.success).toBe(true);
      });

      test("500,001 文字のコンテンツはエラー", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          contentJson: "a".repeat(500001),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("500,000文字以内");
        }
      });
    });

    describe("order バリデーション", () => {
      test("0 以上の整数は許可", () => {
        for (const order of [0, 1, 10, 100]) {
          const result = createSectionSchema.safeParse({
            ...VALID_CREATE_INPUT,
            order,
          });
          expect(result.success).toBe(true);
        }
      });

      test("負の数はエラー", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          order: -1,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          order: 1.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("isActive バリデーション", () => {
      test("false は許可", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          isActive: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          isActive: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("updateSectionSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効な更新データでパス", () => {
        const result = updateSectionSchema.safeParse({
          title: "更新タイトル",
          isActive: false,
        });
        expect(result.success).toBe(true);
      });

      test("全フィールドオプション（空オブジェクトでも通過）", () => {
        const result = updateSectionSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      test("title のみの更新は許可", () => {
        const result = updateSectionSchema.safeParse({
          title: "新しいタイトル",
        });
        expect(result.success).toBe(true);
      });

      test("isActive のみの更新は許可", () => {
        const result = updateSectionSchema.safeParse({ isActive: false });
        expect(result.success).toBe(true);
      });
    });

    describe("title バリデーション", () => {
      test("100 文字のタイトルはOK", () => {
        const result = updateSectionSchema.safeParse({
          title: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101 文字のタイトルはエラー", () => {
        const result = updateSectionSchema.safeParse({
          title: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("100文字以内");
        }
      });
    });

    describe("contentJson バリデーション", () => {
      test("500,001 文字のコンテンツはエラー", () => {
        const result = updateSectionSchema.safeParse({
          contentJson: "a".repeat(500001),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("500,000文字以内");
        }
      });
    });
  });

  describe("updateSectionOrderSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効な順序更新でパス", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [
            { id: VALID_UUID, order: 0 },
            { id: VALID_UUID_2, order: 1 },
          ],
        });
        expect(result.success).toBe(true);
      });

      test("空配列は許可", () => {
        const result = updateSectionOrderSchema.safeParse({ sections: [] });
        expect(result.success).toBe(true);
      });

      test("単一セクションの順序更新", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID, order: 5 }],
        });
        expect(result.success).toBe(true);
      });
    });

    describe("sections バリデーション", () => {
      test("sections フィールドが欠落するとエラー", () => {
        const result = updateSectionOrderSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      test("id が欠落するとエラー", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ order: 0 }],
        });
        expect(result.success).toBe(false);
      });

      test("order が欠落するとエラー", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID }],
        });
        expect(result.success).toBe(false);
      });

      test("id に無効な UUID はエラー", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: "not-uuid", order: 0 }],
        });
        expect(result.success).toBe(false);
      });

      test("負の order はエラー", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID, order: -1 }],
        });
        expect(result.success).toBe(false);
      });

      test("小数の order はエラー", () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID, order: 1.5 }],
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("validateSectionConfig フォールバックロジック", () => {
    test("有効な HERO 設定は成功", () => {
      const config = {
        height: "md",
        overlay: true,
        overlayOpacity: 40,
        variant: "default",
        parallaxSpeed: 0.5,
      };
      const result = validateSectionConfig(SectionType.HERO, config);
      expect(result.success).toBe(true);
    });

    test("有効な CUSTOM 設定は成功", () => {
      const config = {
        sectionLabel: "Contents",
        maxWidth: "lg",
        padding: "md",
      };
      const result = validateSectionConfig(SectionType.CUSTOM, config);
      expect(result.success).toBe(true);
    });

    test("有効な NEWS_LIST 設定は成功", () => {
      const config = {
        sectionLabel: "News",
        title: "お知らせ",
        maxItems: 5,
        showViewAllLink: true,
        viewAllText: "全てのお知らせ",
        viewAllUrl: "/news",
        layout: "list",
        columns: 2,
      };
      const result = validateSectionConfig(SectionType.NEWS_LIST, config);
      expect(result.success).toBe(true);
    });

    test("無効な設定は失敗", () => {
      const result = validateSectionConfig(SectionType.CUSTOM, "not-an-object");
      expect(result.success).toBe(false);
    });

    test("全 SectionType に対して validatesectionConfig が実行できる", () => {
      for (const type of Object.values(SectionType)) {
        const defaultConfig = getDefaultConfig(type);
        const result = validateSectionConfig(type, defaultConfig);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("defaultSectionConfigs", () => {
    test("全 SectionType にデフォルト設定が存在する", () => {
      for (const type of Object.values(SectionType)) {
        expect(getDefaultConfig(type)).toBeDefined();
      }
    });

    test("HERO のデフォルト設定に必須フィールドが含まれる", () => {
      const config = getDefaultConfig(SectionType.HERO);
      expect(config["height"]).toBeDefined();
      expect(typeof config["overlay"]).toBe("boolean");
      expect(typeof config["overlayOpacity"]).toBe("number");
    });

    test("SPACE_LIST のデフォルト設定に必須フィールドが含まれる", () => {
      const config = getDefaultConfig(SectionType.SPACE_LIST);
      expect(config["maxItems"]).toBeGreaterThan(0);
      expect(config["columns"]).toBeGreaterThan(0);
      expect(typeof config["showOnlyPublished"]).toBe("boolean");
    });

    test("FAQ_LIST のデフォルト設定に必須フィールドが含まれる", () => {
      const config = getDefaultConfig(SectionType.FAQ_LIST);
      expect(config["maxItems"]).toBeGreaterThan(0);
      expect(config["variant"]).toBeDefined();
      expect(config["containerWidth"]).toBeDefined();
    });

    test("GALLERY のデフォルト設定に必須フィールドが含まれる", () => {
      const config = getDefaultConfig(SectionType.GALLERY);
      expect(Array.isArray(config["images"])).toBe(true);
      expect(config["layout"]).toBeDefined();
      expect(typeof config["enableLightbox"]).toBe("boolean");
    });
  });

  describe("HomepageSectionData 型構造", () => {
    test("有効なホームページセクションデータ", () => {
      type HomepageSectionData = {
        id: string;
        type: SectionType;
        title: string | null;
        config: unknown;
        design: unknown;
        contentHtml: string | null;
        contentJson: unknown;
        order: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
      };

      const data: HomepageSectionData = {
        id: VALID_UUID,
        type: SectionType.HERO,
        title: "ヒーロー",
        config: getDefaultConfig(SectionType.HERO),
        design: {},
        contentHtml: null,
        contentJson: null,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(data.type).toBe(SectionType.HERO);
      expect(data.isActive).toBe(true);
      expect(data.order).toBe(0);
    });
  });

  describe("境界値テスト", () => {
    test("タイトル 100 文字（境界）", () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        title: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    test("タイトル 101 文字（境界超過）", () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        title: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    test("order 0（最小値）", () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        order: 0,
      });
      expect(result.success).toBe(true);
    });

    test("order -1（最小値未満）", () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        order: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
