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
      title: [
        {
          _key: "test-title-key",
          _type: "span" as const,
          text: "テストタイトル",
        },
      ],
      subtitle: [
        {
          _key: "test-subtitle-block",
          _type: "block" as const,
          style: "normal" as const,
          children: [
            {
              _key: "test-subtitle-span",
              _type: "span" as const,
              text: "テストサブタイトル",
            },
          ],
        },
      ],
      backgroundImageUrl: "https://example.com/image.jpg",
      buttons: [
        {
          label: [
            {
              _key: "test-hero-button-label",
              _type: "span" as const,
              text: "ボタン1",
            },
          ],
          url: "/test",
          variant: "primary",
          size: "lg",
          openInNewTab: false,
        },
      ],
      height: "lg",
      scrimTone: "dark",
      scrimOpacity: 50,
      variant: "default",
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      // Phase 1: title は schema で PortableTextSpan[] に default([]) されるが、
      // string 入力は parse 失敗するため if (result.success) ブロックは未到達。
      expect(result.data.buttons).toHaveLength(1);
    }
  });

  test("title span のテキスト 500 文字超過でエラー", () => {
    // Phase 1: 旧 maxLength: 100 から PortableTextSpan の per-span 500 char 制限へ移行
    const data = {
      title: [
        {
          _key: "test-title-key",
          _type: "span" as const,
          text: "a".repeat(501),
        },
      ],
    };
    const result = heroConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("CTA ボタン URL は内部 application route のみ許可する", () => {
    const data = {
      buttons: [
        {
          label: [
            {
              _key: "test-external-button-label",
              _type: "span" as const,
              text: "外部リンク",
            },
          ],
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
      expect(result.data.scrimTone).toBe("dark");
      expect(result.data.scrimOpacity).toBe(40);
    }
  });
});

// =============================================================================
// Hero Parallax セクション
// =============================================================================

describe("heroParallaxConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      tagline: [
        {
          _key: "test-tagline-key",
          _type: "span" as const,
          text: "Test Tagline",
        },
      ],
      title: [
        { _key: "test-title-key", _type: "span" as const, text: "Test Title" },
      ],
      subtitle: [
        {
          _key: "test-subtitle-block",
          _type: "block" as const,
          style: "normal" as const,
          children: [
            {
              _key: "test-subtitle-span",
              _type: "span" as const,
              text: "Test Subtitle",
            },
          ],
        },
      ],
      backgroundImageUrl: "https://example.com/bg.jpg",
    };
    const result = heroParallaxConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = heroParallaxConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // Phase 1: tagline は PortableTextSpan[] になり default は空配列
      expect(result.data.tagline).toEqual([]);
      expect(result.data.parallaxSpeed).toBe(0.3);
      // canonical schema (`definitions/hero-parallax/schema.ts`) は `createButtonsArraySchema`
      // を使い default は空配列。Hero CTA の seed default は seed.ts / UI 層で別途配線。
      expect(result.data.buttons).toEqual([]);
    }
  });

  test("tagline span 配列 51 件超過でエラー（maxSpans=50）", () => {
    // Phase 1: 旧 maxLength: 50 から PortableTextSpan の maxSpans 50 制限へ移行
    const tagline = Array.from({ length: 51 }, (_, i) => ({
      _key: `test-tagline-key-${i}`,
      _type: "span" as const,
      text: "a",
    }));
    const data = { tagline };
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
      heading: [
        { _key: "test-heading-key", _type: "span" as const, text: "見出し" },
      ],
      body: [
        {
          _key: "test-body-block",
          _type: "block" as const,
          style: "normal" as const,
          children: [
            {
              _key: "test-body-span",
              _type: "span" as const,
              text: "本文テキスト",
            },
          ],
        },
      ],
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

  test("body が string 以外（型違反）はバリデーション失敗", () => {
    // Phase 4: textarea(maxLength: 1000) → portableTextBlock に切替済み。
    // 文字数制限は schema 層で課さず、UI 層 zodResolver が担う設計
    // （createBlockArraySchema の maxBlocks 50 は構造制約のみ）。
    const result = conceptConfigSchema.safeParse({ body: "string-not-array" });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// SpaceList セクション
// =============================================================================

describe("spaceListConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: [
        {
          _key: "test-title-key",
          _type: "span" as const,
          text: "スペース一覧",
        },
      ],
      maxItems: 6,
      displayLayout: "grid",
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
      title: [
        { _key: "test-title-key", _type: "span" as const, text: "お知らせ" },
      ],
      maxItems: 10,
      displayLayout: "card",
      showViewAllLink: true,
      viewAllText: [
        {
          _key: "test-viewall-span",
          _type: "span" as const,
          text: "すべて見る",
        },
      ],
      viewAllUrl: "/news",
    };
    const result = newsListConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("無効なdisplayLayoutでエラー", () => {
    const data = { displayLayout: "invalid" };
    const result = newsListConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // canonical schema (`definitions/news-list/schema.ts`) の viewAllUrl は
  // `field.text({ maxLength: 200 })` で URL 形式を検証しない（schema 層 permissive、
  // UI 層が <Link href> 経由で typed-route 検証する設計）。旧 `viewAllUrlSchema` の
  // 内部 route 制限は撤回済み。
});

// =============================================================================
// PostList セクション
// =============================================================================

describe("postListConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: [
        { _key: "test-title-key", _type: "span" as const, text: "最新記事" },
      ],
      maxItems: 6,
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
      displayLayout: "grid",
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
      title: [
        {
          _key: "test-title-key",
          _type: "span" as const,
          text: "よくある質問",
        },
      ],
      items: [
        {
          question: [
            { _key: "test-question-23", _type: "span" as const, text: "質問1" },
          ],
          answer: [
            {
              _key: "test-answer-block-1",
              _type: "block" as const,
              style: "normal" as const,
              children: [
                {
                  _key: "test-answer-span-1",
                  _type: "span" as const,
                  text: "回答1",
                },
              ],
            },
          ],
        },
        {
          question: [
            { _key: "test-question-70", _type: "span" as const, text: "質問2" },
          ],
          answer: [
            {
              _key: "test-answer-block-2",
              _type: "block" as const,
              style: "normal" as const,
              children: [
                {
                  _key: "test-answer-span-2",
                  _type: "span" as const,
                  text: "回答2",
                },
              ],
            },
          ],
        },
      ],
      variant: "bordered",
    };
    const result = faqListConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // canonical schema (`definitions/faq-list/schema.ts`) の items[].question / answer は
  // `field.text()` / `field.textarea()` で min/max を schema 層に課さない。
  // 必須・最大長検証は admin form の useFormAction + zodResolver が UI 層で担う設計。
});

