/**
 * 設定セクション用フォームスキーマ
 *
 * Server Action スキーマ（nullable）とは別に、フォーム入力用スキーマを定義。
 * フォームでは空文字列を許容し、送信時に emptyToNull で null に変換する。
 */
import { z } from "zod";

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
