/**
 * 設定セクション用フォームスキーマ
 *
 * Server Action スキーマ（nullable）とは別に、フォーム入力用スキーマを定義。
 * フォームでは空文字列を許容し、送信時に emptyToNull で null に変換する。
 */
import { z } from "zod";
import {
  PostPermalinkStructure,
  TaxDisplayMode,
  TaxInputMode,
} from "@/shared/db/enums";

// =============================================================================
// ヘルパー
// =============================================================================

/** 空文字列 → null 変換（Server Action 送信前に使用） */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// =============================================================================
// Site > General > 基本情報
// =============================================================================

export const basicInfoFormSchema = z.object({
  siteName: z.string().max(100, { error: "100文字以内で入力してください" }),
  siteDescription: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  faviconUrl: z.string().max(500, { error: "500文字以内で入力してください" }),
  defaultOgpImageUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  headerLogoUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  footerLogoUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  footerCopyright: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
  useHeaderLogo: z.boolean(),
  useFooterLogo: z.boolean(),
});

export type BasicInfoFormInput = z.infer<typeof basicInfoFormSchema>;

// =============================================================================
// Site > General > 連絡先情報
// =============================================================================

export const contactInfoFormSchema = z.object({
  phoneNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  faxNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  email: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  address: z.string().max(500, { error: "500文字以内で入力してください" }),
  postalCode: z.string().max(10, { error: "10文字以内で入力してください" }),
  prefecture: z.string().max(10, { error: "10文字以内で入力してください" }),
  city: z.string().max(50, { error: "50文字以内で入力してください" }),
  streetAddress: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
  buildingName: z.string().max(100, { error: "100文字以内で入力してください" }),
});

export type ContactInfoFormInput = z.infer<typeof contactInfoFormSchema>;

// =============================================================================
// Site > General > パーマリンク設定
// =============================================================================

export const permalinkFormSchema = z.object({
  postPermalinkStructure: z.enum(PostPermalinkStructure),
  postUrlPrefixEnabled: z.boolean(),
});

export type PermalinkFormInput = z.infer<typeof permalinkFormSchema>;

// =============================================================================
// Site > Security > Turnstile
// =============================================================================

export const turnstileFormSchema = z.object({
  turnstileSiteKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  turnstileSecretKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type TurnstileFormInput = z.infer<typeof turnstileFormSchema>;

// =============================================================================
// Site > Security > Google Maps
// =============================================================================

export const googleMapsFormSchema = z.object({
  googleMapsApiKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type GoogleMapsFormInput = z.infer<typeof googleMapsFormSchema>;

// =============================================================================
// Site > Integrations > iCal フィード
// =============================================================================

export const icalFeedFormSchema = z.object({
  icalFeedEnabled: z.boolean(),
  icalFeedIncludeCustomerInfo: z.boolean(),
});

export type ICalFeedFormInput = z.infer<typeof icalFeedFormSchema>;

// =============================================================================
// Site > General > メンテナンス
// =============================================================================

export const maintenanceFormSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z
    .string()
    .max(1000, { error: "1000文字以内で入力してください" }),
});

export type MaintenanceFormInput = z.infer<typeof maintenanceFormSchema>;

// =============================================================================
// Site > Payment > 消費税
// =============================================================================

export const taxFormSchema = z.object({
  taxStandardRate: z.number().min(0).max(100),
  taxReducedRate: z.number().min(0).max(100),
  taxDisplayModeAdmin: z.enum(TaxDisplayMode),
  taxDisplayModePublic: z.enum(TaxDisplayMode),
  taxInputMode: z.enum(TaxInputMode),
});

export type TaxFormInput = z.infer<typeof taxFormSchema>;

// =============================================================================
// Site > Booking > 規約同意
// =============================================================================

export const termsAgreementFormSchema = z.object({
  termsAgreementEnabled: z.boolean(),
  termsAgreementText: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  requireTermsAgreement: z.boolean(),
  requirePrivacyAgreement: z.boolean(),
});

export type TermsAgreementFormInput = z.infer<typeof termsAgreementFormSchema>;
