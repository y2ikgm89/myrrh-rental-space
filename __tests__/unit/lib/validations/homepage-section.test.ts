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
  // 型
  SectionType,
  // CRUD
  createSectionSchema,
  updateSectionSchema,
  // デフォルト
  defaultSectionConfigs,
} from "@/admin/lib/validations/homepage-section";

describe("homepage-section re-export", () => {
  test("スキーマがインポート可能", () => {
    expect(heroConfigSchema).toBeDefined();
    expect(heroParallaxConfigSchema).toBeDefined();
    expect(customConfigSchema).toBeDefined();
    expect(conceptConfigSchema).toBeDefined();
    expect(spaceListConfigSchema).toBeDefined();
    expect(newsListConfigSchema).toBeDefined();
    expect(postListConfigSchema).toBeDefined();
    expect(faqListConfigSchema).toBeDefined();
    expect(featuresConfigSchema).toBeDefined();
    expect(testimonialConfigSchema).toBeDefined();
    expect(galleryConfigSchema).toBeDefined();
    expect(ctaConfigSchema).toBeDefined();
    expect(contactFormConfigSchema).toBeDefined();
    expect(mapConfigSchema).toBeDefined();
    expect(embedConfigSchema).toBeDefined();
    expect(instagramConfigSchema).toBeDefined();
  });

  test("SectionTypeがインポート可能", () => {
    expect(SectionType).toBeDefined();
    expect(SectionType.HERO).toBe("HERO");
    expect(SectionType.HERO_PARALLAX).toBe("HERO_PARALLAX");
    expect(SectionType.CUSTOM).toBe("CUSTOM");
    expect(SectionType.CTA).toBe("CTA");
  });

  test("CRUDスキーマがインポート可能", () => {
    expect(createSectionSchema).toBeDefined();
    expect(updateSectionSchema).toBeDefined();
  });

  test("デフォルト設定がインポート可能", () => {
    expect(defaultSectionConfigs).toBeDefined();
    expect(defaultSectionConfigs[SectionType.HERO]).toBeDefined();
  });

  test("heroConfigSchemaが機能する", () => {
    const data = {
      title: "テスト",
      height: "lg",
      buttons: [],
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("ctaConfigSchemaが機能する", () => {
    const data = {
      title: "CTA",
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
      type: "HERO",
      title: "ヒーローセクション",
      config: {},
      design: {},
    };
    const result = createSectionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なデータでエラー", () => {
    const data = { title: "a".repeat(101) };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
