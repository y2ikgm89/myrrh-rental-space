import { describe, test, expect } from "bun:test";
import {
  // Core schemas
  heroConfigSchema,
  heroParallaxConfigSchema,
  customConfigSchema,
  conceptConfigSchema,
  spaceListConfigSchema,
  spaceShowcaseConfigSchema,
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
  // CRUD schemas
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  // Validators
  validateSectionConfig,
  // Type guards
  isHeroConfig,
  isCtaConfig,
  // Helpers
  parseHeroHeight,
  parseSpaceLayout,
  parseNewsLayout,
  parsePostLayout,
  parseCtaVariant,
  SectionType,
} from "@/shared/lib/validations/section";
import { getDefaultConfig } from "@/shared/lib/sections/registry";

// =============================================================================
// Hero セクション
// =============================================================================

describe("heroConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "テストタイトル",
      subtitle: "テストサブタイトル",
      backgroundImageUrl: "https://example.com/image.jpg",
      buttons: [
        {
          text: "ボタン1",
          url: "/test",
          variant: "primary",
          size: "lg",
          openInNewTab: false,
        },
      ],
      height: "lg",
      overlay: true,
      overlayOpacity: 50,
      variant: "default",
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("テストタイトル");
      expect(result.data.buttons).toHaveLength(1);
    }
  });

  test("レガシーCTAフィールド→buttons[]変換", () => {
    const data = {
      ctaPrimary: { text: "主ボタン", url: "/primary" },
      ctaSecondary: { text: "副ボタン", url: "/secondary" },
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buttons).toHaveLength(2);
      expect(result.data.buttons?.[0]?.variant).toBe("primary");
      expect(result.data.buttons?.[1]?.variant).toBe("secondary");
    }
  });

  test("タイトル100文字超過でエラー", () => {
    const data = { title: "a".repeat(101) };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("無効なURL形式でエラー", () => {
    const data = { backgroundImageUrl: "invalid-url" };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("CTA ボタン URL は内部 application route のみ許可する", () => {
    const data = {
      buttons: [
        {
          text: "外部リンク",
          url: "https://example.com/reservation",
          variant: "primary",
          size: "lg",
          openInNewTab: false,
        },
      ],
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("デフォルト値の適用", () => {
    const result = heroConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.height).toBe("md");
      expect(result.data.overlay).toBe(true);
      expect(result.data.overlayOpacity).toBe(40);
    }
  });
});

// =============================================================================
// Hero Parallax セクション
// =============================================================================

describe("heroParallaxConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      tagline: "Test Tagline",
      title: "Test Title",
      subtitle: "Test Subtitle",
      backgroundImageUrl: "https://example.com/bg.jpg",
    };
    const result = heroParallaxConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = heroParallaxConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagline).toBe("Luxury Rental Space");
      expect(result.data.parallaxSpeed).toBe(0.3);
      expect(result.data.overlayGradient).toBe(true);
      expect(result.data.buttons).toHaveLength(1);
    }
  });

  test("タグライン50文字超過でエラー", () => {
    const data = { tagline: "a".repeat(51) };
    const result = heroParallaxConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Custom セクション
// =============================================================================

describe("customConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      sectionLabel: "Custom Section",
      containerClass: "custom-class",
    };
    const result = customConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = customConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sectionLabel).toBe("Contents");
      expect(result.data.layout.padding).toBe("md");
      expect(result.data.layout.containerWidth).toBe("lg");
    }
  });
});

// =============================================================================
// Concept セクション
// =============================================================================

