import { describe, test, expect } from "bun:test";
import {
  createPostSchema,
  updatePostBodySchema,
  updatePostSettingsSchema,
  postBodyFormSchema,
  postSettingsFormSchema,
  postCategorySchema,
  postTagSchema,
} from "@/admin/lib/validations/post";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import { PostStatus } from "@generated/prisma/enums";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

const VALID_LEXICAL_JSON = EMPTY_LEXICAL_EDITOR_STATE_JSON;

describe("createPostSchema", () => {
  const validBaseData = {
    title: "投稿記事タイトル",
    slug: "sample-post",
    excerpt: "記事の抜粋です",
    contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    thumbnailUrl: "https://example.com/image.jpg",
    categoryId: "123e4567-e89b-12d3-a456-426614174000",
    tags: [
      "123e4567-e89b-12d3-a456-426614174001",
      "123e4567-e89b-12d3-a456-426614174002",
    ],
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = createPostSchema.safeParse(validBaseData);
    expect(result.success).toBe(true);
  });

  test("タイトルが空の場合にエラー", () => {
    const invalidData = { ...validBaseData, title: "" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("タイトルは必須です");
    }
  });

  test("タイトルの最大長を超える場合にエラー", () => {
    const invalidData = { ...validBaseData, title: "あ".repeat(201) };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("200文字以内");
    }
  });

  test("スラッグが空の場合にエラー", () => {
    const invalidData = { ...validBaseData, slug: "" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("スラッグは必須です");
    }
  });

  test("スラッグに大文字を含む場合にエラー", () => {
    const invalidData = { ...validBaseData, slug: "Sample-Post" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("小文字英数字");
    }
  });

  test("スラッグにアンダースコアを含む場合にエラー", () => {
    const invalidData = { ...validBaseData, slug: "sample_post" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("抜粋が空の場合にエラー", () => {
    const invalidData = { ...validBaseData, excerpt: "" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("抜粋は必須です");
    }
  });

  test("抜粋の最大長を超える場合にエラー", () => {
    const invalidData = { ...validBaseData, excerpt: "あ".repeat(501) };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("500文字以内");
    }
  });

  test("サムネイルURLが空の場合にエラー", () => {
    const invalidData = { ...validBaseData, thumbnailUrl: "" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "サムネイルURLは必須です",
      );
    }
  });

  test("無効なカテゴリIDの場合にエラー", () => {
    const invalidData = { ...validBaseData, categoryId: "invalid-uuid" };
    const result = createPostSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "カテゴリを選択してください",
      );
    }
  });

  test("tagsフィールドはデフォルトで空配列", () => {
    const data: Record<string, unknown> = { ...validBaseData };
    delete data["tags"];
    const result = createPostSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  test("contentJson に空の Lexical 初期状態を渡せる", () => {
    const result = createPostSchema.safeParse(validBaseData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentJson).toBe(EMPTY_LEXICAL_EDITOR_STATE_JSON);
    }
  });

  test("作成時のレイアウト設定を受け取れる", () => {
    const result = createPostSchema.safeParse({
      ...validBaseData,
      contentWidth: LayoutWidth.CUSTOM,
      contentWidthCustom: 960,
    });

    expect(result.success).toBe(true);
  });
});

