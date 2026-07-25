/**
 * 設定セクション用フォームスキーマ — Cookie・外観（フッター/サイドバー/レイアウト）
 *
 * ヘッダー設定は canonical な `headerSettingsSchema`（`./basic`）に統合済み。
 * 二重メンテ回避のため client から basic.ts の `xxxSettingsSchema` を直接 import する。
 */
import { z } from "zod";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import { isHttpOrInternalPublicHref } from "@/shared/lib/url/safe-href";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > Privacy > Cookie同意設定
// =============================================================================

export const cookieConsentFormSchema = z.object({
  cookieConsentEnabled: switchBoolean(),
  cookieConsentMessage: optionalText(1000),
  cookieConsentAcceptText: optionalText(50),
  cookieConsentRejectText: optionalText(50),
  cookieConsentPolicyUrl: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z
      .string()
      .max(200, { error: "200文字以内で入力してください" })
      .optional()
      .refine(
        (value) => value === undefined || isHttpOrInternalPublicHref(value),
        {
          error:
            "プライバシーポリシーURLは / から始まるパス、または http(s) の URL を指定してください（javascript: 等は不可）",
        },
      ),
  ),
});

export type CookieConsentFormInput = z.infer<typeof cookieConsentFormSchema>;

// =============================================================================
// Site > Appearance > フッター設定
// =============================================================================

export const footerFormSchema = z.object({
  // 任意（空欄可）
  footerTagline: optionalText(200),
  // ナビ/連絡先/営業時間の見出しラベルは必須（domain は非 null `string`）。
  // conform は空欄を undefined 化するため、明示的な必須メッセージを与える。
  footerNavigationLabel: z
    .string({ error: "必須です" })
    .trim()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerContactLabel: z
    .string({ error: "必須です" })
    .trim()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerHoursLabel: z
    .string({ error: "必須です" })
    .trim()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerShowSocialLinks: switchBoolean(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
    error: "有効なHEXカラーコードを入力してください（例: #fafafa）",
  }),
});

export type FooterFormInput = z.infer<typeof footerFormSchema>;

// =============================================================================
// Site > Appearance > レイアウト設定
// =============================================================================

export const layoutFormSchema = z.object({
  containerWidth: z.enum(LayoutWidth),
  // CUSTOM 選択時のみ使用。非 CUSTOM では空欄で送られるため optional。
  containerWidthCustom: z.string().optional(),
  contentWidth: z.enum(LayoutWidth),
  contentWidthCustom: z.string().optional(),
});

export type LayoutFormInput = z.infer<typeof layoutFormSchema>;
