import { describe, expect, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { buildTermsSettingsFormData } from "@/admin/components/editor/inline/hooks/terms-settings-form-data";
import { termsSettingsFormSchema } from "@/admin/lib/validations/terms";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

describe("buildTermsSettingsFormData", () => {
  test("設定ダイアログ未マウント (container=null) でも DB 初期値の slug / title が載り、設定スキーマを success で通る", () => {
    // 保存済み規約を開いた直後。設定ダイアログを一度も開いていないので
    // `[data-settings-form-container]` は DOM に存在せず container は null。
    // values は conform の defaultValue (= toSettingsFormData(terms)) と同じ値。
    const formData = buildTermsSettingsFormData(null, {
      type: "terms-of-use",
      slug: "kiyaku",
      title: "利用規約",
      isPublished: true,
      scopes: [TermsScope.RESERVATION],
      changelog: "",
      showInFooter: true,
    });

    expect(formData.get("slug")).toBe("kiyaku");
    expect(formData.get("title")).toBe("利用規約");

    const submission = parseWithZod(formData, {
      schema: termsSettingsFormSchema,
    });
    expect(submission.status).toBe("success");
  });
});
