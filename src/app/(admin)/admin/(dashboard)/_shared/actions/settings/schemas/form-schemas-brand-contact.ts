/**
 * 設定セクション用フォームスキーマ — サイト一般（基本・連絡先・パーマリンク・メンテ・事業者）
 *
 * 任意テキストは {@link optionalText}、Switch 由来 boolean は {@link switchBoolean} を使う
 * （conform の空→undefined 変換に整合させ「空欄保存 / OFF 保存」を許容する）。
 */
import { z } from "zod";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > General > 基本情報
// =============================================================================

export const basicInfoFormSchema = z.object({
  siteName: optionalText(100),
  siteDescription: optionalText(500),
  faviconUrl: optionalText(500),
  defaultOgpImageUrl: optionalText(500),
  headerLogoUrl: optionalText(500),
  footerLogoUrl: optionalText(500),
  footerCopyright: optionalText(200),
  useHeaderLogo: switchBoolean(),
  useFooterLogo: switchBoolean(),
});

export type BasicInfoFormInput = z.infer<typeof basicInfoFormSchema>;

// =============================================================================
// Site > General > 連絡先情報
// =============================================================================

// 連絡先も全項目任意。conform の空→undefined 変換に合わせ `.optional()` 必須
// （businessInfoFormSchema のコメント参照）。empty は emptyToNull で null 化。
export const contactInfoFormSchema = z.object({
  phoneNumber: z
    .string()
    .max(20, { error: "20文字以内で入力してください" })
    .optional(),
  faxNumber: z
    .string()
    .max(20, { error: "20文字以内で入力してください" })
    .optional(),
  email: z
    .union([
      z.email({ error: "有効なメールアドレスを入力してください" }).max(100),
      z.literal(""),
    ])
    .optional(),
  postalCode: z
    .string()
    .max(10, { error: "10文字以内で入力してください" })
    .optional(),
  prefecture: z
    .string()
    .max(10, { error: "10文字以内で入力してください" })
    .optional(),
  city: z
    .string()
    .max(50, { error: "50文字以内で入力してください" })
    .optional(),
  streetAddress: z
    .string()
    .max(100, { error: "100文字以内で入力してください" })
    .optional(),
  buildingName: z
    .string()
    .max(100, { error: "100文字以内で入力してください" })
    .optional(),
});

export type ContactInfoFormInput = z.infer<typeof contactInfoFormSchema>;

// =============================================================================
// Site > General > メンテナンス
// =============================================================================

export const maintenanceFormSchema = z.object({
  maintenanceMode: switchBoolean(),
  maintenanceMessage: optionalText(1000),
});

export type MaintenanceFormInput = z.infer<typeof maintenanceFormSchema>;

// =============================================================================
// Site > General > 事業者情報
// =============================================================================

// conform の `parseWithZod` は空入力を `undefined` に変換する（空文字 "" は届かない）。
// 事業者情報は全項目が任意（個人事業主は法人番号・インボイス登録番号を持たない等）の
// ため `.optional()` で undefined を許容する。required な `z.string()` のままだと空欄
// 保存が「expected string, received undefined」で全項目弾かれる。
// 空入力は server action 側の `emptyToNull(undefined) → null` で永続化される。
export const businessInfoFormSchema = z.object({
  businessName: z
    .string()
    .max(100, { error: "100文字以内で入力してください" })
    .optional(),
  businessNameKana: z
    .string()
    .max(100, { error: "100文字以内で入力してください" })
    .optional(),
  representativeName: z
    .string()
    .max(50, { error: "50文字以内で入力してください" })
    .optional(),
  businessType: z.string().max(50).optional(),
  industryType: z.string().max(50).optional(),
  establishedDate: z.string().optional(),
  registrationNumber: z
    .string()
    .max(50, { error: "50文字以内で入力してください" })
    .optional(),
  invoiceNumber: z
    .string()
    .max(20, { error: "20文字以内で入力してください" })
    .optional(),
  businessDescription: z
    .string()
    .max(2000, { error: "2000文字以内で入力してください" })
    .optional(),
});

export type BusinessInfoFormInput = z.infer<typeof businessInfoFormSchema>;
