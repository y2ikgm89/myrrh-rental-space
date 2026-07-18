import { z } from "zod";

/**
 * `/mypage/terms/reagree` の Zod 4 schema。
 *
 * 各 pending term について checkbox `name="agreedTermsIds" value={termsId}` を出し、
 * parseWithZod が同一 name の複数 value を配列に集約する慣例に従う。
 *
 * `returnTo` は open redirect 対策の [`sanitizeReturnTo`] を Server Action で
 * 通す前提の hidden input。長すぎる値の DoS 抑止と invalid UTF-8 除外のため
 * 512 文字上限を付ける。
 */
export const reagreeFormSchema = z.strictObject({
  agreedTermsIds: z
    .array(z.string().uuid({ error: "不正な規約 ID が含まれています" }))
    .min(1, { error: "同意する規約を選択してください" }),
  returnTo: z.string().max(512).nullable().default(null),
});

export type ReagreeFormInput = z.output<typeof reagreeFormSchema>;
