import { z } from "zod";
import { blockedDateTypeSchema } from "@/shared/lib/validations/blocked-date";

/**
 * per-space / per-location 管理タブの追加ダイアログ用フォームスキーマ。
 * scope / spaceId / locationId は Server Action 側で固定注入するため、
 * フォームでは日付範囲・種別・理由のみ受け取る。
 */
export const scopedBlockedDateFormSchema = z
  .object({
    startDate: z.iso.date({ error: "開始日を正しく入力してください" }),
    endDate: z.iso.date({ error: "終了日を正しく入力してください" }),
    reason: z
      .string()
      .max(200, { error: "理由は200文字以内で入力してください" })
      .nullish()
      .transform((value) => (value == null || value === "" ? null : value)),
    type: blockedDateTypeSchema,
  })
  .refine((data) => data.endDate >= data.startDate, {
    error: "終了日は開始日以降の日付を指定してください",
    path: ["endDate"],
  });

export type ScopedBlockedDateFormData = z.infer<
  typeof scopedBlockedDateFormSchema
>;
