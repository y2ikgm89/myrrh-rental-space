import { z } from "zod";
import {
  TIME_REGEX,
  collectBusinessHoursWeekIssues,
} from "@/shared/lib/validations/business-hours";

/**
 * 場所（Location）バリデーションスキーマ
 */

/**
 * BusinessTimeSlotスキーマ（openTime/closeTime）
 */
const businessTimeSlotSchema = z.object({
  openTime: z.string().regex(TIME_REGEX, {
    error: "開店時刻は HH:mm 形式で入力してください",
  }),
  closeTime: z.string().regex(TIME_REGEX, {
    error: "閉店時刻は HH:mm 形式で入力してください",
  }),
});

/**
 * BusinessHoursDayスキーマ（isOpen + slots配列）
 */
const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
});

/**
 * BusinessHoursスキーマ — 各曜日に対して { isOpen, slots }
 *
 * 空 slot / 時刻順序 / 重複チェックは parent schema の `.superRefine()` で実施する
 * （`collectBusinessHoursWeekIssues` で集約）。
 */
const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

// useFieldArray はオブジェクト配列が必須のため { url: string }[] を使用
// Prisma への保存時は Server Action 側で string[] に変換する
//
// 各 URL は React key の stable ID として機能するため、重複を禁止する。
const imageUrlsSchema = z
  .array(
    z.object({ url: z.string().url({ error: "有効なURLを入力してください" }) }),
  )
  .max(10, { error: "画像は最大10枚までです" })
  .refine((arr) => new Set(arr.map((item) => item.url)).size === arr.length, {
    error: "同じ画像を複数登録することはできません",
  })
  .default([]);

export const locationFormSchema = z
  .object({
    name: z
      .string()
      .min(1, { error: "名前を入力してください" })
      .max(100, { error: "名前は100文字以内で入力してください" }),
    description: z
      .string()
      .max(1000, { error: "説明は1000文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    address: z
      .string()
      .min(1, { error: "住所を入力してください" })
      .max(500, { error: "住所は500文字以内で入力してください" }),
    access: z
      .string()
      .max(1000, { error: "アクセス情報は1000文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    imageUrl: z
      .string()
      .min(1, { error: "建物画像URLを入力してください" })
      .url({ error: "有効なURLを入力してください" }),
    imageUrls: imageUrlsSchema,
    businessHours: businessHoursSchema.optional().nullable(),
    sortOrder: z.number().int().min(0).default(0),
    isPublished: z.boolean().default(false),
  })
  .refine(
    (data) => !data.imageUrls.some((item) => item.url === data.imageUrl),
    {
      error: "建物画像と同じURLを追加画像に登録することはできません",
      path: ["imageUrls"],
    },
  )
  .superRefine((data, ctx) => {
    if (data.businessHours) {
      collectBusinessHoursWeekIssues(
        data.businessHours,
        ["businessHours"],
        ctx,
      );
    }
  });

export type LocationFormInput = z.input<typeof locationFormSchema>;
export type LocationFormData = z.output<typeof locationFormSchema>;

export const defaultLocationFormValues: LocationFormInput = {
  name: "",
  description: "",
  address: "",
  access: "",
  imageUrl: "",
  imageUrls: [],
  businessHours: null,
  sortOrder: 0,
  isPublished: false,
};
