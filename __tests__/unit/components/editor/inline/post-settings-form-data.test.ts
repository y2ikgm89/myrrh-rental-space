import { describe, expect, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { buildPostSettingsFormData } from "@/admin/components/editor/inline/hooks/post-settings-form-data";
import { postSettingsFormSchema } from "@/admin/lib/validations/post";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";

describe("buildPostSettingsFormData", () => {
  test("設定ダイアログ未マウント (container=null) でも DB 初期値の slug / title が載り、設定スキーマを success で通る", () => {
    // 保存済み投稿を開いた直後。設定ダイアログを一度も開いていないので
    // `[data-settings-form-container]` は DOM に存在せず container は null。
    // values は conform の defaultValue (= toSettingsFormData(post)) と同じ値。
    const formData = buildPostSettingsFormData(null, {
      title: "ブログ記事",
      slug: "blog-post",
      excerpt: "保存済み投稿の抜粋",
      thumbnailUrl: "https://example.com/t.jpg",
      ogpImageUrl: "",
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
      tags: [],
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      status: PostStatus.DRAFT,
      publishedAt: "",
      contentWidth: "",
      contentWidthCustom: "",
    });

    expect(formData.get("slug")).toBe("blog-post");
    expect(formData.get("title")).toBe("ブログ記事");

    const submission = parseWithZod(formData, {
      schema: postSettingsFormSchema,
    });
    expect(submission.status).toBe("success");
  });
});
