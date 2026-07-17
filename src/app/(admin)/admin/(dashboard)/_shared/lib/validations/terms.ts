import { z } from "zod";
import {
  TERMS_SCOPE_VALUES,
  isTermsTypeValue,
} from "@/shared/lib/validations/terms";

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
 * checkbox group の preprocess: FormData は同名フィールドを複数 append すると
 * getAll で string[] になり、conform は単一の場合 string を返す。両者を
 * normalize し TermsScope enum 値のみに narrow する。
 */
const termsScopesField = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return v.length > 0 ? [v] : [];
    return v;
  },
  z
    .array(z.enum(TERMS_SCOPE_VALUES, { error: "不正な scope です" }))
    .default([]),
);

/**
 * 利用規約 設定フォームスキーマ（SettingsDialog 専用）
 *
 * 本文（contentJson / contentHtml）は含まない。
 * conform `parseWithZod`（FormData 経路）と object literal（テスト経路）両対応の
 * in-place preprocess pattern。isPublished / showInFooter は checkbox value
 * "on" / boolean true を boolean に変換する。`scopes` は multi-checkbox の
 * 重複入力を許容しつつ enum 値のみに narrow する。
 */
export const termsSettingsFormSchema = z.strictObject({
  type: z
    .string()
    .min(1, { error: "タイプを入力してください" })
    .max(64, { error: "タイプは64文字以内です" })
    .refine((v) => isTermsTypeValue(v) || /^[a-z0-9-]+$/u.test(v), {
      error: "タイプは小文字英数字とハイフンのみ使用できます",
    }),
  slug: slugSchema,
  title: titleSchema,
  isPublished: booleanFromCheckbox,
  scopes: termsScopesField,
  changelog: z.preprocess(
    (v) => (typeof v === "string" && v.length === 0 ? null : v),
    z.string().max(2000).nullable().default(null),
  ),
  showInFooter: z.preprocess(
    (v) => v === "on" || v === true,
    z.boolean().default(true),
  ),
});

export type TermsSettingsFormData = z.input<typeof termsSettingsFormSchema>;