describe("updatePostBodySchema", () => {
  test("有効な Lexical JSON でバリデーションに成功する", () => {
    const result = updatePostBodySchema.safeParse({
      contentJson: VALID_LEXICAL_JSON,
    });
    expect(result.success).toBe(true);
  });

  test("本文が空の場合にエラー", () => {
    const result = updatePostBodySchema.safeParse({ contentJson: "" });
    expect(result.success).toBe(false);
  });

  test("無効な Lexical JSON はエラー", () => {
    const result = updatePostBodySchema.safeParse({
      contentJson: "<p>記事本文</p>",
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePostSettingsSchema", () => {
  const validBaseData = {
    title: "投稿記事タイトル",
    slug: "sample-post",
    excerpt: "記事の抜粋です",
    thumbnailUrl: "https://example.com/image.jpg",
    categoryId: "123e4567-e89b-12d3-a456-426614174000",
    tags: [
      "123e4567-e89b-12d3-a456-426614174001",
      "123e4567-e89b-12d3-a456-426614174002",
    ],
    status: PostStatus.DRAFT,
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = updatePostSettingsSchema.safeParse(validBaseData);
    expect(result.success).toBe(true);
  });

  test("contentWidth フィールドを許可", () => {
    const validData = { ...validBaseData, contentWidth: LayoutWidth.LG };
    const result = updatePostSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("publishedAt フィールドを受け取れる", () => {
    const validData = { ...validBaseData, publishedAt: "2026-01-01T10:00" };
    const result = updatePostSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidth に null を許可", () => {
    const validData = { ...validBaseData, contentWidth: null };
    const result = updatePostSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidthCustom の範囲チェック", () => {
    const validData = { ...validBaseData, contentWidthCustom: 1200 };
    const result = updatePostSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("contentWidthCustom が最小値未満の場合にエラー", () => {
    const invalidData = { ...validBaseData, contentWidthCustom: 319 };
    const result = updatePostSettingsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("contentWidthCustom が最大値超過の場合にエラー", () => {
    const invalidData = { ...validBaseData, contentWidthCustom: 1921 };
    const result = updatePostSettingsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("SEO/OGP フィールドはオプショナル", () => {
    const result = updatePostSettingsSchema.safeParse(validBaseData);
    expect(result.success).toBe(true);
  });
});

describe("postBodyFormSchema", () => {
  test("有効な contentJson でバリデーションに成功する", () => {
    const result = postBodyFormSchema.safeParse({
      contentJson: VALID_LEXICAL_JSON,
    });
    expect(result.success).toBe(true);
  });

  test("不正な contentJson はエラー", () => {
    const result = postBodyFormSchema.safeParse({
      contentJson: "<p>not-lexical-json</p>",
    });
    expect(result.success).toBe(false);
  });
});

describe("postSettingsFormSchema", () => {
  const validFormData = {
    title: "投稿記事タイトル",
    slug: "sample-post",
    excerpt: "記事の抜粋です",
    thumbnailUrl: "https://example.com/image.jpg",
    categoryId: "123e4567-e89b-12d3-a456-426614174000",
    tags: [],
    status: PostStatus.DRAFT,
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = postSettingsFormSchema.safeParse(validFormData);
    expect(result.success).toBe(true);
  });

  test("status フィールドは必須", () => {
    const invalidData: Record<string, unknown> = { ...validFormData };
    delete invalidData["status"];
    const result = postSettingsFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("すべての PostStatus 値を許可", () => {
    const statuses = [
      PostStatus.DRAFT,
      PostStatus.PUBLISHED,
      PostStatus.ARCHIVED,
    ];
    statuses.forEach((status) => {
      const data = { ...validFormData, status };
      const result = postSettingsFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  test("tags フィールドは UUID 配列として受け取る", () => {
    const data = {
      ...validFormData,
      tags: ["123e4567-e89b-12d3-a456-426614174001"],
    };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("tags フィールドは JSON 文字列も配列に変換する（FormData transit）", () => {
    const data = {
      ...validFormData,
      tags: JSON.stringify(["123e4567-e89b-12d3-a456-426614174001"]),
    };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([
        "123e4567-e89b-12d3-a456-426614174001",
      ]);
    }
  });

  test("tags フィールドは重複を拒否する", () => {
    const data = {
      ...validFormData,
      tags: [
        "123e4567-e89b-12d3-a456-426614174001",
        "123e4567-e89b-12d3-a456-426614174001",
      ],
    };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("categoryId は UUID 必須", () => {
    const data = { ...validFormData, categoryId: "not-a-uuid" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("publishedAt フィールドはオプショナル", () => {
    const result = postSettingsFormSchema.safeParse(validFormData);
    expect(result.success).toBe(true);
  });

  test("publishedAt は datetime-local 形式を受け取る", () => {
    const data = { ...validFormData, publishedAt: "2026-01-01T10:00" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("publishedAt の空文字列は許可", () => {
    const data = { ...validFormData, publishedAt: "" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("contentWidth フィールドは LayoutWidth 値を受け取る", () => {
    const data = { ...validFormData, contentWidth: "LG" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentWidth).toBe(LayoutWidth.LG);
    }
  });

  test("contentWidth の空文字列は null に変換", () => {
    const data = { ...validFormData, contentWidth: "" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentWidth).toBeNull();
    }
  });

  test("contentWidthCustom フィールドは文字列を数値に変換する", () => {
    const data = { ...validFormData, contentWidthCustom: "1200" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentWidthCustom).toBe(1200);
    }
  });

  test("contentWidthCustom が範囲外の場合エラー", () => {
    const data = { ...validFormData, contentWidthCustom: "100" };
    const result = postSettingsFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("postCategorySchema", () => {
  const validCategoryData = {
    name: "お知らせ",
    slug: "news",
    description: "お知らせカテゴリ",
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = postCategorySchema.safeParse(validCategoryData);
    expect(result.success).toBe(true);
  });

  test("カテゴリ名が空の場合にエラー", () => {
    const invalidData = { ...validCategoryData, name: "" };
    const result = postCategorySchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("カテゴリ名は必須です");
    }
  });

  test("カテゴリ名の最大長を超える場合にエラー", () => {
    const invalidData = { ...validCategoryData, name: "あ".repeat(51) };
    const result = postCategorySchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("スラッグに大文字を含む場合にエラー", () => {
    const invalidData = { ...validCategoryData, slug: "News" };
    const result = postCategorySchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("小文字英数字");
    }
  });

  test("説明の最大長を超える場合にエラー", () => {
    const invalidData = { ...validCategoryData, description: "あ".repeat(501) };
    const result = postCategorySchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("order は schema に含まれない（システム管理）", () => {
    const result = postCategorySchema.safeParse(validCategoryData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("order" in result.data).toBe(false);
    }
  });

  test("SEOフィールドはオプショナルでnullを許可", () => {
    const validData = {
      ...validCategoryData,
      metaTitle: null,
      metaDescription: null,
      ogpImageUrl: null,
    };
    const result = postCategorySchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("ogpImageUrlに空文字列を許可", () => {
    const validData = { ...validCategoryData, ogpImageUrl: "" };
    const result = postCategorySchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe("postTagSchema", () => {
  const validTagData = {
    name: "新着",
    slug: "new",
    description: "新着タグ",
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = postTagSchema.safeParse(validTagData);
    expect(result.success).toBe(true);
  });

  test("タグ名が空の場合にエラー", () => {
    const invalidData = { ...validTagData, name: "" };
    const result = postTagSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("タグ名は必須です");
    }
  });

  test("タグ名の最大長を超える場合にエラー", () => {
    const invalidData = { ...validTagData, name: "あ".repeat(51) };
    const result = postTagSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("スラッグに大文字を含む場合にエラー", () => {
    const invalidData = { ...validTagData, slug: "New" };
    const result = postTagSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("小文字英数字");
    }
  });

  test("説明の最大長を超える場合にエラー", () => {
    const invalidData = { ...validTagData, description: "あ".repeat(501) };
    const result = postTagSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("SEOフィールドはオプショナルでnullを許可", () => {
    const validData = {
      ...validTagData,
      metaTitle: null,
      metaDescription: null,
      ogpImageUrl: null,
    };
    const result = postTagSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("ogpImageUrlに空文字列を許可", () => {
    const validData = { ...validTagData, ogpImageUrl: "" };
    const result = postTagSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});
