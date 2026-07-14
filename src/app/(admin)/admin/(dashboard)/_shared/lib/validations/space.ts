import { z } from "zod";
import type { PaginationInput } from "@/shared/lib/pagination";
import {
  seoOgpFieldsSchema,
  defaultSeoOgpValues,
} from "@/shared/lib/validations/seo";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  facilitiesSchema,
  type BusinessHours,
} from "@/shared/lib/json-validators";
import { isRecord } from "@/shared/lib/serialize";
import {
  gallerySchema,
  type GalleryItem,
} from "@/shared/lib/validations/gallery";

/**
 * スペースフォーム用バリデーションスキーマ
 *
 * （in-place preprocess pattern、Task 8.6 LocationForm canonical 踏襲）。
 *
 * preprocess は typed value pass-through で no-op、string/FormData 入力時のみ coerce。
 * test fixture（object literal input）と admin form FormData transit を両対応。
 */

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
};

const coerceOptionalNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

const coerceRequiredNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (value === "" || value === null || value === undefined) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

const coerceBoolean = (value: unknown): boolean =>
  value === "on" || value === true;

// gallerySchema は @/shared/lib/validations/gallery からインポートして使用する

/**
 * 設備配列フォーム用スキーマ
 *
 * FormData transit 時は各エントリが JSON 文字列として送信される
 * (`<input type="hidden" name="facilities" value='{"name":"...","iconName":"..."}' />` の append 列)。
 * test fixture では object literal で渡るため、両対応の preprocess を行う。
 */
const facilitiesFormSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed === "") return null;
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (
            isRecord(parsed) &&
            typeof parsed["name"] === "string" &&
            typeof parsed["iconName"] === "string"
          ) {
            return { name: parsed["name"], iconName: parsed["iconName"] };
          }
          return null;
        } catch {
          return null;
        }
      }
      return item;
    })
    .filter((item) => item !== null);
}, facilitiesSchema);

/**
 * スペース割引タイプ
 */
export const spaceDiscountTypeSchema = z.enum(DiscountType);

/**
 * 長時間割引オーバーライド設定
 */
export const durationDiscountOverrideSchema = z.enum(DurationDiscountOverride);

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
 * SEO/OGP optional フィールドの preprocess shape。
 *
 * FormData 送信時は空文字列が来るため null に正規化する。
 * 元の `seoOgpFieldsSchema` は `.nullable().optional()` の string なので、
 * preprocess wrapper でラップして empty-to-null を強制する。
 */
const optionalSeoStringShape = {
  metaDescription: z.preprocess(
    emptyToNull,
    seoOgpFieldsSchema.shape.metaDescription,
  ),
  metaKeywords: z.preprocess(
    emptyToNull,
    seoOgpFieldsSchema.shape.metaKeywords,
  ),
  ogpTitle: z.preprocess(emptyToNull, seoOgpFieldsSchema.shape.ogpTitle),
  ogpDescription: z.preprocess(
    emptyToNull,
    seoOgpFieldsSchema.shape.ogpDescription,
  ),
  ogpImageUrl: z.preprocess(emptyToNull, seoOgpFieldsSchema.shape.ogpImageUrl),
} as const;

/**
 * スペース作成・編集フォームの基底 ZodObject（.refine() 前）
 *
 * cross-field 検証（mainImageUrl ↔ gallery 重複チェック）は含まない。
 * `.omit()` / `.extend()` が必要な派生スキーマはこちらを使う。
 */