// =============================================================================
// Features セクション
// =============================================================================

describe("featuresConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: [{ _key: "test-title-key", _type: "span" as const, text: "特徴" }],
      items: [
        {
          icon: "wifi",
          title: [
            {
              _key: "test-title-19",
              _type: "span" as const,
              text: "Wi-Fi完備",
            },
          ],
          description: [
            {
              _key: "test-features-block-1",
              _type: "block" as const,
              style: "normal" as const,
              children: [
                {
                  _key: "test-features-span-1",
                  _type: "span" as const,
                  text: "高速Wi-Fi利用可能",
                },
              ],
            },
          ],
        },
        {
          title: [
            { _key: "test-title-71", _type: "span" as const, text: "駐車場" },
          ],
          description: [
            {
              _key: "test-features-block-2",
              _type: "block" as const,
              style: "normal" as const,
              children: [
                {
                  _key: "test-features-span-2",
                  _type: "span" as const,
                  text: "無料駐車場完備",
                },
              ],
            },
          ],
        },
      ],
      columns: 3,
    };
    const result = featuresConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // canonical schema (`definitions/features/schema.ts`) は items[].title に min(1) を
  // 課さない（field.text default）。必須検証は UI 層の zodResolver で担う設計。
});

// =============================================================================
// Testimonial セクション
// =============================================================================

