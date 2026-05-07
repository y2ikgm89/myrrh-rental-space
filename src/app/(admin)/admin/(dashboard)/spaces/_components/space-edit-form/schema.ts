/**
 * スペース編集フォームの Zod スキーマ（`spaceFormSchema` を正本とし、RHF 用フィールド形状のみ差し替え）
 */

import type { FieldErrors } from "react-hook-form";
import { z } from "zod";
import {
  spaceDiscountTypeSchema,
  durationDiscountOverrideSchema,
  spaceFormBaseSchema,
  type SpaceFormData,
} from "@/admin/lib/validations/space";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import { seoOgpFieldsFormSchema } from "@/shared/lib/validations/seo";

const spaceEditFormImageUrlsSchema = z
  .array(
    z.object({
      url: z.string().url({ error: "有効なURLを入力してください" }),
    }),
  )
  .max(10, { error: "画像は最大10枚までです" })
  .refine((arr) => new Set(arr.map((item) => item.url)).size === arr.length, {
    error: "同じ画像を複数登録することはできません",
  });

/**
 * 設備配列のフォームスキーマ（構造化 — Airbnb / Booking.com 標準）
 *
 * `useFieldArray` の object 配列要件 + `name` を React key の stable ID として重複禁止。
 * `iconName` は `@/shared/lib/icon-curation` の curation 識別子（空文字 = icon 未指定）。
 */
const spaceEditFormFacilitiesSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(50),
      iconName: z.string().max(64),
    }),
  )
  .refine((arr) => new Set(arr.map((item) => item.name)).size === arr.length, {
    error: "同じ名前の設備を複数登録することはできません",
  });

/**
 * `standardSchemaResolver` / Standard Schema は入出力型一致が必要なため、
 * `spaceFormSchema` の `.default()` 付きフィールドは RHF 用に必須形へ差し替える。
 */
export const spaceEditFormSchema = spaceFormBaseSchema
  .omit({
    imageUrls: true,
    facilities: true,
    isPublished: true,
    reviewsEnabled: true,
    discountType: true,
    durationDiscountOverride: true,
    taxRateType: true,
  })
  .extend({
    ...seoOgpFieldsFormSchema.shape,
    imageUrls: spaceEditFormImageUrlsSchema,
    facilities: spaceEditFormFacilitiesSchema,
    publishedAt: z.string().optional(),
    isPublished: z.boolean(),
    reviewsEnabled: z.boolean(),
    discountType: spaceDiscountTypeSchema,
    durationDiscountOverride: durationDiscountOverrideSchema,
    taxRateType: z.enum(TaxRateType),
  })
  .refine(
    (data) => !data.imageUrls.some((item) => item.url === data.mainImageUrl),
    {
      error: "メイン画像と同じURLを追加画像に登録することはできません",
      path: ["imageUrls"],
    },
  );

export type SpaceEditFormData = z.infer<typeof spaceEditFormSchema>;

/**
 * 編集フォーム状態を Server Action 用の `SpaceFormData` に変換する（`createSpace` / `updateSpace` と同一形状）。
 */
export function spaceEditFormDataToSpaceFormPayload(
  data: SpaceEditFormData,
): SpaceFormData {
  return {
    slug: data.slug,
    name: data.name,
    descriptionJson: data.descriptionJson,
    addressDetail: data.addressDetail || undefined,
    capacity: data.capacity,
    hourlyPrice: data.hourlyPrice,
    mainImageUrl: data.mainImageUrl,
    imageUrls: data.imageUrls.map((f) => f.url),
    facilities: data.facilities.map((f) => ({
      name: f.name,
      iconName: f.iconName,
    })),
    isPublished: data.isPublished ?? false,
    reviewsEnabled: data.reviewsEnabled,
    area: data.area != null ? data.area : undefined,
    dailyPrice: data.dailyPrice != null ? data.dailyPrice : undefined,
    locationId: data.locationId,
    categoryId: data.categoryId || undefined,
    discountType: data.discountType ?? DiscountType.none,
    discountValue:
      data.discountType !== DiscountType.none
        ? (data.discountValue ?? null)
        : null,
    durationDiscountOverride:
      data.durationDiscountOverride ?? DurationDiscountOverride.inherit,
    taxRateType: data.taxRateType ?? TaxRateType.standard,
    metaDescription: data.metaDescription || null,
    metaKeywords: data.metaKeywords || null,
    ogpTitle: data.ogpTitle || null,
    ogpDescription: data.ogpDescription || null,
    ogpImageUrl: data.ogpImageUrl || null,
  };
}

export const SPACE_EDIT_TAB_VALUES = [
  "basic",
  "pricing",
  "media",
  "details",
  "publish",
] as const satisfies [string, ...string[]];

export type SpaceEditTabValue = (typeof SPACE_EDIT_TAB_VALUES)[number];

export const SPACE_EDIT_TAB_LABELS: Record<SpaceEditTabValue, string> = {
  basic: "基本情報",
  pricing: "料金設定",
  media: "メディア",
  details: "詳細設定",
  publish: "公開・SEO",
};

const TAB_FIELDS: Record<SpaceEditTabValue, (keyof SpaceEditFormData)[]> = {
  basic: [
    "name",
    "slug",
    "descriptionJson",
    "locationId",
    "addressDetail",
    "capacity",
    "area",
  ],
  pricing: [
    "hourlyPrice",
    "dailyPrice",
    "discountType",
    "discountValue",
    "durationDiscountOverride",
    "taxRateType",
  ],
  media: ["mainImageUrl", "imageUrls"],
  details: ["categoryId", "facilities"],
  publish: [
    "isPublished",
    "reviewsEnabled",
    "publishedAt",
    "metaDescription",
    "metaKeywords",
    "ogpTitle",
    "ogpDescription",
    "ogpImageUrl",
  ],
};

export function getSpaceEditTabErrorCount(
  errors: FieldErrors<SpaceEditFormData>,
  tab: SpaceEditTabValue,
): number {
  const fields = TAB_FIELDS[tab];
  if (!fields) return 0;
  return fields.filter((field) => !!errors[field]).length;
}

/** Tabs の `onValueChange` から nuqs 用リテラルへ絞り込む */
export function parseSpaceEditTabValue(
  value: string,
): SpaceEditTabValue | null {
  for (const tab of SPACE_EDIT_TAB_VALUES) {
    if (tab === value) return tab;
  }
  return null;
}