export const spaceFormBaseSchema = z
  .object({
    slug: spaceSlugSchema,
    name: z
      .string()
      .min(1, { error: "名前を入力してください" })
      .max(100, { error: "名前は100文字以内で入力してください" }),
    descriptionJson: lexicalJsonSchema,
    addressDetail: z.preprocess(
      (value) => {
        if (typeof value === "string" && value.trim() === "") return undefined;
        return value;
      },
      z
        .string()
        .max(500, { error: "所在地補足は500文字以内で入力してください" })
        .optional(),
    ),
    capacity: z.preprocess(
      coerceRequiredNumber,
      z
        .number()
        .int({ error: "整数を入力してください" })
        .min(1, { error: "定員は1以上で入力してください" })
        .max(1000, { error: "定員は1000以下で入力してください" }),
    ),
    area: z
      .preprocess(
        coerceOptionalNumber,
        z.union([
          z.null(),
          z
            .number()
            .positive({ error: "正の数を入力してください" })
            .max(10000, { error: "面積は10000以下で入力してください" }),
        ]),
      )
      .optional(),
    hourlyPrice: z.preprocess(
      coerceRequiredNumber,
      z
        .number()
        .min(0, { error: "時間料金は0以上で入力してください" })
        .max(1000000, { error: "時間料金は1000000以下で入力してください" }),
    ),
    // 空文字は「必須」エラーを優先する必要がある (top-level z.url() だと URL 形式
    // エラーが先に発火して custom min メッセージが消える)。string chain のまま維持。
    mainImageUrl: z
      .string()
      .min(1, { error: "メイン画像URLを入力してください" })
      .pipe(z.url({ error: "有効なURLを入力してください" })),
    gallery: gallerySchema,
    facilities: facilitiesFormSchema,
    isPublished: z.preprocess(coerceBoolean, z.boolean()),
    reviewsEnabled: z.preprocess((value) => {
      // 編集フォームでは on/off で送られるが、未指定（チェックボックス未配置）時は
      // 新規スペースの opt-in default false を維持する。
      if (value === undefined) return false;
      return value === "on" || value === true;
    }, z.boolean()),
    locationId: z
      .string()
      .min(1, { error: "拠点を選択してください" })
      .pipe(z.uuid({ error: "拠点IDが無効です" })),
    categoryId: z
      .preprocess(
        emptyToNull,
        z.uuid({ error: "カテゴリーIDが無効です" }).nullable(),
      )
      .optional(),
    // 割引設定
    discountType: spaceDiscountTypeSchema.default(DiscountType.none),
    discountValue: z
      .preprocess(
        coerceOptionalNumber,
        z.union([
          z.null(),
          z
            .number()
            .min(0, { error: "割引値は0以上で入力してください" })
            .max(1000000, { error: "割引値は1000000以下で入力してください" }),
        ]),
      )
      .optional(),
    durationDiscountOverride: durationDiscountOverrideSchema.default(
      DurationDiscountOverride.inherit,
    ),
    // 税率設定
    taxRateType: z.enum(TaxRateType).default(TaxRateType.standard),
  })
  .extend(optionalSeoStringShape);

/**
 * スペース作成・編集フォームスキーマ（cross-field 検証付き）
 *
 * Server Action の safeParse で使用。
 */
export const spaceFormSchema = spaceFormBaseSchema
  .refine((data) => !data.gallery.some((g) => g.url === data.mainImageUrl), {
    error: "メイン画像とギャラリーで同じ画像は使えません",
    path: ["gallery"],
  })
  .superRefine((data, ctx) => {
    if (
      data.discountType === DiscountType.percentage &&
      data.discountValue !== null &&
      data.discountValue !== undefined &&
      data.discountValue > 100
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "パーセント割引は100以下で入力してください",
      });
    }
  });

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
  descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
  addressDetail: "",
  capacity: 10,
  area: null,
  hourlyPrice: 0,
  mainImageUrl: "",
  gallery: [],
  facilities: [],
  isPublished: false,
  reviewsEnabled: false,
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
  /** Lexical EditorState JSON（toPlainObject 通過後の任意 JSON 値） */
  descriptionJson: unknown;
  /** Lexical からレンダ済み HTML キャッシュ（公開表示用） */
  descriptionHtml: string;
  /** SEO description / カード要約用プレーンテキスト派生 */
  descriptionPlainText: string;
  addressDetail: string | null;
  /** 拠点住所 + addressDetail を結合した表示用1行 */
  displayAddress: string;
  capacity: number;
  area: number | null;
  hourlyPrice: number;
  mainImageUrl: string;
  gallery: GalleryItem[];
  facilities: { name: string; iconName: string }[];
  businessHours: BusinessHours | null;
  isPublished: boolean;
  /** toISOString() 済み ISO 8601 文字列（React 19 RSC 境界シリアライゼーション対応） */
  publishedAt: string | null;
  isActive: boolean;
  reviewsEnabled: boolean;
  /** toISOString() 済み ISO 8601 文字列 */
  createdAt: string;
  /** toISOString() 済み ISO 8601 文字列 */
  updatedAt: string;
  locationId: string;
  categoryId: string | null;
  /** 割り当てられたスマートロックデバイス（同一 Location 配下の登録簿から選択） */
  smartLockDeviceId: string | null;
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
export type SpacePagination = PaginationInput<
  "name" | "createdAt" | "updatedAt" | "hourlyPrice"
>;
