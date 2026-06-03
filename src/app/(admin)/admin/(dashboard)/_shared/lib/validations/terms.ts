import { z } from "zod";
import { TERMS_TYPE_VALUES } from "@/shared/lib/validations/terms";

const slugSchema = z
  .string()
  .min(1, { error: "スラッグを入力してください" })
  .max(50, { error: "スラッグは50文字以内です" })
  .regex(/^[a-z0-9-]+$/u, {
    error: "スラッグは小文字英数字とハイフンのみ使用できます",
  });

const titleSchema = z
  .string()
  .min(1, { error: "タイトルを入力してください" })
  .max(100, { error: "タイトルは100文字以内です" });

const booleanFromCheckbox = z.preprocess(
  (v) => v === "on" || v === true,
  z.boolean().default(false),
);

/**
 * 利用規約 設定フォームスキーマ（SettingsDialog 専用）
 *
 * 本文（contentJson / contentHtml）は含まない。
 * conform `parseWithZod`（FormData 経路）と object literal（テスト経路）両対応の
 * in-place preprocess pattern。isPublished / 各 boolean flag は checkbox value
 * "on" / boolean true を boolean に変換する。
 */
export const termsSettingsFormSchema = z.object({
  type: z
    .string()
    .min(1, { error: "タイプを入力してください" })
    .max(64, { error: "タイプは64文字以内です" })
    .refine(
      (v) =>
        TERMS_TYPE_VALUES.includes(v as (typeof TERMS_TYPE_VALUES)[number]) ||
        /^[a-z0-9-]+$/u.test(v),
      {
        error: "タイプは小文字英数字とハイフンのみ使用できます",
      },
    ),
  slug: slugSchema,
  title: titleSchema,
  isPublished: booleanFromCheckbox,
  requiredAtReservation: booleanFromCheckbox,
  requiredAtInquiry: booleanFromCheckbox,
  requiredAtSignup: booleanFromCheckbox,
  showInFooter: z.preprocess(
    (v) => v === "on" || v === true,
    z.boolean().default(true),
  ),
});

export type TermsSettingsFormData = z.input<typeof termsSettingsFormSchema>;
