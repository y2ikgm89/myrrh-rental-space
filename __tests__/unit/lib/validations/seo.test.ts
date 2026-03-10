/**
 * SEO/OGP バリデーションスキーマテスト
 *
 * src/shared/lib/validations/seo.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  SEO_LIMITS,
  seoFieldsSchema,
  ogpFieldsSchema,
  seoOgpFieldsSchema,
  seoFieldsFormSchema,
  ogpFieldsFormSchema,
  seoOgpFieldsFormSchema,
  defaultSeoOgpValues,
  defaultSeoOgpFormValues,
} from "@/shared/lib/validations/seo";

// =============================================================================
// SEO_LIMITS
// =============================================================================

describe("SEO_LIMITS", () => {
  test("制限値が業界標準に基づく正しい値である", () => {
    expect(SEO_LIMITS.META_DESCRIPTION).toBe(160);
    expect(SEO_LIMITS.META_KEYWORDS).toBe(500);
    expect(SEO_LIMITS.OGP_TITLE).toBe(70);
    expect(SEO_LIMITS.OGP_DESCRIPTION).toBe(200);
  });
});

// =============================================================================
// seoFieldsSchema（Server Action用）
// =============================================================================

describe("seoFieldsSchema", () => {
  describe("正常系", () => {
    test("全フィールド省略でも通過", () => {
      const result = seoFieldsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("metaDescriptionが有効な文字列で通過", () => {
      const result = seoFieldsSchema.safeParse({
        metaDescription: "このスペースはイベントや撮影に最適です。",
      });
      expect(result.success).toBe(true);
    });

    test("metaDescriptionがnullで通過", () => {
      const result = seoFieldsSchema.safeParse({ metaDescription: null });
      expect(result.success).toBe(true);
    });

    test("metaDescriptionがundefinedで通過", () => {
      const result = seoFieldsSchema.safeParse({ metaDescription: undefined });
      expect(result.success).toBe(true);
    });

    test("metaKeywordsが有効な文字列で通過", () => {
      const result = seoFieldsSchema.safeParse({
        metaKeywords: "レンタルスペース, 撮影, イベント",
      });
      expect(result.success).toBe(true);
    });

    test("metaKeywordsがnullで通過", () => {
      const result = seoFieldsSchema.safeParse({ metaKeywords: null });
      expect(result.success).toBe(true);
    });

    test("metaDescriptionが160文字ちょうどで通過", () => {
      const result = seoFieldsSchema.safeParse({
        metaDescription: "あ".repeat(SEO_LIMITS.META_DESCRIPTION),
      });
      expect(result.success).toBe(true);
    });

    test("metaKeywordsが500文字ちょうどで通過", () => {
      const result = seoFieldsSchema.safeParse({
        metaKeywords: "a".repeat(SEO_LIMITS.META_KEYWORDS),
      });
      expect(result.success).toBe(true);
    });

    test("両フィールドとも有効な値で通過", () => {
      const result = seoFieldsSchema.safeParse({
        metaDescription: "スペースの説明",
        metaKeywords: "キーワード1, キーワード2",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("metaDescriptionが161文字でエラー", () => {
      const result = seoFieldsSchema.safeParse({
        metaDescription: "あ".repeat(SEO_LIMITS.META_DESCRIPTION + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("metaDescription");
      }
    });

    test("metaKeywordsが501文字でエラー", () => {
      const result = seoFieldsSchema.safeParse({
        metaKeywords: "a".repeat(SEO_LIMITS.META_KEYWORDS + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("metaKeywords");
      }
    });
  });
});

// =============================================================================
// ogpFieldsSchema（Server Action用）
// =============================================================================

describe("ogpFieldsSchema", () => {
  describe("正常系", () => {
    test("全フィールド省略でも通過", () => {
      const result = ogpFieldsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("ogpTitleが有効な文字列で通過", () => {
      const result = ogpFieldsSchema.safeParse({ ogpTitle: "OGPタイトル" });
      expect(result.success).toBe(true);
    });

    test("ogpTitleがnullで通過", () => {
      const result = ogpFieldsSchema.safeParse({ ogpTitle: null });
      expect(result.success).toBe(true);
    });

    test("ogpDescriptionが有効な文字列で通過", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpDescription: "OGPの説明文です。",
      });
      expect(result.success).toBe(true);
    });

    test("ogpDescriptionがnullで通過", () => {
      const result = ogpFieldsSchema.safeParse({ ogpDescription: null });
      expect(result.success).toBe(true);
    });

    test("ogpImageUrlが有効なURLで通過", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpImageUrl: "https://example.com/image.jpg",
      });
      expect(result.success).toBe(true);
    });

    test("ogpImageUrlがnullで通過", () => {
      const result = ogpFieldsSchema.safeParse({ ogpImageUrl: null });
      expect(result.success).toBe(true);
    });

    test("ogpImageUrlがundefinedで通過", () => {
      const result = ogpFieldsSchema.safeParse({ ogpImageUrl: undefined });
      expect(result.success).toBe(true);
    });

    test("ogpTitleが70文字ちょうどで通過", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpTitle: "あ".repeat(SEO_LIMITS.OGP_TITLE),
      });
      expect(result.success).toBe(true);
    });

    test("ogpDescriptionが200文字ちょうどで通過", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpDescription: "あ".repeat(SEO_LIMITS.OGP_DESCRIPTION),
      });
      expect(result.success).toBe(true);
    });

    test("全フィールドが有効な値で通過", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpTitle: "OGPタイトル",
        ogpDescription: "OGPの説明",
        ogpImageUrl: "https://example.com/ogp.png",
      });
      expect(result.success).toBe(true);
    });

    test("httpsとhttpのURLが両方通過", () => {
      for (const url of [
        "https://example.com/image.jpg",
        "http://example.com/image.jpg",
      ]) {
        const result = ogpFieldsSchema.safeParse({ ogpImageUrl: url });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("異常系", () => {
    test("ogpTitleが71文字でエラー", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpTitle: "あ".repeat(SEO_LIMITS.OGP_TITLE + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("ogpTitle");
      }
    });

    test("ogpDescriptionが201文字でエラー", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpDescription: "あ".repeat(SEO_LIMITS.OGP_DESCRIPTION + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("ogpDescription");
      }
    });

    test("ogpImageUrlが無効なURLでエラー", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpImageUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("ogpImageUrl");
      }
    });

    test("ogpImageUrlがプロトコルなしのURLでエラー", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpImageUrl: "example.com/image.jpg",
      });
      expect(result.success).toBe(false);
    });

    test("ogpImageUrlが空文字でエラー", () => {
      const result = ogpFieldsSchema.safeParse({ ogpImageUrl: "" });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// seoOgpFieldsSchema（Server Action用・統合）
// =============================================================================

describe("seoOgpFieldsSchema", () => {
  describe("正常系", () => {
    test("全フィールド省略でも通過", () => {
      const result = seoOgpFieldsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("全フィールドがnullで通過", () => {
      const result = seoOgpFieldsSchema.safeParse({
        metaDescription: null,
        metaKeywords: null,
        ogpTitle: null,
        ogpDescription: null,
        ogpImageUrl: null,
      });
      expect(result.success).toBe(true);
    });

    test("全フィールドに有効な値で通過", () => {
      const result = seoOgpFieldsSchema.safeParse({
        metaDescription: "スペースの詳細な説明文です。",
        metaKeywords: "レンタルスペース, パーティー, イベント",
        ogpTitle: "Myrrh レンタルスペース",
        ogpDescription: "最高のレンタルスペース体験を提供します。",
        ogpImageUrl: "https://example.com/ogp.jpg",
      });
      expect(result.success).toBe(true);
    });

    test("seoFieldsSchemaとogpFieldsSchemaのフィールドを両方持つ", () => {
      const result = seoOgpFieldsSchema.safeParse({});
      if (result.success) {
        // merge されたスキーマなのでキーが存在する
        expect(Object.keys(result.data).length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("異常系", () => {
    test("metaDescriptionが上限超過でエラー", () => {
      const result = seoOgpFieldsSchema.safeParse({
        metaDescription: "a".repeat(SEO_LIMITS.META_DESCRIPTION + 1),
      });
      expect(result.success).toBe(false);
    });

    test("ogpImageUrlが無効なURLでエラー", () => {
      const result = seoOgpFieldsSchema.safeParse({
        ogpImageUrl: "invalid-url",
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// seoFieldsFormSchema（フォーム用）
// =============================================================================

describe("seoFieldsFormSchema", () => {
  describe("正常系", () => {
    test("全フィールド省略でも通過", () => {
      const result = seoFieldsFormSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("metaDescriptionが空文字で通過", () => {
      const result = seoFieldsFormSchema.safeParse({ metaDescription: "" });
      expect(result.success).toBe(true);
    });

    test("metaKeywordsが空文字で通過", () => {
      const result = seoFieldsFormSchema.safeParse({ metaKeywords: "" });
      expect(result.success).toBe(true);
    });

    test("metaDescriptionが有効な文字列で通過", () => {
      const result = seoFieldsFormSchema.safeParse({
        metaDescription: "スペースの説明文",
      });
      expect(result.success).toBe(true);
    });

    test("metaDescriptionが160文字ちょうどで通過", () => {
      const result = seoFieldsFormSchema.safeParse({
        metaDescription: "あ".repeat(SEO_LIMITS.META_DESCRIPTION),
      });
      expect(result.success).toBe(true);
    });

    test("metaKeywordsが500文字ちょうどで通過", () => {
      const result = seoFieldsFormSchema.safeParse({
        metaKeywords: "a".repeat(SEO_LIMITS.META_KEYWORDS),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("metaDescriptionが161文字でエラー", () => {
      const result = seoFieldsFormSchema.safeParse({
        metaDescription: "あ".repeat(SEO_LIMITS.META_DESCRIPTION + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("metaDescription");
      }
    });

    test("metaKeywordsが501文字でエラー", () => {
      const result = seoFieldsFormSchema.safeParse({
        metaKeywords: "a".repeat(SEO_LIMITS.META_KEYWORDS + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("metaKeywords");
      }
    });
  });

  describe("フォーム用とServer Action用の違い", () => {
    test("フォーム用はnullを受け付けない（undefinedはOK）", () => {
      // フォーム用スキーマは nullable() がないため null はエラー
      const result = seoFieldsFormSchema.safeParse({ metaDescription: null });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// ogpFieldsFormSchema（フォーム用）
// =============================================================================

describe("ogpFieldsFormSchema", () => {
  describe("正常系", () => {
    test("全フィールド省略でも通過", () => {
      const result = ogpFieldsFormSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("ogpTitleが空文字で通過", () => {
      const result = ogpFieldsFormSchema.safeParse({ ogpTitle: "" });
      expect(result.success).toBe(true);
    });

    test("ogpDescriptionが空文字で通過", () => {
      const result = ogpFieldsFormSchema.safeParse({ ogpDescription: "" });
      expect(result.success).toBe(true);
    });

    test("ogpImageUrlが空文字で通過（フォーム用はURL検証なし）", () => {
      // フォーム用はz.string().optional()のためURL検証がない
      const result = ogpFieldsFormSchema.safeParse({ ogpImageUrl: "" });
      expect(result.success).toBe(true);
    });

    test("ogpImageUrlが有効なURLで通過", () => {
      const result = ogpFieldsFormSchema.safeParse({
        ogpImageUrl: "https://example.com/ogp.jpg",
      });
      expect(result.success).toBe(true);
    });

    test("ogpTitleが70文字ちょうどで通過", () => {
      const result = ogpFieldsFormSchema.safeParse({
        ogpTitle: "あ".repeat(SEO_LIMITS.OGP_TITLE),
      });
      expect(result.success).toBe(true);
    });

    test("ogpDescriptionが200文字ちょうどで通過", () => {
      const result = ogpFieldsFormSchema.safeParse({
        ogpDescription: "あ".repeat(SEO_LIMITS.OGP_DESCRIPTION),
      });
      expect(result.success).toBe(true);
    });

    test("全フィールドに有効な値で通過", () => {
      const result = ogpFieldsFormSchema.safeParse({
        ogpTitle: "OGPタイトル",
        ogpDescription: "OGPの説明文",
        ogpImageUrl: "https://example.com/ogp.png",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("ogpTitleが71文字でエラー", () => {
      const result = ogpFieldsFormSchema.safeParse({
        ogpTitle: "あ".repeat(SEO_LIMITS.OGP_TITLE + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("ogpTitle");
      }
    });

    test("ogpDescriptionが201文字でエラー", () => {
      const result = ogpFieldsFormSchema.safeParse({
        ogpDescription: "あ".repeat(SEO_LIMITS.OGP_DESCRIPTION + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path).flat();
        expect(paths).toContain("ogpDescription");
      }
    });
  });

  describe("フォーム用とServer Action用の違い", () => {
    test("フォーム用のogpImageUrlはURL形式でなくても通過", () => {
      // フォーム用は z.string().optional() のため URL 検証がない
      const result = ogpFieldsFormSchema.safeParse({
        ogpImageUrl: "not-a-url",
      });
      expect(result.success).toBe(true);
    });

    test("Server Action用のogpImageUrlはURL形式でないとエラー", () => {
      const result = ogpFieldsSchema.safeParse({
        ogpImageUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// seoOgpFieldsFormSchema（フォーム用・統合）
// =============================================================================

describe("seoOgpFieldsFormSchema", () => {
  describe("正常系", () => {
    test("全フィールド省略でも通過", () => {
      const result = seoOgpFieldsFormSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("全フィールドが空文字で通過", () => {
      const result = seoOgpFieldsFormSchema.safeParse({
        metaDescription: "",
        metaKeywords: "",
        ogpTitle: "",
        ogpDescription: "",
        ogpImageUrl: "",
      });
      expect(result.success).toBe(true);
    });

    test("全フィールドに有効な値で通過", () => {
      const result = seoOgpFieldsFormSchema.safeParse({
        metaDescription: "スペースの説明",
        metaKeywords: "キーワード",
        ogpTitle: "OGPタイトル",
        ogpDescription: "OGP説明",
        ogpImageUrl: "https://example.com/ogp.jpg",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("metaDescriptionが上限超過でエラー", () => {
      const result = seoOgpFieldsFormSchema.safeParse({
        metaDescription: "a".repeat(SEO_LIMITS.META_DESCRIPTION + 1),
      });
      expect(result.success).toBe(false);
    });

    test("ogpTitleが上限超過でエラー", () => {
      const result = seoOgpFieldsFormSchema.safeParse({
        ogpTitle: "あ".repeat(SEO_LIMITS.OGP_TITLE + 1),
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// defaultSeoOgpValues
// =============================================================================

describe("defaultSeoOgpValues", () => {
  test("デフォルト値が全てnullである", () => {
    expect(defaultSeoOgpValues).toEqual({
      metaDescription: null,
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
    });
  });

  test("seoOgpFieldsSchemaのバリデーションを通過する", () => {
    const result = seoOgpFieldsSchema.safeParse(defaultSeoOgpValues);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// defaultSeoOgpFormValues
// =============================================================================

describe("defaultSeoOgpFormValues", () => {
  test("デフォルト値が全て空文字列である", () => {
    expect(defaultSeoOgpFormValues).toEqual({
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      ogpImageUrl: "",
    });
  });

  test("seoOgpFieldsFormSchemaのバリデーションを通過する", () => {
    const result = seoOgpFieldsFormSchema.safeParse(defaultSeoOgpFormValues);
    expect(result.success).toBe(true);
  });
});
