/**
 * 設定セクション用フォームスキーマ — サイト一般（基本・連絡先・パーマリンク・メンテ・事業者）
 */
import { z } from "zod";
import { PostPermalinkStructure } from "@/shared/lib/validations/enums/prisma-types";

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
    z.email({ error: "有効なメールアドレスを入力してください" }).max(100),
    z.literal(""),
  ]),
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
});

export type PermalinkFormInput = z.infer<typeof permalinkFormSchema>;

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
// Site > General > 事業者情報
// =============================================================================

export const businessInfoFormSchema = z.object({
  businessName: z.string().max(100, { error: "100文字以内で入力してください" }),
  businessNameKana: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
  representativeName: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  businessType: z.string().max(50),
  industryType: z.string().max(50),
  establishedDate: z.string(),
  registrationNumber: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  invoiceNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  businessDescription: z
    .string()
    .max(2000, { error: "2000文字以内で入力してください" }),
});

export type BusinessInfoFormInput = z.infer<typeof businessInfoFormSchema>;
