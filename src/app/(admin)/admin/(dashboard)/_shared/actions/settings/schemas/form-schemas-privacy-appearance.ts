/**
 * 設定セクション用フォームスキーマ — Cookie・外観（ヘッダー/フッター/サイドバー/レイアウト）
 */
import { z } from "zod";
import {
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  LayoutWidth,
} from "@/shared/lib/validations/enums/prisma-types";
import { sidebarWidgetsSchema } from "@/shared/lib/validations/sidebar";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > Privacy > Cookie同意設定
// =============================================================================

export const cookieConsentFormSchema = z.object({
  cookieConsentEnabled: switchBoolean(),
  cookieConsentMessage: optionalText(1000),
  cookieConsentAcceptText: optionalText(50),
  cookieConsentRejectText: optionalText(50),
  cookieConsentPolicyUrl: optionalText(200),
});

export type CookieConsentFormInput = z.infer<typeof cookieConsentFormSchema>;

// =============================================================================
// Site > Appearance > ヘッダー設定
// =============================================================================

export const headerFormSchema = z.object({
  headerScrollBehavior: z.enum(HeaderScrollBehavior),
  headerBackgroundMode: z.enum(HeaderBackgroundMode),
});

export type HeaderFormInput = z.infer<typeof headerFormSchema>;

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
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerContactLabel: z
    .string({ error: "必須です" })
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerHoursLabel: z
    .string({ error: "必須です" })
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerShowSocialLinks: switchBoolean(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
    error: "有効なHEXカラーコードを入力してください（例: #fafafa）",
  }),
});

export type FooterFormInput = z.infer<typeof footerFormSchema>;

// =============================================================================
// Site > Appearance > サイドバー設定
// =============================================================================

export const sidebarFormSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: sidebarWidgetsSchema,
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
  sidebarTocEnabled: z.boolean(),
});

export type SidebarFormInput = z.infer<typeof sidebarFormSchema>;

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
