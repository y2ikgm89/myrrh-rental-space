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

// =============================================================================
// Site > Privacy > Cookie同意設定
// =============================================================================

export const cookieConsentFormSchema = z.object({
  cookieConsentEnabled: z.boolean(),
  cookieConsentMessage: z
    .string()
    .max(1000, { error: "1000文字以内で入力してください" }),
  cookieConsentAcceptText: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  cookieConsentRejectText: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  cookieConsentPolicyUrl: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
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
  footerTagline: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
  footerNavigationLabel: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  footerContactLabel: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  footerHoursLabel: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  footerShowSocialLinks: z.boolean(),
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
  containerWidthCustom: z.string(),
  contentWidth: z.enum(LayoutWidth),
  contentWidthCustom: z.string(),
});

export type LayoutFormInput = z.infer<typeof layoutFormSchema>;
