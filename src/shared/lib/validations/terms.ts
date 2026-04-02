import { z } from "zod";
import { TermsType, TermsStatus } from "@generated/prisma/enums";
import { isValidTermsType } from "@/shared/lib/validations/enums/guards";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

/**
 * 文字列をTermsTypeに変換（無効な値はundefined）
 */
export function parseTermsType(value: unknown): TermsType | undefined {
  return isValidTermsType(value) ? value : undefined;
}

// ==============================================
// Constants
// ==============================================

/**
 * 規約タイプの選択肢（デフォルトタイトル・スラッグ付き）
 */
export const TERMS_TYPES = [
  {
    value: "TERMS_OF_USE",
    label: "利用規約",
    defaultTitle: "利用規約",
    defaultSlug: "terms-of-use",
  },
  {
    value: "PRIVACY_POLICY",
    label: "プライバシーポリシー",
    defaultTitle: "プライバシーポリシー",
    defaultSlug: "privacy-policy",
  },
  {
    value: "CANCELLATION",
    label: "キャンセルポリシー",
    defaultTitle: "キャンセルポリシー",
    defaultSlug: "cancellation-policy",
  },
  {
    value: "PAYMENT",
    label: "支払い規約",
    defaultTitle: "支払い規約",
    defaultSlug: "payment-terms",
  },
  {
    value: "CUSTOM",
    label: "カスタム規約",
    defaultTitle: "カスタム規約",
    defaultSlug: "custom-terms",
  },
] as const;

/**
 * 規約タイプからデフォルト値を取得
 */
export function getTermsTypeDefaults(
  type: string,
): { title: string; slug: string } | null {
  const found = TERMS_TYPES.find((t) => t.value === type);
  if (!found) return null;
  return { title: found.defaultTitle, slug: found.defaultSlug };
}

// ==============================================
// Terms Master Schemas
// ==============================================

/**
 * 規約作成スキーマ
 */
export const createTermsSchema = z.object({
  type: z.enum(TermsType),
  title: z
    .string()
    .min(1, { error: "タイトルを入力してください" })
    .max(100, { error: "タイトルは100文字以内で入力してください" }),
  slug: z
    .string()
    .min(1, { error: "スラッグを入力してください" })
    .max(50, { error: "スラッグは50文字以内で入力してください" })
    .regex(/^[a-z0-9-]+$/, {
      error: "スラッグは小文字英数字とハイフンのみ使用可能です",
    }),
  isActive: z.boolean().default(true),
});

/**
 * 規約更新スキーマ
 */
export const updateTermsSchema = createTermsSchema.partial();

export type CreateTermsInput = z.input<typeof createTermsSchema>;
export type UpdateTermsInput = z.input<typeof updateTermsSchema>;

// ==============================================
// Terms Version Schemas
// ==============================================

/**
 * 規約バージョン作成スキーマ
 */
export const createTermsVersionSchema = z.object({
  termsId: z.string().uuid({ error: "規約IDが無効です" }),
  contentJson: lexicalJsonSchema,
});

/**
 * 規約バージョン公開スキーマ
 */
export const publishTermsVersionSchema = z.object({
  versionId: z.string().uuid({ error: "バージョンIDが無効です" }),
});

/**
 * 規約バージョン更新スキーマ
 */
export const updateTermsVersionSchema = z.object({
  contentJson: lexicalJsonSchema,
});

export type CreateTermsVersionInput = z.input<typeof createTermsVersionSchema>;
export type PublishTermsVersionInput = z.input<
  typeof publishTermsVersionSchema
>;
export type UpdateTermsVersionInput = z.input<typeof updateTermsVersionSchema>;

// ==============================================
// Terms Agreement Schemas
// ==============================================

/**
 * 規約同意記録スキーマ
 */
