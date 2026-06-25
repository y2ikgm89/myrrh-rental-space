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

/**
 * 画像URL配列のバリデーション
 *
 * 各 URL は React key の stable ID として機能するため、重複を禁止する。
 * FormData 送信時は同名 hidden input の `getAll()` で `string[]` になる。
 */
const imageUrlsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : item))
        .filter((item) => typeof item !== "string" || item.length > 0);
    }
    return value;
  },
  z
    .array(z.url({ error: "有効なURLを入力してください" }))
    .max(10, { error: "画像は最大10枚までです" })
    .refine((arr) => new Set(arr).size === arr.length, {
      error: "同じ画像を複数登録することはできません",
    }),
);

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
 * cross-field 検証（mainImageUrl ↔ imageUrls 重複チェック）は含まない。
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
    /**
     * クライアント側 `renderEditorStateJsonToHtmlClient` で事前生成した HTML。
     * 空説明（render エラー時の catch 等）で空文字が来うるが、conform は空入力を undefined 化するため
     * bare `z.string()` だと弾かれる。`.default("")` で空を許容する（descriptionJson が空コンテンツを
     * 許容するのと整合）。
     */
    descriptionHtml: z.string().default(""),
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
    dailyPrice: z
      .preprocess(
        coerceOptionalNumber,
        z.union([
          z.null(),
          z
            .number()
            .min(0, { error: "日額料金は0以上で入力してください" })
            .max(10000000, {
              error: "日額料金は10000000以下で入力してください",
            }),
        ]),
      )
      .optional(),
    mainImageUrl: z
      .string()
      .min(1, { error: "メイン画像URLを入力してください" })
      .url({ error: "有効なURLを入力してください" }),
    imageUrls: imageUrlsSchema,
    facilities: facilitiesFormSchema,
    isPublished: z.preprocess(coerceBoolean, z.boolean()),
    reviewsEnabled: z.preprocess((value) => {
      // 編集フォームでは on/off で送られるが、未指定（チェックボックス未配置）時は
      // default true を維持する。test fixture では明示的に boolean 値を渡す。
      if (value === undefined) return true;
      return value === "on" || value === true;
    }, z.boolean()),
    locationId: z
      .string()
      .min(1, { error: "拠点を選択してください" })
      .uuid({ error: "拠点IDが無効です" }),
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
export const spaceFormSchema = spaceFormBaseSchema.refine(
  (data) => !data.imageUrls.includes(data.mainImageUrl),
  {
    error: "メイン画像と同じURLを追加画像に登録することはできません",
    path: ["imageUrls"],
  },
);

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
  descriptionHtml: "",
  addressDetail: "",
  capacity: 10,
  area: null,
  hourlyPrice: 0,
  dailyPrice: null,
  mainImageUrl: "",
  imageUrls: [],
  facilities: [],
  isPublished: false,
  reviewsEnabled: true,
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
  dailyPrice: number | null;
  mainImageUrl: string;
  imageUrls: string[];
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
