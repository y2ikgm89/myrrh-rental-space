import { z } from "zod";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import { TERMS_TYPE_VALUES } from "@/shared/lib/validations/terms";

/**
 * TermsForm (conform) form schema — Phase 1 Task 8.3
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `contentJson` (Lexical EditorState JSON string) は hidden input で transit
 * - `contentHtml` は client-side で `renderEditorStateJsonToHtmlClient()` で生成 →
 *   hidden input で送信
 * - boolean (`isPublished` / `requiredAt*` / `showInFooter`) は Switch + hidden input
 *   で "on" / "" を `z.preprocess` で boolean coerce
 * - `footerOrder` は `z.coerce.number()`
 * - `type` は `z.enum(TERMS_TYPE_VALUES)`
 */

const booleanFromCheckbox = z.preprocess(
  (value) => value === "on" || value === true,
  z.boolean(),
);

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

export const termsFormSchema = z.object({
  type: z.enum(TERMS_TYPE_VALUES),
  slug: slugSchema,
  title: titleSchema,
  contentJson: lexicalJsonSchema,
  /** クライアント側 `renderEditorStateJsonToHtmlClient` で事前生成した HTML */
  contentHtml: z.string(),
  isPublished: booleanFromCheckbox,
  requiredAtReservation: booleanFromCheckbox,
  requiredAtInquiry: booleanFromCheckbox,
  requiredAtSignup: booleanFromCheckbox,
  showInFooter: booleanFromCheckbox,
  footerOrder: z.coerce
    .number({ error: "表示順は数値です" })
    .int({ error: "整数で入力してください" })
    .min(0, { error: "0以上で入力してください" })
    .max(999, { error: "999以下で入力してください" }),
});

export type TermsFormSubmitData = z.output<typeof termsFormSchema>;