export const recordTermsAgreementSchema = z.object({
  termsId: z.string().uuid({ error: "規約IDが無効です" }),
  versionId: z.string().uuid({ error: "バージョンIDが無効です" }),
  reservationId: z.string().uuid({ error: "予約IDが無効です" }).optional(),
  userId: z.string().uuid({ error: "ユーザーIDが無効です" }).optional(),
  guestName: z.string().optional(),
  guestEmail: z
    .string()
    .email({ error: "メールアドレスが無効です" })
    .optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export type RecordTermsAgreementInput = z.input<
  typeof recordTermsAgreementSchema
>;

// ==============================================
// Public API Schemas（予約フォーム用）
// ==============================================

/**
 * スペースの規約取得スキーマ
 */
export const getTermsForSpaceSchema = z.object({
  spaceId: z.string().uuid({ error: "スペースIDが無効です" }),
});

/**
 * 規約同意スキーマ（複数規約対応）
 */
export const agreeToTermsSchema = z.object({
  versionIds: z
    .array(z.string().uuid({ error: "バージョンIDが無効です" }))
    .min(1, { error: "規約に同意してください" }),
});

export type GetTermsForSpaceInput = z.input<typeof getTermsForSpaceSchema>;
export type AgreeToTermsInput = z.input<typeof agreeToTermsSchema>;

// ==============================================
// Response Types
// ==============================================

/**
 * 規約とその現在バージョンの型
 */
export interface TermsWithVersion {
  id: string;
  type: TermsType;
  title: string;
  slug: string;
  isActive: boolean;
  currentVersion: {
    id: string;
    version: number;
    contentHtml: string;
    contentJson: unknown;
    publishedAt: Date;
  } | null;
  _count: {
    spaces: number;
  };
}

/**
 * 規約とその現在バージョンの型（Client Component向けシリアライズ版）
 * DateをISO文字列に、Prisma enumを文字列に変換したもの
 */
export interface SerializedTermsWithVersion {
  id: string;
  type: string; // Prisma enumをプレーン文字列に変換
  title: string;
  slug: string;
  isActive: boolean;
  currentVersion: {
    id: string;
    version: number;
    contentHtml: string;
    publishedAt: string; // ISO 8601形式
  } | null;
}

/**
 * TermsWithVersionをシリアライズ（Server → Client Component受け渡し用）
 * Prisma enumとDateをプレーン値に変換
 */
export function serializeTermsWithVersion(
  terms: TermsWithVersion | null,
): SerializedTermsWithVersion | null {
  if (!terms) return null;

  return {
    id: terms.id,
    type: String(terms.type), // Prisma enumをプレーン文字列に変換
    title: terms.title,
    slug: terms.slug,
    isActive: terms.isActive,
    currentVersion: terms.currentVersion
      ? {
          id: terms.currentVersion.id,
          version: terms.currentVersion.version,
          contentHtml: terms.currentVersion.contentHtml,
          publishedAt: terms.currentVersion.publishedAt.toISOString(),
        }
      : null,
  };
}

/**
 * 規約詳細（管理画面用）
 */
export interface TermsDetail {
  id: string;
  type: TermsType;
  title: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  versions: {
    id: string;
    version: number;
    status: TermsStatus;
    publishedAt: Date | null;
    isCurrentVersion: boolean;
    createdAt: Date;
  }[];
  _count: {
    spaces: number;
    agreements: number;
  };
}

/**
 * 規約バージョン詳細
 */
export interface TermsVersionDetail {
  id: string;
  termsId: string;
  version: number;
  contentHtml: string;
  contentJson: unknown;
  status: TermsStatus;
  publishedAt: Date | null;
  publishedBy: string | null;
  isCurrentVersion: boolean;
  createdAt: Date;
  createdBy: string | null;
}

/**
 * 規約同意記録
 */
export interface TermsAgreementRecord {
  id: string;
  termsId: string;
  versionId: string;
  reservationId: string | null;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  agreedAt: Date;
  terms: {
    title: string;
    type: TermsType;
  };
  version: {
    version: number;
  };
}

/**
 * 管理画面での同意記録表示用（シリアライズ済み）
 */
export interface TermsAgreementItem {
  id: string;
  agreedAt: string; // ISO 8601
  version: number;
  guestName: string | null;
  guestEmail: string | null;
  userName: string | null;
  userEmail: string | null;
  reservationId: string | null;
  ipAddress: string | null; // 末尾マスク済み
}

export const termsAgreementItemSchema = z.object({
  id: z.string().uuid({ error: "同意記録IDが無効です" }),
  agreedAt: z.string().datetime({ error: "同意日時が無効です" }),
  version: z.number().int().positive({ error: "バージョン番号が無効です" }),
  guestName: z.string().nullable(),
  guestEmail: z
    .string()
    .email({ error: "メールアドレスが無効です" })
    .nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().email({ error: "メールアドレスが無効です" }).nullable(),
  reservationId: z.string().uuid({ error: "予約IDが無効です" }).nullable(),
  ipAddress: z.string().nullable(),
});

export const adminTermsAgreementsResponseSchema = z.object({
  agreements: z.array(termsAgreementItemSchema),
  total: z.number().int().nonnegative({ error: "件数が無効です" }),
});
