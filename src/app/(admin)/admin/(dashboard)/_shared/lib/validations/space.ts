import { z } from "zod";
import {
  seoOgpFieldsSchema,
  defaultSeoOgpValues,
} from "@/shared/lib/validations/seo";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/db/enums";

/**
 * スペースフォーム用バリデーションスキーマ
 *
 * クライアント・サーバー両方で使用
 */

/**
 * 画像URL配列のバリデーション
 */
const imageUrlsSchema = z
  .array(z.string().url({ error: "有効なURLを入力してください" }))
  .max(10, { error: "画像は最大10枚までです" })
  .default([]);

/**
 * 設備タグ配列のバリデーション
 */
const facilitiesSchema = z.array(z.string().min(1).max(50)).default([]);

/**
 * スペース割引タイプ
 */
export const spaceDiscountTypeSchema = z.enum(DiscountType);

/**
 * 長時間割引オーバーライド設定
 */
export const durationDiscountOverrideSchema = z.enum(DurationDiscountOverride);

/**
 * スペース作成・編集フォームスキーマ
 */
/**
 * スラッグのバリデーション
 */
export const spaceSlugSchema = z
  .string()
  .min(1, { error: "スラッグを入力してください" })
  .max(100, { error: "スラッグは100文字以内で入力してください" })
  .regex(/^[a-z0-9-]+$/, {
    error: "スラッグは小文字英数字とハイフンのみ使用可能です",
  });

/**
 * スペース作成・編集フォームスキーマ
 */
export const spaceFormSchema = z
  .object({
    slug: spaceSlugSchema,
    name: z
      .string()
      .min(1, { error: "名前を入力してください" })
      .max(100, { error: "名前は100文字以内で入力してください" }),
    description: z
      .string()
      .min(1, { error: "説明を入力してください" })
      .min(10, { error: "説明は10文字以上で入力してください" }),
    addressDetail: z
      .string()
      .max(500, { error: "所在地補足は500文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    access: z
      .string()
      .max(500, { error: "アクセス情報は500文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    capacity: z
      .number()
      .int({ error: "整数を入力してください" })
      .min(1, { error: "定員は1以上で入力してください" })
      .max(1000, { error: "定員は1000以下で入力してください" }),
    area: z
      .number()
      .positive({ error: "正の数を入力してください" })
      .max(10000, { error: "面積は10000以下で入力してください" })
      .optional()
      .nullable(),
    hourlyPrice: z
      .number()
      .min(0, { error: "時間料金は0以上で入力してください" })
      .max(1000000, { error: "時間料金は1000000以下で入力してください" }),
    dailyPrice: z
      .number()
      .min(0, { error: "日額料金は0以上で入力してください" })
      .max(10000000, { error: "日額料金は10000000以下で入力してください" })
      .optional()
      .nullable(),
    mainImageUrl: z
      .string()
      .min(1, { error: "メイン画像URLを入力してください" })
      .url({ error: "有効なURLを入力してください" }),
    imageUrls: imageUrlsSchema,
    facilities: facilitiesSchema,
    isPublished: z.boolean().default(false),
    termsId: z
      .string()
      .uuid({ error: "利用規約IDが無効です" })
      .optional()
      .nullable(),
    locationId: z
      .string()
      .min(1, { error: "拠点を選択してください" })
      .uuid({ error: "拠点IDが無効です" }),
    categoryId: z
      .string()
      .uuid({ error: "カテゴリーIDが無効です" })
      .optional()
      .nullable(),
    // 割引設定
    discountType: spaceDiscountTypeSchema.default(DiscountType.none),
    discountValue: z
      .number()
      .min(0, { error: "割引値は0以上で入力してください" })
      .max(1000000, { error: "割引値は1000000以下で入力してください" })
      .optional()
      .nullable(),
    durationDiscountOverride: durationDiscountOverrideSchema.default(
      DurationDiscountOverride.inherit,
    ),
    // 税率設定
    taxRateType: z.enum(TaxRateType).default(TaxRateType.standard),
  })
  .merge(seoOgpFieldsSchema);

/**
 * フォーム入力値の型
 */
export type SpaceFormInput = z.input<typeof spaceFormSchema>;

/**
 * バリデーション後の型
 */
export type SpaceFormData = z.output<typeof spaceFormSchema>;

/**
 * フォームのデフォルト値
 */
export const defaultSpaceFormValues: SpaceFormInput = {
  slug: "",
  name: "",
  description: "",
  addressDetail: "",
  access: "",
  capacity: 10,
  area: null,
  hourlyPrice: 0,
  dailyPrice: null,
  mainImageUrl: "",
  imageUrls: [],
  facilities: [],
  isPublished: false,
  termsId: null,
  locationId: "",
  categoryId: null,
  // 割引設定
  discountType: DiscountType.none,
  discountValue: null,
  durationDiscountOverride: DurationDiscountOverride.inherit,
  // 税率設定
  taxRateType: TaxRateType.standard,
  ...defaultSeoOgpValues,
};

/**
 * スペースセレクト（API / フォーム候補）用の軽量項目
 */
export type SpaceSelectOption = {
  id: string;
  slug: string;
  name: string;
  mainImageUrl: string;
  hourlyPrice: string;
  capacity: number;
};

// =============================================================================
// Server Action 用の型定義
// =============================================================================

/**
 * 予約数を含むスペース型
 */
export type SpaceWithStats = {
  id: string;
  slug: string;
  name: string;
  description: string;
  addressDetail: string | null;
  /** 拠点住所 + addressDetail を結合した表示用1行 */
  displayAddress: string;
  access: string | null;
  capacity: number;
  area: number | null;
  hourlyPrice: number;
  dailyPrice: number | null;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  businessHours: Record<string, unknown> | null;
  isPublished: boolean;
  /** toISOString() 済み ISO 8601 文字列（React 19 RSC 境界シリアライゼーション対応） */
  publishedAt: string | null;
  isActive: boolean;
  /** toISOString() 済み ISO 8601 文字列 */
  createdAt: string;
  /** toISOString() 済み ISO 8601 文字列 */
  updatedAt: string;
  termsId: string | null;
  locationId: string;
  categoryId: string | null;
  /** 一覧・詳細でカテゴリ名表示用（Prisma include） */
  category: { id: string; name: string } | null;
  // 割引設定
  discountType: DiscountType;
  discountValue: number | null;
  durationDiscountOverride: DurationDiscountOverride;
  // 税率設定
  taxRateType: TaxRateType;
  // SEO/OGP
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
  _count: {
    reservations: number;
  };
};

/**
 * スペース一覧取得結果
 */
export type GetSpacesResult = {
  spaces: SpaceWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * スペースフィルター
 */
export type SpaceFilters = {
  isPublished?: boolean | "ALL" | undefined;
  search?: string | undefined;
  locationId?: string | undefined;
  categoryId?: string | undefined;
  uncategorizedOnly?: boolean | undefined;
};

/**
 * スペースページネーション
 */
export type SpacePagination = {
  page?: number;
  limit?: number;
  sortBy?: "name" | "createdAt" | "updatedAt" | "hourlyPrice";
  sortOrder?: "asc" | "desc";
};
