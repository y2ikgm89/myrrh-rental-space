import { z } from "zod";
import {
  NavigationType,
  SocialPlatform,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  bareSpanArraySchema,
  portableTextSpanSchema,
} from "@/shared/lib/portable-text/schema";
import {
  spansToPlainText,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import {
  externalPublicHrefSchema,
  isExternalPublicHref,
  isInternalNavHref,
} from "@/shared/lib/url/safe-href";

/**
 * Navigation / SocialLink Dialog (conform) form schemas
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `labelJson` は hidden input から PortableTextSpan[] を JSON.stringify した文字列で送信
 *   → schema 内で JSON.parse + spans 配列 validate (Pattern B)
 * - boolean (`isExternal` / `isActive` / `showOnDesktop` / `showOnMobile`) は Switch +
 *   hidden input で "on" / "" を `z.preprocess` で boolean coerce
 * - `parentId` は Select で "none" / 空文字 → `z.preprocess` で null、UUID は検証
 * - `type` / `platform` は hidden input
 * - `order` は create/update 入力から除外し、domain 層の自動採番と reorder action に閉じる
 */

const labelSchema = z
  .string()
  .transform((value, ctx): PortableTextSpan[] => {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = bareSpanArraySchema.safeParse(parsed);
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

export const navFormSchema = z
  .strictObject({
    type: z.enum(NavigationType),
    parentId: z.preprocess(
      (value) => (value === "none" || value === "" ? null : value),
      z.uuid().nullable(),
    ),
    label: labelSchema,
    // `.trim()` は貼り付けに紛れた前後の空白を正規化するため。無いと
    // `isExternalPublicHref` を通って保存され、描画側の `toSafePublicHref` が
    // 弾いてリンクが href 無しになる（safe-href.ts の `hasSurroundingWhitespace`）。
    url: z.string().trim().min(1, { error: "URLは必須です" }),
    isExternal: booleanFromCheckbox,
    isActive: booleanFromCheckbox,
  })
  .superRefine((data, ctx) => {
    if (data.isExternal) {
      if (!isExternalPublicHref(data.url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message:
            "外部リンクは http(s) / mailto / tel の URL を指定してください（javascript: 等は不可）",
        });
      }
    } else if (!isInternalNavHref(data.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "内部リンクは / から始まるパスを指定してください",
      });
    }
  });

export type NavFormSubmitData = z.output<typeof navFormSchema>;

export const socialFormSchema = z.strictObject({
  platform: z.enum(SocialPlatform),
  url: externalPublicHrefSchema,
  isActive: booleanFromCheckbox,
  showOnDesktop: booleanFromCheckbox,
  showOnMobile: booleanFromCheckbox,
});

export type SocialFormSubmitData = z.output<typeof socialFormSchema>;
