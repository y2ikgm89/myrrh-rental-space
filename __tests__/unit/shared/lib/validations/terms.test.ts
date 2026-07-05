import { describe, it, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  TERMS_CONTENT_WIDTH,
  termsFormSchema,
} from "@/shared/lib/validations/terms";
import { termsSettingsFormSchema } from "@/admin/lib/validations/terms";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import {
  resolveWidthStyles,
  CONTENT_WIDTH_PRESETS,
} from "@/shared/lib/styles/layout-mapper";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("TERMS_CONTENT_WIDTH — editor ↔ public WYSIWYG consistency", () => {
  it("is a fixed bounded preset (not FULL/CUSTOM) so the editor body matches the published page", () => {
    // 規約は固定 MD 幅で描画する設計。FULL/CUSTOM だと px が null になり、
    // エディタへ渡す contentWidth が undefined = full-width 表示になって
    // 公開ページ (MD=800px) と WYSIWYG がズレる。
    expect(TERMS_CONTENT_WIDTH).toBe(LayoutWidth.MD);

    const px = resolveWidthStyles({
      width: TERMS_CONTENT_WIDTH,
      customPx: null,
    }).px;

    expect(px).not.toBeNull();
    expect(px).toBe(CONTENT_WIDTH_PRESETS[TERMS_CONTENT_WIDTH].px);
  });
});

describe("termsFormSchema clean-break contract", () => {
  const validInput = {
    type: "privacy-policy",
    slug: "privacy-policy",
    title: "プライバシーポリシー",
    contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    isPublished: true,
    scopes: [],
    changelog: null,
    showInFooter: true,
  };

  it("accepts the current mutation contract", () => {
    expect(termsFormSchema.safeParse(validInput).success).toBe(true);
  });

  it.each([
    ["displayOrder", { displayOrder: 10 }],
    ["footerOrder", { footerOrder: 10 }],
  ])("rejects legacy %s input", (_field, extra) => {
    const result = termsFormSchema.safeParse({
      ...validInput,
      ...extra,
    });
    expect(result.success).toBe(false);
  });
});

describe("termsSettingsFormSchema clean-break contract", () => {
  const validInput = {
    type: "privacy-policy",
    slug: "privacy-policy",
    title: "プライバシーポリシー",
    isPublished: true,
    scopes: [],
    changelog: null,
    showInFooter: true,
  };

  it("accepts the current settings contract", () => {
    expect(termsSettingsFormSchema.safeParse(validInput).success).toBe(true);
  });

  it.each([
    ["displayOrder", { displayOrder: 10 }],
    ["footerOrder", { footerOrder: 10 }],
  ])("rejects legacy %s object input", (_field, extra) => {
    const result = termsSettingsFormSchema.safeParse({
      ...validInput,
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["displayOrder", "10"],
    ["footerOrder", "10"],
  ])("rejects legacy %s FormData input", (field, value) => {
    const submission = parseWithZod(
      form({
        type: "privacy-policy",
        slug: "privacy-policy",
        title: "プライバシーポリシー",
        isPublished: "on",
        changelog: "",
        showInFooter: "on",
        [field]: value,
      }),
      { schema: termsSettingsFormSchema },
    );

    expect(submission.status).toBe("error");
  });
});
