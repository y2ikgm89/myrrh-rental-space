import { z } from "zod";
import {
  NavigationType,
  SocialPlatform,
} from "@/shared/lib/validations/enums/prisma-types";
import { portableTextSpanSchema } from "@/shared/lib/portable-text/schema";
import {
  spansToPlainText,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

/**
 * Navigation / SocialLink Dialog (conform) form schemas
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `labelJson` は hidden input から PortableTextSpan[] を JSON.stringify した文字列で送信
 *   → schema 内で JSON.parse + spans 配列 validate (Pattern B)
 * - boolean (`isExternal` / `isActive` / `showOnDesktop` / `showOnMobile`) は Switch +
 *   hidden input で "on" / "" を `z.preprocess` で boolean coerce
 * - `parentId` は Select で "none" → empty string、command 層で null 化
 * - `order` / `type` / `platform` は hidden input
 */

const labelSchema = z
  .string()
  .transform((value, ctx): PortableTextSpan[] => {
    try {
      const parsed = JSON.parse(value);
      const result = z.array(portableTextSpanSchema).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          message: "ラベルの形式が不正です",
        });
        return z.NEVER;
      }
      return result.data;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "ラベルの形式が不正です",
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(portableTextSpanSchema)
      .max(50, { error: "Span は50件以内です" })
      .refine((spans) => spansToPlainText(spans).trim().length > 0, {
        error: "ラベルにテキストを 1 文字以上含めてください",
      }),
  );

const booleanFromCheckbox = z.preprocess(
  (value) => value === "on" || value === true,
  z.boolean(),
);

export const navFormSchema = z.object({
  type: z.enum(NavigationType),
  parentId: z.string(),
  label: labelSchema,
  url: z.string().min(1, { error: "URLは必須です" }),
  isExternal: booleanFromCheckbox,
  order: z.coerce.number({ error: "順序は数値です" }).int().min(0),
  isActive: booleanFromCheckbox,
});

export type NavFormSubmitData = z.output<typeof navFormSchema>;

export const socialFormSchema = z.object({
  platform: z.enum(SocialPlatform),
  url: z
    .string()
    .min(1, { error: "URLは必須です" })
    .url({ error: "有効なURLを入力してください" }),
  order: z.coerce.number({ error: "順序は数値です" }).int().min(0),
  isActive: booleanFromCheckbox,
  showOnDesktop: booleanFromCheckbox,
  showOnMobile: booleanFromCheckbox,
});

export type SocialFormSubmitData = z.output<typeof socialFormSchema>;