describe("conceptConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      heading: "見出し",
      body: "本文テキスト",
      imageUrl: "https://example.com/concept.jpg",
      imagePosition: "left",
      textAlign: "center",
    };
    const result = conceptConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = conceptConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imagePosition).toBe("right");
      expect(result.data.textAlign).toBe("left");
    }
  });

  test("本文1000文字超過でエラー", () => {
    const data = { body: "あ".repeat(1001) };
    const result = conceptConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// SpaceList セクション
// =============================================================================

describe("spaceListConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "スペース一覧",
      maxItems: 6,
      layout: "grid",
      columns: 3,
    };
    const result = spaceListConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("maxItems範囲外でエラー", () => {
    const invalid1 = { maxItems: 0 };
    const invalid2 = { maxItems: 25 };
    expect(spaceListConfigSchema.safeParse(invalid1).success).toBe(false);
    expect(spaceListConfigSchema.safeParse(invalid2).success).toBe(false);
  });

  test("columns範囲外でエラー", () => {
    const invalid = { columns: 5 };
    const result = spaceListConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// NewsList セクション
// =============================================================================

describe("newsListConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "お知らせ",
      maxItems: 10,
      layout: "card",
      showViewAllLink: true,
      viewAllText: "すべて見る",
      viewAllUrl: "/news",
    };
    const result = newsListConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なlayoutでエラー", () => {
    const data = { layout: "invalid" };
    const result = newsListConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("viewAllUrl は内部 application route のみ許可する", () => {
    const data = { viewAllUrl: "https://example.com/news" };
    const result = newsListConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// PostList セクション
// =============================================================================

describe("postListConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "最新記事",
      maxItems: 6,
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
      layout: "grid",
    };
    const result = postListConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なUUID形式でエラー", () => {
    const data = { categoryId: "invalid-uuid" };
    const result = postListConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// FaqList セクション
// =============================================================================

describe("faqListConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "よくある質問",
      items: [
        { question: "質問1", answer: "回答1" },
        { question: "質問2", answer: "回答2" },
      ],
      variant: "bordered",
    };
    const result = faqListConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("質問が空文字でエラー", () => {
    const data = {
      items: [{ question: "", answer: "回答" }],
    };
    const result = faqListConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("質問200文字超過でエラー", () => {
    const data = {
      items: [{ question: "あ".repeat(201), answer: "回答" }],
    };
    const result = faqListConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Features セクション
// =============================================================================

describe("featuresConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "特徴",
      items: [
        { icon: "wifi", title: "Wi-Fi完備", description: "高速Wi-Fi利用可能" },
        { title: "駐車場", description: "無料駐車場完備" },
      ],
      columns: 3,
    };
    const result = featuresConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("タイトル必須バリデーション", () => {
    const data = {
      items: [{ title: "", description: "説明" }],
    };
    const result = featuresConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Testimonial セクション
// =============================================================================

describe("testimonialConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "お客様の声",
      items: [
        {
          content: "素晴らしい空間でした",
          authorName: "田中太郎",
          authorTitle: "CEO",
          rating: 5,
        },
      ],
      layout: "carousel",
      showRating: true,
    };
    const result = testimonialConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("content必須バリデーション", () => {
    const data = {
      items: [{ content: "", authorName: "名前" }],
    };
    const result = testimonialConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("rating範囲外でエラー", () => {
    const data = {
      items: [{ content: "内容", authorName: "名前", rating: 6 }],
    };
    const result = testimonialConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Gallery セクション
// =============================================================================

describe("galleryConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      images: [
        {
          url: "https://example.com/1.jpg",
          alt: "画像1",
          caption: "キャプション1",
        },
        { url: "https://example.com/2.jpg" },
      ],
      layout: "masonry",
      columns: 4,
      gap: "lg",
    };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なURL形式でエラー", () => {
    const data = {
      images: [{ url: "invalid-url" }],
    };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("columns範囲外でエラー", () => {
    const data = { columns: 7 };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// CTA セクション
// =============================================================================

describe("ctaConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "ご予約はこちら",
      description: "今すぐ予約して特別な体験を",
      buttons: [
        {
          text: "予約する",
          url: "/reservation",
          variant: "primary",
          size: "lg",
          openInNewTab: false,
        },
      ],
      variant: "centered",
    };
    const result = ctaConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("タイトル必須バリデーション", () => {
    const data = {};
    const result = ctaConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("レガシーCTA→buttons変換", () => {
    const data = {
      title: "CTA",
      ctaPrimary: { text: "主ボタン", url: "/primary" },
    };
    const result = ctaConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buttons).toHaveLength(1);
    }
  });

  test("レガシー CTA URL も内部 application route のみ許可する", () => {
    const data = {
      title: "CTA",
      ctaSecondary: {
        text: "外部リンク",
        url: "https://example.com/contact",
      },
    };
    const result = ctaConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// ContactForm セクション
// =============================================================================

describe("contactFormConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "お問い合わせ",
      description: "お気軽にお問い合わせください",
      showNameField: true,
      showPhoneField: false,
      submitButtonText: "送信",
      variant: "minimal",
    };
    const result = contactFormConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = contactFormConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showNameField).toBe(true);
      expect(result.data.submitButtonText).toBe("送信する");
    }
  });
});

// =============================================================================
// Map セクション
// =============================================================================

describe("mapConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "アクセス",
      address: "東京都渋谷区...",
      latitude: 35.6812,
      longitude: 139.7671,
      zoom: 15,
      height: "lg",
    };
    const result = mapConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("緯度範囲外でエラー", () => {
    const data = { latitude: 100 };
    const result = mapConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("経度範囲外でエラー", () => {
    const data = { longitude: -200 };
    const result = mapConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("zoom範囲外でエラー", () => {
    const invalid1 = { zoom: 0 };
    const invalid2 = { zoom: 21 };
    expect(mapConfigSchema.safeParse(invalid1).success).toBe(false);
    expect(mapConfigSchema.safeParse(invalid2).success).toBe(false);
  });
});

// =============================================================================
// Embed セクション
// =============================================================================

describe("embedConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "動画",
      embedUrl: "https://www.youtube.com/embed/xxxxx",
      aspectRatio: "16:9",
      maxWidth: "lg",
    };
    const result = embedConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("embedCodeの文字数制限", () => {
    const data = { embedCode: "a".repeat(10001) };
    const result = embedConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Instagram セクション
// =============================================================================

describe("instagramConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      sectionLabel: "Follow Us",
      title: "Instagram",
    };
    const result = instagramConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = instagramConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sectionLabel).toBe("Follow Us");
      expect(result.data.title).toBe("Instagram");
    }
  });
});

// =============================================================================
// CRUD スキーマ
// =============================================================================

describe("createSectionSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      pageId: "550e8400-e29b-41d4-a716-446655440000",
      type: "hero",
      title: "ヒーローセクション",
      config: { title: "Test" },
      design: {},
      isActive: true,
    };
    const result = createSectionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const data = {
      type: "custom",
    };
    const result = createSectionSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toEqual({});
      expect(result.data.isActive).toBe(true);
    }
  });

  test("contentJsonの文字数制限", () => {
    const data = {
      type: "custom",
      contentJson: "a".repeat(500001),
    };
    const result = createSectionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("updateSectionSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: "更新タイトル",
      config: { maxItems: 10 },
      isActive: false,
    };
    const result = updateSectionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("空オブジェクトでも成功（全フィールドオプショナル）", () => {
    const result = updateSectionSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("updateSectionOrderSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      sections: [
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 1 },
      ],
    };
    const result = updateSectionOrderSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なUUIDでエラー", () => {
    const data = {
      sections: [{ id: "invalid-id", order: 0 }],
    };
    const result = updateSectionOrderSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("負のorderでエラー", () => {
    const data = {
      sections: [{ id: "550e8400-e29b-41d4-a716-446655440000", order: -1 }],
    };
    const result = updateSectionOrderSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// バリデーション関数
// =============================================================================

describe("validateSectionConfig", () => {
  test("HEROタイプで有効なconfig", () => {
    const result = validateSectionConfig("hero", {
      title: "Test Hero",
      height: "lg",
    });
    expect(result.success).toBe(true);
  });

  test("HEROタイプで無効なconfig", () => {
    const result = validateSectionConfig("hero", {
      title: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test("CTAタイプで有効なconfig", () => {
    const result = validateSectionConfig("cta", {
      title: "CTA Title",
      buttons: [],
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// 型ガード関数
// =============================================================================

describe("型ガード関数", () => {
  test("isHeroConfig", () => {
    const validHero = {
      height: "md",
      overlay: true,
      overlayOpacity: 40,
      variant: "default",
      parallaxSpeed: 0.5,
      buttons: [],
    };
    const invalidHero = { title: "a".repeat(101) };
    expect(isHeroConfig(validHero)).toBe(true);
    expect(isHeroConfig(invalidHero)).toBe(false);
  });

  test("isCtaConfig", () => {
    const validCta = {
      title: "CTA",
      buttons: [],
      variant: "default",
      sectionLabel: "Ready to Begin?",
    };
    const invalidCta = { title: "" };
    expect(isCtaConfig(validCta)).toBe(true);
    expect(isCtaConfig(invalidCta)).toBe(false);
  });
});

// =============================================================================
// パーサー関数
// =============================================================================

describe("パーサー関数", () => {
  test("parseHeroHeight", () => {
    expect(parseHeroHeight("lg")).toBe("lg");
    expect(parseHeroHeight("invalid")).toBe("md"); // デフォルト
  });

  test("parseSpaceLayout", () => {
    expect(parseSpaceLayout("carousel")).toBe("carousel");
    expect(parseSpaceLayout("invalid")).toBe("grid"); // デフォルト
  });

  test("parseNewsLayout", () => {
    expect(parseNewsLayout("card")).toBe("card");
    expect(parseNewsLayout("invalid")).toBe("list"); // デフォルト
  });

  test("parsePostLayout", () => {
    expect(parsePostLayout("list")).toBe("list");
    expect(parsePostLayout("invalid")).toBe("grid"); // デフォルト
  });

  test("parseCtaVariant", () => {
    expect(parseCtaVariant("centered")).toBe("centered");
    expect(parseCtaVariant("invalid")).toBe("default"); // デフォルト
  });
});

// =============================================================================
// デフォルト設定
// =============================================================================

describe("getDefaultConfig (registry)", () => {
  test("全セクションタイプにデフォルト設定が存在", () => {
    const types = Object.values(SectionType);
    types.forEach((type) => {
      expect(getDefaultConfig(type)).toBeDefined();
    });
  });

  test("HEROデフォルト設定", () => {
    const defaultHero = getDefaultConfig(SectionType.HERO);
    expect(defaultHero["height"]).toBe("md");
    expect(defaultHero["overlay"]).toBe(true);
    expect(defaultHero["overlayOpacity"]).toBe(40);
  });

  test("CTAデフォルト設定", () => {
    const defaultCta = getDefaultConfig(SectionType.CTA);
    expect(defaultCta["sectionLabel"]).toBe("Ready to Begin?");
    expect(defaultCta["variant"]).toBe("default");
  });
});