describe("testimonialConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: [
        { _key: "test-title-key", _type: "span" as const, text: "お客様の声" },
      ],
      items: [
        {
          content: [
            {
              _key: "test-testimonial-block",
              _type: "block" as const,
              style: "normal" as const,
              children: [
                {
                  _key: "test-testimonial-span",
                  _type: "span" as const,
                  text: "素晴らしい空間でした",
                },
              ],
            },
          ],
          authorName: [
            {
              _key: "test-authorName-60",
              _type: "span" as const,
              text: "田中太郎",
            },
          ],
          authorTitle: [
            {
              _key: "test-authorTitle-17",
              _type: "span" as const,
              text: "CEO",
            },
          ],
          rating: 5,
        },
      ],
      displayLayout: "carousel",
      showRating: true,
    };
    const result = testimonialConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // canonical schema は items[].content に min(1) を課さない（field.text default）。
  // 必須検証は UI 層の zodResolver で担う設計。

  test("rating範囲外でエラー", () => {
    const data = {
      items: [
        {
          content: [
            {
              _key: "test-testimonial-block-rate",
              _type: "block" as const,
              style: "normal" as const,
              children: [
                {
                  _key: "test-testimonial-span-rate",
                  _type: "span" as const,
                  text: "内容",
                },
              ],
            },
          ],
          authorName: [
            {
              _key: "test-authorName-44",
              _type: "span" as const,
              text: "名前",
            },
          ],
          rating: 6,
        },
      ],
    };
    const result = testimonialConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Gallery セクション
// =============================================================================

describe("galleryConfigSchema", () => {
  test("有効なデータ（画像・動画混在）でバリデーション成功", () => {
    const data = {
      media: [
        {
          url: "https://example.com/1.jpg",
          alt: "画像1",
          caption: "キャプション1",
        },
        { url: "https://example.com/clip.mp4", alt: "動画1" },
        { url: "https://www.youtube.com/watch?v=abc123" },
      ],
      gridLayout: "masonry",
      columns: 4,
      gap: "lg",
    };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("空 config でも default 値で safeParse 成功する", () => {
    const result = galleryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.media).toEqual([]);
      expect(result.data.gridLayout).toBe("grid");
      expect(result.data.columns).toBe(3);
    }
  });

  test("同一 URL の重複でエラー", () => {
    const data = {
      media: [
        { url: "https://example.com/dup.jpg" },
        { url: "https://example.com/dup.jpg" },
      ],
    };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // canonical schema (`definitions/gallery/schema.ts`) の media[].url は
  // `field.media()` で format 検証しない（任意 URL / R2 path を許可するため）。
  // 不正 URL の判定は UI 層の MediaPicker と公開ページの next/image / VideoPlayer が担う。

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
      title: [
        {
          _key: "test-title-key",
          _type: "span" as const,
          text: "ご予約はこちら",
        },
      ],
      description: [
        {
          _key: "test-cta-desc-block",
          _type: "block" as const,
          style: "normal" as const,
          children: [
            {
              _key: "test-cta-desc-span",
              _type: "span" as const,
              text: "今すぐ予約して特別な体験を",
            },
          ],
        },
      ],
      buttons: [
        {
          label: [
            {
              _key: "test-cta-button-label",
              _type: "span" as const,
              text: "予約する",
            },
          ],
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

  test("button は旧 text キーを受け付けない", () => {
    const result = ctaConfigSchema.safeParse({
      buttons: [
        {
          text: "予約する",
          url: "/reservation",
          variant: "primary",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test("旧 ctaPrimary / ctaSecondary キーを受け付けない", () => {
    const result = ctaConfigSchema.safeParse({
      title: [
        {
          _key: "test-legacy-cta-title",
          _type: "span" as const,
          text: "ご予約はこちら",
        },
      ],
      ctaPrimary: { text: "予約する", url: "/reservation" },
      ctaSecondary: { text: "お問い合わせ", url: "/contact" },
    });

    expect(result.success).toBe(false);
  });

  // architectural contract: 全 section schema は safeParse({}) 成立必須
  // （`createTypedConfigGetterFromSchema` の fallback chain が空 config からの
  // 復元を要求するため）。タイトル等の "必須" 制約は UI 層 (admin form) で行い、
  // schema 層は permissive で default 値を適用する。
  test("空 config でも default 値で safeParse 成功する", () => {
    const result = ctaConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // Phase 1: title は PortableTextSpan[] になり default は空配列
      expect(result.data.title).toEqual([]);
      expect(result.data.variant).toBe("default");
      expect(result.data.buttons).toEqual([]);
    }
  });

  test("title が string 以外（型違反）はバリデーション失敗", () => {
    const result = ctaConfigSchema.safeParse({ title: 123 });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// ContactForm セクション
// =============================================================================

describe("contactFormConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: [
        {
          _key: "test-title-key",
          _type: "span" as const,
          text: "お問い合わせ",
        },
      ],
      description: [
        {
          _key: "test-contact-desc-block",
          _type: "block" as const,
          style: "normal" as const,
          children: [
            {
              _key: "test-contact-desc-span",
              _type: "span" as const,
              text: "お気軽にお問い合わせください",
            },
          ],
        },
      ],
      showNameField: true,
      showPhoneField: false,
      submitButtonText: [
        {
          _key: "test-submit-span",
          _type: "span" as const,
          text: "送信",
        },
      ],
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
      // Phase 3: submitButtonText は PortableTextSpan[] になり default は空配列
      expect(result.data.submitButtonText).toEqual([]);
    }
  });
});

// =============================================================================
// Map セクション
// =============================================================================

describe("mapConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      title: [
        { _key: "test-title-key", _type: "span" as const, text: "アクセス" },
      ],
      address: [
        {
          _key: "test-map-address-block",
          _type: "block" as const,
          style: "normal" as const,
          children: [
            {
              _key: "test-map-address-span",
              _type: "span" as const,
              text: "東京都渋谷区...",
            },
          ],
        },
      ],
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
      title: [{ _key: "test-title-key", _type: "span" as const, text: "動画" }],
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

  test("embedUrlはCSPで許可した埋め込み元のみ許可", () => {
    expect(
      embedConfigSchema.safeParse({
        embedUrl: "https://www.google.com/maps/embed?pb=test",
      }).success,
    ).toBe(true);

    expect(
      embedConfigSchema.safeParse({
        embedUrl: "https://example.com/embed/unsafe",
      }).success,
    ).toBe(false);
    expect(
      embedConfigSchema.safeParse({
        embedUrl: "http://www.youtube.com/embed/xxxxx",
      }).success,
    ).toBe(false);
    expect(embedConfigSchema.safeParse({ embedUrl: "" }).success).toBe(true);
  });
});

// =============================================================================
// Instagram セクション
// =============================================================================

describe("instagramConfigSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
      sectionLabel: "Follow Us",
      title: [
        { _key: "test-title-key", _type: "span" as const, text: "Instagram" },
      ],
    };
    const result = instagramConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("デフォルト値の適用", () => {
    const result = instagramConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sectionLabel).toBe("Follow Us");
      // Phase 1: title は PortableTextSpan[] になり default は空配列
      expect(result.data.title).toEqual([]);
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
      config: {
        title: [
          {
            _key: "cfg-title-key",
            _type: "span" as const,
            text: "Test",
          },
        ],
      },
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

  test.each([
    ["title", { title: "ヒーローセクション" }],
    ["design", { design: {} }],
    ["order", { order: 999 }],
    ["contentJson", { contentJson: "{}" }],
  ])("%s は create 入力として拒否する", (_field, extra) => {
    const result = createSectionSchema.safeParse({
      type: "hero",
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  // 旧 contentJson 文字数制限 test は削除（Section.contentJson 列削除済、
  // createSectionSchema からも contentJson field 削除済）
});

describe("updateSectionSchema", () => {
  test("有効なデータでバリデーション成功", () => {
    const data = {
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

  test("重複した order でエラー", () => {
    const data = {
      sections: [
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 0 },
      ],
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
      title: [{ _key: "h1", _type: "span" as const, text: "Test Hero" }],
      height: "lg",
    });
    expect(result.success).toBe(true);
  });

  test("HEROタイプで無効なconfig（span text 500 文字超過）", () => {
    const result = validateSectionConfig("hero", {
      title: [{ _key: "h1", _type: "span" as const, text: "a".repeat(501) }],
    });
    expect(result.success).toBe(false);
  });

  test("CTAタイプで有効なconfig", () => {
    const result = validateSectionConfig("cta", {
      title: [{ _key: "c1", _type: "span" as const, text: "CTA Title" }],
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
      scrimTone: "dark",
      scrimOpacity: 40,
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
      title: [{ _key: "v1", _type: "span" as const, text: "CTA" }],
      buttons: [],
      variant: "default",
      sectionLabel: "Ready to Begin?",
    };
    // architectural contract: 空 config / title: [] は default 適用で valid。
    // Phase 1 で title は PortableTextSpan[]。型違反のみ false を返す。
    expect(isCtaConfig(validCta)).toBe(true);
    expect(isCtaConfig({})).toBe(true);
    expect(isCtaConfig({ title: [] })).toBe(true);
    expect(isCtaConfig({ title: 123 })).toBe(false);
    expect(isCtaConfig({ title: "string-not-array" })).toBe(false);
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
    expect(defaultHero["scrimTone"]).toBe("dark");
    expect(defaultHero["scrimOpacity"]).toBe(40);
  });

  test("CTAデフォルト設定", () => {
    const defaultCta = getDefaultConfig(SectionType.CTA);
    expect(defaultCta["sectionLabel"]).toBe("Ready to Begin?");
    expect(defaultCta["variant"]).toBe("default");
  });
});
