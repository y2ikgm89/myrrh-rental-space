import { z } from "zod";
import { SLUG_REGEX } from "./params";
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
const businessHoursWeekSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

// conform の form.insert/remove はオブジェクト配列が必須のため { url: string }[] を使用
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

export const locationFormBaseSchema = z.object({
  name: z
    .string()
    .min(1, { error: "名前を入力してください" })
    .max(100, { error: "名前は100文字以内で入力してください" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(255, { error: "スラッグは255文字以内で入力してください" })
    .regex(SLUG_REGEX, {
      error: "スラッグは小文字英数字とハイフンのみ使用できます",
    }),
  description: z
    .string()
    .max(2000, { error: "説明は2000文字以内で入力してください" })
    .nullable()
    .optional(),
  address: z
    .string()
    .min(1, { error: "住所を入力してください" })
    .max(500, { error: "住所は500文字以内で入力してください" }),
  postalCode: z
    .string()
    .max(10, { error: "郵便番号は10文字以内で入力してください" })
    .nullable()
    .optional(),
  prefecture: z
    .string()
    .max(20, { error: "都道府県は20文字以内で入力してください" })
    .nullable()
    .optional(),
  city: z
    .string()
    .max(100, { error: "市区町村は100文字以内で入力してください" })
    .nullable()
    .optional(),
  streetAddress: z
    .string()
    .max(200, { error: "番地は200文字以内で入力してください" })
    .nullable()
    .optional(),
  buildingName: z
    .string()
    .max(100, { error: "建物名は100文字以内で入力してください" })
    .nullable()
    .optional(),
  // conform の form.insert/remove 用に object 配列。各 entry は 1 経路（最寄り駅 + 出口 + 徒歩分数 等）
  accessLines: z
    .array(
      z.object({
        value: z
          .string()
          .min(1, { error: "経路を入力してください" })
          .max(200, { error: "1 行 200 文字以内で入力してください" }),
      }),
    )
    .max(20, { error: "経路は 20 件以内で入力してください" })
    .default([]),
  parkingInfo: z
    .string()
    .max(1000, { error: "駐車場案内は1000文字以内で入力してください" })
    .nullable()
    .optional(),
  amenities: z
    .record(
      z.string(),
      z.preprocess((value) => value === "on" || value === true, z.boolean()),
    )
    .default({}),
  imageUrl: z
    .string()
    .min(1, { error: "建物画像URLを入力してください" })
    .url({ error: "有効なURLを入力してください" }),
  imageUrls: imageUrlsSchema,
  businessHours: z.preprocess((value) => {
    if (typeof value === "string") {
      if (value === "" || value === "null") return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }, businessHoursWeekSchema.nullable().optional()),
  specialHolidays: z.preprocess((value) => {
    if (typeof value === "string") {
      if (value === "" || value === "null") return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }, z.array(z.string()).nullable().optional()),
  // MEO フィールド (conform FormData transit 対応 preprocess)
  latitude: z
    .preprocess(
      (value) =>
        value === "" || value === null || value === undefined
          ? null
          : typeof value === "number"
            ? value
            : Number(value),
      z.union([
        z.null(),
        z
          .number()
          .min(-90, { error: "緯度は -90 以上である必要があります" })
          .max(90, { error: "緯度は 90 以下である必要があります" }),
      ]),
    )
    .optional(),
  longitude: z
    .preprocess(
      (value) =>
        value === "" || value === null || value === undefined
          ? null
          : typeof value === "number"
            ? value
            : Number(value),
      z.union([
        z.null(),
        z
          .number()
          .min(-180, { error: "経度は -180 以上である必要があります" })
          .max(180, { error: "経度は 180 以下である必要があります" }),
      ]),
    )
    .optional(),
  googleBusinessPlaceId: z
    .string()
    .max(100, {
      error: "Google Business Place ID は100文字以内で入力してください",
    })
    .nullable()
    .optional(),
  googleReviewUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .nullable()
    .optional(),
  priceRange: z
    .string()
    .max(100, { error: "価格帯は100文字以内で入力してください" })
    .nullable()
    .optional(),
  paymentAccepted: z
    .string()
    .max(500, { error: "支払い方法は500文字以内で入力してください" })
    .nullable()
    .optional(),
  phoneNumber: z
    .string()
    .max(30, { error: "電話番号は30文字以内で入力してください" })
    .nullable()
    .optional(),
  email: z
    .string()
    .email({ error: "有効なメールアドレスを入力してください" })
    .nullable()
    .optional(),
  // sortOrder はシステム管理（D&D 並び替えが SSoT、手動入力なし）
  isPublished: z
    .preprocess((value) => value === "on" || value === true, z.boolean())
    .default(false),
  isActive: z
    .preprocess(
      (value) =>
        value === "on" ||
        value === true ||
        value === undefined ||
        value === null,
      z.boolean(),
    )
    .default(true),
});

export const locationFormSchema = locationFormBaseSchema
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
  slug: "",
  description: "",
  address: "",
  postalCode: "",
  prefecture: "",
  city: "",
  streetAddress: "",
  buildingName: "",
  accessLines: [],
  parkingInfo: "",
  amenities: {},
  imageUrl: "",
  imageUrls: [],
  businessHours: null,
  specialHolidays: null,
  latitude: null,
  longitude: null,
  googleBusinessPlaceId: "",
  googleReviewUrl: "",
  priceRange: "",
  paymentAccepted: "",
  phoneNumber: "",
  email: "",
  isPublished: false,
  isActive: true,
};
