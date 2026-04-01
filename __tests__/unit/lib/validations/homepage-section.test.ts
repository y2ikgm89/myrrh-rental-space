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

  test("デフォルト設定にセクションタイプが含まれる", () => {
    expect(getDefaultConfig("hero")).toBeDefined();
    expect(getDefaultConfig("hero-parallax")).toBeDefined();
    expect(getDefaultConfig("custom")).toBeDefined();
    expect(getDefaultConfig("cta")).toBeDefined();
  });

  test("CRUDスキーマがインポート可能", () => {
    expect(createSectionSchema).toBeDefined();
    expect(updateSectionSchema).toBeDefined();
  });

  test("レジストリにセクション定義が存在する", () => {
    const definitions = getAllSectionDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
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
      type: "hero",
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
