import { z } from "zod";
import {
  portableTextSpanSchema,
  spansToPlainText,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

/**
 * BarDialog (conform) form schema
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `messageJson` は hidden input から PortableTextSpan[] を JSON.stringify した文字列で送信
 *   → schema 内で JSON.parse + spans 配列 validate
 * - `isActive` は Switch + hidden input で "on" / "" を boolean coerce
 * - `priority` は `z.coerce.number()` で string → number
 * - `linkUrl` / `linkText` は空文字を許容 (server 側で null 化)
 * - `startAt` / `endAt` は `<input type="datetime-local">` の "YYYY-MM-DDTHH:mm" 形式
 *
 * 空 → null 変換は Server Action の executor が legacy `normalizeAnnouncementBarInput`
 * に委譲（command 層で `parseDateTimeLocalAsJst` を通す）。
 */

const messageSchema = z
  .string()
  .transform((value, ctx): PortableTextSpan[] => {
    try {
      const parsed = JSON.parse(value);
      const result = z.array(portableTextSpanSchema).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          message: "メッセージの形式が不正です",
        });
        return z.NEVER;
      }
      return result.data;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "メッセージの形式が不正です",
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(portableTextSpanSchema)
      .max(30, { error: "Span は30件以内です" })
      .refine((spans) => spansToPlainText(spans).trim().length > 0, {
        error: "メッセージにテキストを 1 文字以上含めてください",
      })
      .refine((spans) => spansToPlainText(spans).length <= 200, {
        error: "メッセージは200文字以内で入力してください",
      }),
  );

export const barFormSchema = z.object({
  message: messageSchema,
  linkUrl: z.url({ error: "有効なURLを入力してください" }).or(z.literal("")),
  linkText: z.string().max(50, { error: "リンクテキストは50文字以内" }),
  isActive: z.preprocess(
    (value) => value === "on" || value === true,
    z.boolean(),
  ),
  priority: z.coerce
    .number({ error: "優先度は数値です" })
    .int()
    .min(0, { error: "優先度は0以上です" })
    .max(100, { error: "優先度は100以下です" }),
  startAt: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" })
    .or(z.literal("")),
  endAt: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" })
    .or(z.literal("")),
});

export type BarFormSubmitData = z.infer<typeof barFormSchema>;
