/**
 * スペース編集フォームの Zod スキーマ（`spaceFormSchema` を正本とし、RHF 用フィールド形状のみ差し替え）
 */

import type { FieldErrors } from "react-hook-form";
import { z } from "zod";
import {
  spaceDiscountTypeSchema,
  durationDiscountOverrideSchema,
  spaceFormSchema,
  type SpaceFormData,
} from "@/admin/lib/validations/space";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@generated/prisma/enums";
import { seoOgpFieldsFormSchema } from "@/shared/lib/validations/seo";

const spaceEditFormImageUrlsSchema = z
  .array(
    z.object({
      url: z.string().url({ error: "有効なURLを入力してください" }),
    }),
  )
  .max(10, { error: "画像は最大10枚までです" });

const spaceEditFormFacilitiesSchema = z.array(
  z.object({ value: z.string().min(1).max(50) }),
);

/**
 * `standardSchemaResolver` / Standard Schema は入出力型一致が必要なため、
 * `spaceFormSchema` の `.default()` 付きフィールドは RHF 用に必須形へ差し替える。
 */
export const spaceEditFormSchema = spaceFormSchema
  .omit({
    imageUrls: true,
    facilities: true,
    isPublished: true,
    reviewsEnabled: true,
    discountType: true,
    durationDiscountOverride: true,
    taxRateType: true,
  })
  .merge(seoOgpFieldsFormSchema)
  .extend({
    imageUrls: spaceEditFormImageUrlsSchema,
    facilities: spaceEditFormFacilitiesSchema,
    publishedAt: z.string().optional(),
    isPublished: z.boolean(),
    reviewsEnabled: z.boolean(),
    discountType: spaceDiscountTypeSchema,
    durationDiscountOverride: durationDiscountOverrideSchema,
    taxRateType: z.enum(TaxRateType),
  });

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
    description: data.description,
    addressDetail: data.addressDetail || undefined,
    capacity: data.capacity,
    hourlyPrice: data.hourlyPrice,
    mainImageUrl: data.mainImageUrl,
    imageUrls: data.imageUrls.map((f) => f.url),
    facilities: data.facilities.map((f) => f.value),
    isPublished: data.isPublished ?? false,
    reviewsEnabled: data.reviewsEnabled ?? true,
    access: data.access || undefined,
    area: data.area != null ? data.area : undefined,
    dailyPrice: data.dailyPrice != null ? data.dailyPrice : undefined,
    termsId: data.termsId || undefined,
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
    "description",
    "locationId",
    "addressDetail",
    "access",
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
  details: ["categoryId", "facilities", "termsId"],
  publish: [
    "isPublished",
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
