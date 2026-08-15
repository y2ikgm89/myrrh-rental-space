import { describe, expect, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { buildNewsSettingsFormData } from "@/admin/components/editor/inline/hooks/news-settings-form-data";
import { newsSettingsFormSchema } from "@/admin/lib/validations/news";

describe("buildNewsSettingsFormData", () => {
  test("設定ダイアログ未マウント (container=null) でも DB 初期値の slug / title が載り、設定スキーマを success で通る", () => {
    // 保存済みお知らせを開いた直後。設定ダイアログを一度も開いていないので
    // `[data-settings-form-container]` は DOM に存在せず container は null。
    // values は conform の defaultValue (= toSettingsFormData(news)) と同じ値。
    const formData = buildNewsSettingsFormData(null, {
      slug: "oshirase",
      title: "お知らせ",
      isPublished: true,
      publishedAt: "",
      contentWidth: "",
      contentWidthCustom: "",
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      ogpImageUrl: "",
    });

    expect(formData.get("slug")).toBe("oshirase");
    expect(formData.get("title")).toBe("お知らせ");

    const submission = parseWithZod(formData, {
      schema: newsSettingsFormSchema,
    });
    expect(submission.status).toBe("success");
  });
});
