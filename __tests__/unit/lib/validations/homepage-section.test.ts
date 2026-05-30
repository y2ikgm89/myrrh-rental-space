/**
 * homepage-section.test.ts
 *
 * 統一セクションスキーマのre-exportテスト
 * 実体は @/shared/lib/validations/section にあるため、
 * ここでは基本的なインポート検証のみ行う
 */

import { describe, test, expect } from "bun:test";
import {
  // 主要スキーマがre-exportされていることを確認
  heroConfigSchema,
  heroParallaxConfigSchema,
  customConfigSchema,
  conceptConfigSchema,
  spaceListConfigSchema,
  newsListConfigSchema,
  postListConfigSchema,
  faqListConfigSchema,
  featuresConfigSchema,
  testimonialConfigSchema,
  galleryConfigSchema,
  ctaConfigSchema,
  contactFormConfigSchema,
  mapConfigSchema,
  embedConfigSchema,
  instagramConfigSchema,
  // CRUD
  createSectionSchema,
  updateSectionSchema,
} from "@/admin/lib/validations/homepage-section";
import {
  getDefaultConfig,
  getAllSectionDefinitions,
} from "@/shared/lib/sections/registry";

describe("homepage-section re-export", () => {
  test("各セクションスキーマが空 config で safeParse 成功する（section schema test contract）", () => {
    expect(heroConfigSchema.safeParse({}).success).toBe(true);
    expect(heroParallaxConfigSchema.safeParse({}).success).toBe(true);
    expect(customConfigSchema.safeParse({}).success).toBe(true);
    expect(conceptConfigSchema.safeParse({}).success).toBe(true);
    expect(spaceListConfigSchema.safeParse({}).success).toBe(true);
    expect(newsListConfigSchema.safeParse({}).success).toBe(true);
    expect(postListConfigSchema.safeParse({}).success).toBe(true);
    expect(faqListConfigSchema.safeParse({}).success).toBe(true);
    expect(featuresConfigSchema.safeParse({}).success).toBe(true);
    expect(testimonialConfigSchema.safeParse({}).success).toBe(true);
    expect(galleryConfigSchema.safeParse({}).success).toBe(true);
    expect(ctaConfigSchema.safeParse({}).success).toBe(true);
    expect(contactFormConfigSchema.safeParse({}).success).toBe(true);
    expect(mapConfigSchema.safeParse({}).success).toBe(true);
    expect(embedConfigSchema.safeParse({}).success).toBe(true);
    expect(instagramConfigSchema.safeParse({}).success).toBe(true);
  });

  test("CRUDスキーマが空 type 以外の最小 config で safeParse 成功する", () => {
    const minimalCreate = {
      type: "hero",
      title: "test",
      config: {},
      design: {},
    };
    expect(createSectionSchema.safeParse(minimalCreate).success).toBe(true);
  });

  test("デフォルト設定がオブジェクトを返す", () => {
    const heroDefault = getDefaultConfig("hero");
    expect(typeof heroDefault).toBe("object");
    expect(heroDefault).not.toBeNull();

    const ctaDefault = getDefaultConfig("cta");
    expect(typeof ctaDefault).toBe("object");
    expect(ctaDefault).not.toBeNull();

    const customDefault = getDefaultConfig("custom");
    expect(typeof customDefault).toBe("object");
    expect(customDefault).not.toBeNull();
  });

  test("レジストリにセクション定義が存在する", () => {
    const definitions = getAllSectionDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
  });

  test("heroConfigSchemaが機能する", () => {
    const data = {
      title: [{ _key: "k1", _type: "span" as const, text: "テスト" }],
      height: "lg",
      buttons: [],
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("ctaConfigSchemaが機能する", () => {
    const data = {
      title: [{ _key: "k1", _type: "span" as const, text: "CTA" }],
      buttons: [
        {
          text: "ボタン",
          url: "/test",
          variant: "primary",
          size: "lg",
          openInNewTab: false,
        },
      ],
    };
    const result = ctaConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("createSectionSchemaが機能する", () => {
    const data = {
      type: "hero",
      title: "ヒーローセクション",
      config: {},
      design: {},
    };
    const result = createSectionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なデータでエラー（span text 500 超）", () => {
    // Phase 1: per-span 500 char 制限
    const data = {
      title: [{ _key: "k1", _type: "span" as const, text: "a".repeat(501) }],
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
