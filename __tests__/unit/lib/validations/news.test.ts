import { describe, test, expect } from "bun:test";
import {
  newsSlugSchema,
  createNewsSchema,
  updateNewsBodySchema,
  updateNewsSettingsSchema,
  newsBodyFormSchema,
  newsSettingsFormSchema,
} from "@/admin/lib/validations/news";
import { LayoutWidth } from "@/shared/types/prisma";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

const VALID_LEXICAL_JSON = EMPTY_LEXICAL_EDITOR_STATE_JSON;

describe("newsSlugSchema", () => {
  test("有効なスラッグでバリデーションに成功する", () => {
    const validSlugs = ["news-123", "my-article", "test-123-abc"];

    validSlugs.forEach((slug) => {
      const result = newsSlugSchema.safeParse(slug);
      expect(result.success).toBe(true);
    });
  });

  test("スラッグが空の場合にエラー", () => {
    const result = newsSlugSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "スラッグを入力してください",
      );
    }
  });

  test("スラッグの最大長を超える場合にエラー", () => {
    const longSlug = "a".repeat(101);
    const result = newsSlugSchema.safeParse(longSlug);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("100文字以内");
    }
  });

  test("大文字を含む場合にエラー", () => {
    const result = newsSlugSchema.safeParse("News-Article");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("小文字英数字");
    }
  });

  test("アンダースコアを含む場合にエラー", () => {
    const result = newsSlugSchema.safeParse("news_article");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("小文字英数字");
    }
  });

  test("特殊文字を含む場合にエラー", () => {
    const result = newsSlugSchema.safeParse("news@article");
    expect(result.success).toBe(false);
  });

  test("日本語を含む場合にエラー", () => {
    const result = newsSlugSchema.safeParse("ニュース");
    expect(result.success).toBe(false);
  });
});

describe("createNewsSchema", () => {
  test("有効なデータでバリデーションに成功する", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      contentJson: VALID_LEXICAL_JSON,
    };

    const result = createNewsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("タイトルが空の場合にエラー", () => {
    const invalidData = {
      slug: "sample-news",
      title: "",
      contentJson: VALID_LEXICAL_JSON,
    };

    const result = createNewsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("タイトルは必須です");
    }
  });

  test("タイトルの最大長を超える場合にエラー", () => {
    const invalidData = {
      slug: "sample-news",
      title: "あ".repeat(201),
      contentJson: VALID_LEXICAL_JSON,
    };

    const result = createNewsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("200文字以内");
    }
  });

  test("contentJson 省略時はエラー", () => {
    const data = {
      slug: "sample-news",
      title: "サンプルニュース",
    };

    const result = createNewsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("updateNewsBodySchema", () => {
  test("有効な Lexical JSON でバリデーションに成功する", () => {
    const result = updateNewsBodySchema.safeParse({
      contentJson: VALID_LEXICAL_JSON,
    });
    expect(result.success).toBe(true);
  });

  test("本文が空の場合にエラー", () => {
    const result = updateNewsBodySchema.safeParse({ contentJson: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateNewsSettingsSchema", () => {
  test("有効なデータでバリデーションに成功する", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: true,
      contentWidth: LayoutWidth.LG,
      contentWidthCustom: 1200,
      metaDescription: "ニュースの概要",
      metaKeywords: "ニュース, お知らせ",
      ogpTitle: "OGPタイトル",
      ogpDescription: "OGP説明",
      ogpImageUrl: "https://example.com/image.jpg",
    };

    const result = updateNewsSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidth に null を許可", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: false,
      contentWidth: null,
    };

    const result = updateNewsSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidthCustom の範囲チェック", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: false,
      contentWidthCustom: 1200,
    };

    const result = updateNewsSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidthCustom が最小値未満の場合にエラー", () => {
    const invalidData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: false,
      contentWidthCustom: 319,
    };

    const result = updateNewsSettingsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("contentWidthCustom が最大値超過の場合にエラー", () => {
    const invalidData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: false,
      contentWidthCustom: 1921,
    };

    const result = updateNewsSettingsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("SEO/OGP フィールドはオプショナル", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: false,
    };

    const result = updateNewsSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe("newsBodyFormSchema", () => {
  test("有効な本文でバリデーションに成功する", () => {
    const result = newsBodyFormSchema.safeParse({
      contentJson: VALID_LEXICAL_JSON,
    });
    expect(result.success).toBe(true);
  });

  test("本文が空の場合にエラー", () => {
    const result = newsBodyFormSchema.safeParse({ contentJson: "" });
    expect(result.success).toBe(false);
  });
});

describe("newsSettingsFormSchema", () => {
  test("有効なデータでバリデーションに成功する", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: true,
      publishedAt: "2026-01-01T00:00:00Z",
      contentWidth: "LG",
      contentWidthCustom: "1200",
      metaDescription: "ニュースの概要",
      metaKeywords: "ニュース, お知らせ",
      ogpTitle: "OGPタイトル",
      ogpDescription: "OGP説明",
      ogpImageUrl: "https://example.com/image.jpg",
    };

    const result = newsSettingsFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("isPublished フィールドは必須", () => {
    const invalidData = {
      slug: "sample-news",
      title: "サンプルニュース",
    };

    const result = newsSettingsFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("publishedAt フィールドはオプショナル", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: false,
    };

    const result = newsSettingsFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidth フィールドは文字列として受け取る", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: true,
      contentWidth: "SM",
    };

    const result = newsSettingsFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidthCustom フィールドは文字列として受け取る", () => {
    const validData = {
      slug: "sample-news",
      title: "サンプルニュース",
      isPublished: true,
      contentWidthCustom: "1200",
    };

    const result = newsSettingsFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});
