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

const settingsExpectedUpdatedAtSchema = z.iso.datetime({
  error: "更新バージョンが不正です。ページを再読み込みしてください",
});

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
      .trim()
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
  expectedUpdatedAt: settingsExpectedUpdatedAtSchema,
});

export type FooterFormInput = z.infer<typeof footerFormSchema>;

// =============================================================================
// Site > Appearance > レイアウト設定
// =============================================================================

export const layoutFormSchema = z
  .object({
    containerWidth: z.enum(LayoutWidth),
    // CUSTOM 選択時のみ使用。非 CUSTOM では空欄で送られるため optional。
    containerWidthCustom: z.string().optional(),
    contentWidth: z.enum(LayoutWidth),
    contentWidthCustom: z.string().optional(),
    expectedUpdatedAt: settingsExpectedUpdatedAtSchema,
  })
  .superRefine((data, ctx) => {
    if (data.containerWidth === LayoutWidth.CUSTOM) {
      const raw = data.containerWidthCustom?.trim() ?? "";
      if (!raw) {
        ctx.addIssue({
          code: "custom",
          path: ["containerWidthCustom"],
          message: "カスタム幅を入力してください",
        });
      } else {
        const parsed = Number.parseInt(raw, 10);
        if (
          Number.isNaN(parsed) ||
          parsed < 320 ||
          parsed > 2560 ||
          String(parsed) !== raw
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["containerWidthCustom"],
            message: "320px〜2560pxの範囲で入力してください",
          });
        }
      }
    }

    if (data.contentWidth === LayoutWidth.CUSTOM) {
      const raw = data.contentWidthCustom?.trim() ?? "";
      if (!raw) {
        ctx.addIssue({
          code: "custom",
          path: ["contentWidthCustom"],
          message: "カスタム幅を入力してください",
        });
      } else {
        const parsed = Number.parseInt(raw, 10);
        if (
          Number.isNaN(parsed) ||
          parsed < 320 ||
          parsed > 1920 ||
          String(parsed) !== raw
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["contentWidthCustom"],
            message: "320px〜1920pxの範囲で入力してください",
          });
        }
      }
    }
  });

export type LayoutFormInput = z.infer<typeof layoutFormSchema>;
